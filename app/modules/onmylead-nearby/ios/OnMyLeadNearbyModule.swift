import CoreBluetooth
import ExpoModulesCore

// JavaScript side: src/lib/nearby.ts. Packet format and encryption: src/core/nearby.ts.
//
// Bluetooth Sharing: with no cell service, nearby OnMyLead phones pass small encrypted ride
// packets to each other. This file is only the radio. It never reads a packet (they are encrypted
// with a key only the ride's riders have); it hands what it receives to JavaScript and sends what
// JavaScript gives it.
//
// Every phone is both sides at once, so any two phones that find each other can talk both ways
// over one connection, whichever of them found the other:
// - Peripheral: advertises the OnMyLead service. Its "inbox" characteristic takes writes; its
//   "outbox" characteristic notifies subscribed phones.
// - Central: scans for the service, connects (at most MAX_PEERS), writes to their inbox and
//   subscribes to their outbox.
// A locked iPhone can still be found by another iPhone scanning for this exact service, and keeps
// sending while iOS lets the app run (Ride Mode's location sharing keeps it running).
public class OnMyLeadNearbyModule: Module {
  private var radio: NearbyRadio?

  public func definition() -> ModuleDefinition {
    Name("OnMyLeadNearby")
    Events("onFrame", "onState")

    Function("isSupported") { true }

    Function("start") { (service: String, inbox: String, outbox: String) in
      if self.radio != nil { return }
      let radio = NearbyRadio(service: CBUUID(string: service), inbox: CBUUID(string: inbox), outbox: CBUUID(string: outbox))
      radio.onFrame = { [weak self] b64 in self?.sendEvent("onFrame", ["data": b64]) }
      radio.onState = { [weak self] state, peers in self?.sendEvent("onState", ["state": state, "peers": peers]) }
      self.radio = radio
      radio.start()
    }

    Function("stop") {
      self.radio?.stop()
      self.radio = nil
    }

    Function("setOutgoing") { (frames: [String]) in
      self.radio?.setOutgoing(frames.compactMap { Data(base64Encoded: $0) })
    }

    Function("sendNow") { (frames: [String]) in
      self.radio?.sendNow(frames.compactMap { Data(base64Encoded: $0) })
    }

    // "normal" or "low" (core/nearby.ts nearbyPower): how often the radio sends and looks for phones.
    Function("setPower") { (level: String) in
      self.radio?.setPower(low: level == "low")
    }

    Function("drain") { () -> [String] in
      self.radio?.drain() ?? []
    }

    Function("getState") { () -> [String: Any] in
      self.radio?.snapshot() ?? ["state": "off", "peers": 0]
    }

    OnDestroy {
      self.radio?.stop()
      self.radio = nil
    }
  }
}

final class NearbyRadio: NSObject, CBCentralManagerDelegate, CBPeripheralManagerDelegate, CBPeripheralDelegate {
  private static let maxPeers = 8
  private static let roundSeconds = 4.0
  private static let rescanSeconds = 30.0
  // Low power (service, nobody in range, or Max Battery Saver): send and look less often. Phones
  // that connect are still served at once, so a rider coming into range is not kept waiting.
  private static let lowRoundSeconds = 10.0
  private static let lowRescanSeconds = 90.0
  private static let maxBuffered = 500
  private static let maxPendingNotify = 64

  private let service: CBUUID
  private let inbox: CBUUID
  private let outbox: CBUUID
  private let queue = DispatchQueue(label: "com.rusoffroad.onmylead.nearby")

  private var central: CBCentralManager?
  private var peripheral: CBPeripheralManager?
  private var outboxChar: CBMutableCharacteristic?
  private var serviceAdded = false

  /// Phones this one connected to, by identifier.
  private var peers: [UUID: CBPeripheral] = [:]
  private var peerInbox: [UUID: CBCharacteristic] = [:]
  /// Phones that connected to this one and subscribed to the outbox.
  private var subscribers: [UUID: CBCentral] = [:]
  /**
   * Frames still to notify subscribers with: the send queue was full, and iOS says when it has room.
   * Urgent ones (taps, messages, receipts sent at once) go first and stay until sent; the round's
   * own frames are replaced by each new round, which carries everything still worth sending.
   */
  private var pendingUrgent: [Data] = []
  private var pendingRound: [Data] = []

  private var outgoing: [Data] = []
  private var received: [String] = []
  private var timer: DispatchSourceTimer?
  private var lastScan = Date.distantPast
  private var state = "starting"
  private var low = false

  var onFrame: ((String) -> Void)?
  var onState: ((String, Int) -> Void)?

  init(service: CBUUID, inbox: CBUUID, outbox: CBUUID) {
    self.service = service
    self.inbox = inbox
    self.outbox = outbox
  }

