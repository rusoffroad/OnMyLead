import CoreBluetooth
import ExpoModulesCore

// JavaScript side: src/lib/radio.ts. Protocol: src/core/meshtastic.ts.
//
// Radio Sharing: connects to the rider's own Meshtastic radio over Bluetooth, as a client of the
// radio's Meshtastic service. This file is only the Bluetooth link. It never reads a message: it
// writes the bytes JavaScript gives it to the radio's ToRadio characteristic, and hands every
// FromRadio message to JavaScript.
//
// The flow (meshtastic.org client API): connect, find the service and its three characteristics,
// subscribe to FromNum, then read FromRadio until it comes back empty, after every write and every
// FromNum notification. iOS picks the largest Bluetooth packet size by itself.
//
// Separate from Bluetooth Sharing (modules/onmylead-nearby) on purpose: its own central manager,
// created only when JavaScript first asks, so a build where Radio Sharing is off never touches it.
public class OnMyLeadMeshRadioModule: Module {
  private var link: MeshRadioLink?

  public func definition() -> ModuleDefinition {
    Name("OnMyLeadMeshRadio")
    Events("onDevice", "onState", "onFromRadio")

    Function("isSupported") { true }

    // service, toRadio, fromRadio, fromNum: the UUIDs (core/meshtastic.ts).
    Function("configure") { (service: String, toRadio: String, fromRadio: String, fromNum: String) in
      if self.link != nil { return }
      let l = MeshRadioLink(
        service: CBUUID(string: service), toRadio: CBUUID(string: toRadio),
        fromRadio: CBUUID(string: fromRadio), fromNum: CBUUID(string: fromNum))
      l.onDevice = { [weak self] id, name, rssi in self?.sendEvent("onDevice", ["id": id, "name": name, "rssi": rssi]) }
      l.onState = { [weak self] state, id in self?.sendEvent("onState", ["state": state, "id": id ?? ""]) }
      l.onFromRadio = { [weak self] b64 in self?.sendEvent("onFromRadio", ["data": b64]) }
      self.link = l
    }

    Function("startScan") { self.link?.startScan() }
    Function("stopScan") { self.link?.stopScan() }
    Function("connect") { (id: String) in self.link?.connect(id: id) }
    Function("disconnect") { self.link?.disconnect() }
    Function("write") { (b64: String) in
      if let d = Data(base64Encoded: b64) { self.link?.write(d) }
    }
    Function("getState") { () -> String in self.link?.currentState() ?? "idle" }

    OnDestroy {
      self.link?.disconnect()
      self.link = nil
    }
  }
}