  func start() {
    queue.async {
      // Creating the managers shows the Bluetooth permission prompt the first time.
      self.central = CBCentralManager(delegate: self, queue: self.queue)
      self.peripheral = CBPeripheralManager(delegate: self, queue: self.queue)
      self.schedule()
    }
  }

  private func schedule() {
    timer?.cancel()
    let every = low ? NearbyRadio.lowRoundSeconds : NearbyRadio.roundSeconds
    let t = DispatchSource.makeTimerSource(queue: queue)
    t.schedule(deadline: .now() + every, repeating: every)
    t.setEventHandler { [weak self] in self?.round() }
    t.resume()
    timer = t
  }

  func setPower(low: Bool) {
    queue.async {
      guard self.low != low else { return }
      self.low = low
      if self.timer != nil { self.schedule() }
    }
  }

  func stop() {
    queue.async {
      self.timer?.cancel()
      self.timer = nil
      if let c = self.central {
        if c.state == .poweredOn { c.stopScan() }
        for p in self.peers.values { c.cancelPeripheralConnection(p) }
      }
      if let p = self.peripheral, p.state == .poweredOn {
        p.stopAdvertising()
        p.removeAllServices()
      }
      self.peers.removeAll()
      self.peerInbox.removeAll()
      self.subscribers.removeAll()
      self.pendingUrgent.removeAll()
      self.pendingRound.removeAll()
      self.outgoing.removeAll()
      self.central = nil
      self.peripheral = nil
    }
  }

  func setOutgoing(_ frames: [Data]) {
    queue.async { self.outgoing = frames }
  }

  func sendNow(_ frames: [Data]) {
    queue.async { self.send(frames, urgent: true) }
  }

  func drain() -> [String] {
    queue.sync {
      let out = received
      received.removeAll()
      return out
    }
  }

  func snapshot() -> [String: Any] {
    queue.sync { ["state": state, "peers": peerCount()] }
  }

  // MARK: - Rounds

  // A phone can be connected both ways (iOS gives it a different id for each), so this is the
  // larger of the two counts, a fair "riders in range" number.
  private func peerCount() -> Int {
    max(peerInbox.count, subscribers.count)
  }

  private func round() {
    // Scanning without duplicates reports each phone once per scan, so start a fresh scan now and
    // then to find phones that dropped out and came back.
    let rescan = low ? NearbyRadio.lowRescanSeconds : NearbyRadio.rescanSeconds
    if let c = central, c.state == .poweredOn, Date().timeIntervalSince(lastScan) > rescan {
      c.stopScan()
      scan()
    }
    if let pm = peripheral, pm.state == .poweredOn, !serviceAdded { peripheralManagerDidUpdateState(pm) }
    send(outgoing)
  }

  /**
   * Writes until CoreBluetooth's send queue for that phone is full, and leaves the rest to the next
   * round (which carries everything again), so a slow link never builds a backlog and a tap sent
   * at once doesn't wait behind old rounds.
   */
  private func write(_ frames: [Data], to p: CBPeripheral, _ ch: CBCharacteristic) {
    for f in frames {
      guard p.canSendWriteWithoutResponse else { return }
      if f.count <= p.maximumWriteValueLength(for: .withoutResponse) { p.writeValue(f, for: ch, type: .withoutResponse) }
    }
  }

  /**
   * A round (urgent false) carries everything still worth sending, so it replaces what subscribers
   * hadn't been sent yet; an urgent send (a tap, a message, a receipt) goes ahead of it.
   */
  private func send(_ frames: [Data], urgent: Bool = false) {
    // An empty round still goes through: it clears what subscribers hadn't been sent yet.
    guard !frames.isEmpty || !urgent else { return }
    for (id, ch) in peerInbox {
      guard let p = peers[id], p.state == .connected else { continue }
      write(frames, to: p, ch)
    }
    guard !subscribers.isEmpty else { return }
    let batch = Array(frames.prefix(NearbyRadio.maxPendingNotify))
    if urgent {
      pendingUrgent.append(contentsOf: batch)
      // Too much waiting: the oldest urgent frames make room (each also goes out in later rounds).
      if pendingUrgent.count > NearbyRadio.maxPendingNotify {
        pendingUrgent.removeFirst(pendingUrgent.count - NearbyRadio.maxPendingNotify)
      }
    } else {
      pendingRound = batch
    }
    drainNotify()
  }