final class MeshRadioLink: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  private static let maxQueue = 64
  private static let maxReadsPerDrain = 64

  private let service: CBUUID
  private let toRadio: CBUUID
  private let fromRadio: CBUUID
  private let fromNum: CBUUID
  private let queue = DispatchQueue(label: "com.rusoffroad.onmylead.meshradio")

  private var central: CBCentralManager?
  private var peripheral: CBPeripheral?
  private var toChar: CBCharacteristic?
  private var fromChar: CBCharacteristic?
  private var numChar: CBCharacteristic?
  /** The radio JavaScript wants: kept connected (iOS reconnects when it comes back in range). */
  private var wantedId: UUID?
  private var scanning = false
  private var state = "idle"
  /** Writes waiting for the one before them to finish. */
  private var writes: [Data] = []
  private var writing = false
  private var reading = false
  private var readsLeft = 0
  private var readAgain = false

  var onDevice: ((String, String, Int) -> Void)?
  var onState: ((String, String?) -> Void)?
  var onFromRadio: ((String) -> Void)?

  init(service: CBUUID, toRadio: CBUUID, fromRadio: CBUUID, fromNum: CBUUID) {
    self.service = service
    self.toRadio = toRadio
    self.fromRadio = fromRadio
    self.fromNum = fromNum
  }

  func currentState() -> String {
    queue.sync { state }
  }

  private func ensureCentral() {
    if central == nil {
      // Creating it shows the Bluetooth question if it was never answered.
      central = CBCentralManager(delegate: self, queue: queue, options: [CBCentralManagerOptionShowPowerAlertKey: false])
    }
  }

  private func setState(_ s: String) {
    state = s
    onState?(s, peripheral?.identifier.uuidString)
  }

  func startScan() {
    queue.async {
      self.scanning = true
      self.ensureCentral()
      if self.central?.state == .poweredOn {
        self.central?.scanForPeripherals(withServices: [self.service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
      }
    }
  }

  func stopScan() {
    queue.async {
      self.scanning = false
      self.central?.stopScan()
    }
  }

  func connect(id: String) {
    queue.async {
      guard let uuid = UUID(uuidString: id) else { return }
      self.wantedId = uuid
      self.ensureCentral()
      self.connectWanted()
    }
  }

  func disconnect() {
    queue.async {
      self.wantedId = nil
      self.writes.removeAll()
      if let p = self.peripheral { self.central?.cancelPeripheralConnection(p) }
      self.reset()
      self.setState("idle")
    }
  }

  func write(_ data: Data) {
    queue.async {
      guard self.toChar != nil else { return }
      if self.writes.count >= MeshRadioLink.maxQueue { self.writes.removeFirst() }
      self.writes.append(data)
      self.pump()
    }
  }

  private func reset() {
    peripheral?.delegate = nil
    peripheral = nil
    toChar = nil
    fromChar = nil
    numChar = nil
    writing = false
    reading = false
    readAgain = false
  }

  private func connectWanted() {
    guard let c = central, c.state == .poweredOn, let id = wantedId else { return }
    if let p = peripheral, p.identifier == id, p.state != .disconnected { return }
    guard let p = c.retrievePeripherals(withIdentifiers: [id]).first else {
      setState("not_found")
      return
    }
    reset()
    peripheral = p
    p.delegate = self
    setState("connecting")
    // No timeout: iOS keeps trying until the radio is in range, even with the app in the background.
    c.connect(p, options: nil)
  }

  // MARK: Central

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      if scanning {
        central.scanForPeripherals(withServices: [service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
      }
      connectWanted()
    case .unauthorized:
      setState("unauthorized")
    case .poweredOff:
      reset()
      setState("off")
    case .unsupported:
      setState("unsupported")
    default:
      break
    }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name ?? ""
    onDevice?(peripheral.identifier.uuidString, name, RSSI.intValue)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    guard peripheral == self.peripheral else { return }
    peripheral.discoverServices([service])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    guard peripheral == self.peripheral else { return }
    reset()
    setState("disconnected")
    queue.asyncAfter(deadline: .now() + 5) { [weak self] in self?.connectWanted() }
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    guard peripheral == self.peripheral else { return }
    reset()
    setState(wantedId == nil ? "idle" : "disconnected")
    // Still wanted: connect again (waits quietly until the radio is back in range).
    if wantedId != nil { connectWanted() }
  }

  // MARK: Peripheral

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let s = peripheral.services?.first(where: { $0.uuid == service }) else {
      setState("not_meshtastic")
      central?.cancelPeripheralConnection(peripheral)
      return
    }
    peripheral.discoverCharacteristics([toRadio, fromRadio, fromNum], for: s)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    for c in service.characteristics ?? [] {
      if c.uuid == toRadio { toChar = c }
      if c.uuid == fromRadio { fromChar = c }
      if c.uuid == fromNum { numChar = c }
    }
    guard toChar != nil, fromChar != nil, let num = numChar else {
      setState("not_meshtastic")
      central?.cancelPeripheralConnection(peripheral)
      return
    }
    // Subscribing to an encrypted characteristic shows iOS's pairing prompt (the radio's PIN) the first time.
    peripheral.setNotifyValue(true, for: num)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    guard characteristic.uuid == fromNum else { return }
    if error != nil {
      // Usually a wrong or cancelled PIN.
      setState("pairing_failed")
      central?.cancelPeripheralConnection(peripheral)
      return
    }
    setState("connected")
    drain()
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if characteristic.uuid == fromNum {
      drain()
      return
    }
    guard characteristic.uuid == fromRadio else { return }
    reading = false
    let value = characteristic.value ?? Data()
    if error != nil || value.isEmpty {
      // Empty: caught up. A notification that came in meanwhile reads again.
      if readAgain { readAgain = false; drain() }
      return
    }
    onFromRadio?(value.base64EncodedString())
    readsLeft -= 1
    if readsLeft > 0 {
      readNext()
    } else {
      // A burst bigger than one drain: carry on next time round without starving writes.
      queue.async { [weak self] in self?.drain() }
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    guard characteristic.uuid == toRadio else { return }
    writing = false
    // The radio may have answered (a config download, a queue status): read it.
    drain()
    pump()
  }

  private func pump() {
    guard !writing, !writes.isEmpty, let p = peripheral, let c = toChar, p.state == .connected else { return }
    writing = true
    let next = writes.removeFirst()
    p.writeValue(next, for: c, type: .withResponse)
  }

  private func drain() {
    guard fromChar != nil else { return }
    if reading { readAgain = true; return }
    readsLeft = MeshRadioLink.maxReadsPerDrain
    readNext()
  }

  private func readNext() {
    guard let p = peripheral, let c = fromChar, p.state == .connected else { return }
    reading = true
    p.readValue(for: c)
  }
}