  /** Notifies subscribers until iOS's send queue is full; peripheralManagerIsReady picks up the rest. */
  private func drainNotify() {
    guard let pm = peripheral, let ch = outboxChar else { return }
    if subscribers.isEmpty {
      pendingUrgent.removeAll()
      pendingRound.removeAll()
      return
    }
    while let f = pendingUrgent.first ?? pendingRound.first {
      let fits = subscribers.values.filter { f.count <= $0.maximumUpdateValueLength }
      if !fits.isEmpty && !pm.updateValue(f, for: ch, onSubscribedCentrals: fits) { return }
      if !pendingUrgent.isEmpty { pendingUrgent.removeFirst() } else { pendingRound.removeFirst() }
    }
  }

  private func deliver(_ data: Data) {
    let b64 = data.base64EncodedString()
    if received.count >= NearbyRadio.maxBuffered { received.removeFirst() }
    received.append(b64)
    onFrame?(b64)
  }

  private func report(_ s: String? = nil) {
    if let s = s { state = s }
    onState?(state, peerCount())
  }

  private static func stateName(_ s: CBManagerState) -> String {
    switch s {
    case .poweredOn: return "on"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    default: return "off"
    }
  }

  // MARK: - Central

  private func scan() {
    lastScan = Date()
    central?.scanForPeripherals(withServices: [service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
  }

  func centralManagerDidUpdateState(_ c: CBCentralManager) {
    if c.state == .poweredOn { scan() } else {
      peers.removeAll()
      peerInbox.removeAll()
    }
    report(NearbyRadio.stateName(c.state))
  }

  func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
    guard peers[p.identifier] == nil, peers.count < NearbyRadio.maxPeers else { return }
    peers[p.identifier] = p
    p.delegate = self
    c.connect(p, options: nil)
  }

  func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
    p.discoverServices([service])
  }

  func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
    peers[p.identifier] = nil
    peerInbox[p.identifier] = nil
  }

  func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
    peers[p.identifier] = nil
    peerInbox[p.identifier] = nil
    report()
  }

  func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    guard let s = p.services?.first(where: { $0.uuid == service }) else {
      central?.cancelPeripheralConnection(p)
      return
    }
    p.discoverCharacteristics([inbox, outbox], for: s)
  }

  func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    for ch in s.characteristics ?? [] {
      if ch.uuid == inbox { peerInbox[p.identifier] = ch }
      if ch.uuid == outbox { p.setNotifyValue(true, for: ch) }
    }
    report()
    // A new phone gets everything at once rather than waiting for the next round; the others
    // carry on with theirs.
    if let ch = peerInbox[p.identifier], p.state == .connected { write(outgoing, to: p, ch) }
  }

  func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
    if ch.uuid == outbox, let v = ch.value { deliver(v) }
  }

  // MARK: - Peripheral

  func peripheralManagerDidUpdateState(_ pm: CBPeripheralManager) {
    guard pm.state == .poweredOn else {
      serviceAdded = false
      subscribers.removeAll()
      pendingUrgent.removeAll()
      pendingRound.removeAll()
      return
    }
    guard !serviceAdded else { return }
    let inboxChar = CBMutableCharacteristic(type: inbox, properties: [.write, .writeWithoutResponse], value: nil, permissions: [.writeable])
    let out = CBMutableCharacteristic(type: outbox, properties: [.notify], value: nil, permissions: [.readable])
    let s = CBMutableService(type: service, primary: true)
    s.characteristics = [inboxChar, out]
    outboxChar = out
    pm.add(s)
    serviceAdded = true
  }

  func peripheralManager(_ pm: CBPeripheralManager, didAdd s: CBService, error: Error?) {
    guard error == nil else {
      // Not ready yet (often right after Bluetooth turns on): the next round adds it again.
      pm.removeAllServices()
      serviceAdded = false
      return
    }
    // No name in the advertisement: other phones see only that an OnMyLead phone is near.
    pm.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [service]])
  }

  func peripheralManager(_ pm: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    for r in requests where r.characteristic.uuid == inbox {
      if let v = r.value { deliver(v) }
    }
    if let first = requests.first { pm.respond(to: first, withResult: .success) }
  }

  func peripheralManager(_ pm: CBPeripheralManager, central: CBCentral, didSubscribeTo ch: CBCharacteristic) {
    subscribers[central.identifier] = central
    report()
    // Only the new phone gets the round at once (until iOS's queue is full; the next round brings
    // the rest); the others carry on with theirs.
    guard let out = outboxChar else { return }
    for f in outgoing where f.count <= central.maximumUpdateValueLength {
      if !pm.updateValue(f, for: out, onSubscribedCentrals: [central]) { break }
    }
  }


  func peripheralManagerIsReady(toUpdateSubscribers pm: CBPeripheralManager) {
    drainNotify()
  }

  func peripheralManager(_ pm: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom ch: CBCharacteristic) {
    subscribers[central.identifier] = nil
    if subscribers.isEmpty {
      pendingUrgent.removeAll()
      pendingRound.removeAll()
    }
    report()
  }
}
