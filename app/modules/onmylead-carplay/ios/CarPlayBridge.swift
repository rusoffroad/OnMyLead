import CarPlay
import UIKit

struct RideButton: Equatable {
  let id: String
  let title: String
  let symbol: String
}

struct RiderRow: Equatable {
  let title: String
  let detail: String
}

/// The car screen's fixed words in the rider's language (carPlayLabels in src/core/carplay.ts).
/// English until the phone sends them.
struct CarPlayLabels: Equatable {
  var waitingTitle = "No Ride Running"
  var waitingDetail = "Open Ride Mode or Map Mode on your phone and it shows up here."
  var group = "Group"
  var nobodySharing = "Nobody Is Sharing Yet"
  var confirmEmergency = "Send EMERGENCY with your location to everyone on the ride?"
  var alertGroup = "Alert My Group"
  var cancel = "Cancel"
  var ok = "OK"
  /// The waiting screen's button. Empty hides it (on Free, CarPlay is Pro: nothing to open).
  var openMapMode = "Open Map Mode"
  /// Car map (Navigation builds): the bar button that opens the ride's one-tap buttons.
  var ride = "Ride"
  /// Car map: the bar button that opens Map Mode's readouts.
  var dash = "Dash"
  /// Free plan: the car map shows the Pro notice instead of the map.
  var proNeeded = false
  /// The Messages button and screen.
  var messages = "Messages"
  var reply = "Reply"
  var replyDetail = "Send a quick reply to the group"
  var noMessages = "No Messages Yet"
  var tapToHear = "Tap a message to hear it."
  /// Exit (3.1): takes the phone out of Ride Mode or Map Mode.
  var exit = "Exit"
  var exitRideMode = "Exit Ride Mode"
  var exitRideConfirm = "Exit Ride Mode? You stay on the ride, and your phone keeps sharing your spot."
  var exitMapConfirm = "Exit Map Mode? Your recording pauses until you come back."

  init() {}

  init(_ d: [String: Any]?) {
    func word(_ key: String, _ fallback: String) -> String {
      guard let s = d?[key] as? String, !s.isEmpty else { return fallback }
      return s
    }
    let en = CarPlayLabels()
    waitingTitle = word("waitingTitle", en.waitingTitle)
    waitingDetail = word("waitingDetail", en.waitingDetail)
    group = word("group", en.group)
    nobodySharing = word("nobodySharing", en.nobodySharing)
    confirmEmergency = word("confirmEmergency", en.confirmEmergency)
    alertGroup = word("alertGroup", en.alertGroup)
    cancel = word("cancel", en.cancel)
    ok = word("ok", en.ok)
    // Unlike the other words, an empty one is kept: it means "no button".
    openMapMode = d?["openMapMode"] as? String ?? en.openMapMode
    ride = word("ride", en.ride)
    dash = word("dash", en.dash)
    proNeeded = d?["proNeeded"] as? Bool ?? false
    messages = word("messages", en.messages)
    reply = word("reply", en.reply)
    replyDetail = word("replyDetail", en.replyDetail)
    noMessages = word("noMessages", en.noMessages)
    tapToHear = word("tapToHear", en.tapToHear)
    exit = word("exit", en.exit)
    exitRideMode = word("exitRideMode", en.exitRideMode)
    exitRideConfirm = word("exitRideConfirm", en.exitRideConfirm)
    exitMapConfirm = word("exitMapConfirm", en.exitMapConfirm)
  }
}

/// What Ride Mode on the phone last sent (shape: CarPlayState in src/core/carplay.ts).
struct RideState: Equatable {
  let title: String
  let buttons: [RideButton]
  let riders: [RiderRow]
  let alertId: String?
  let alertText: String?
  let labels: CarPlayLabels?

  init(_ d: [String: Any]) {
    labels = d["labels"] == nil ? nil : CarPlayLabels(d["labels"] as? [String: Any])
    title = d["title"] as? String ?? "OnMyLead"
    buttons = (d["buttons"] as? [[String: Any]] ?? []).compactMap { b in
      guard let id = b["id"] as? String, let title = b["title"] as? String else { return nil }
      return RideButton(id: id, title: title, symbol: b["symbol"] as? String ?? "circle.fill")
    }
    riders = (d["riders"] as? [[String: Any]] ?? []).map {
      RiderRow(title: $0["title"] as? String ?? "Rider", detail: $0["detail"] as? String ?? "")
    }
    let alert = d["alert"] as? [String: Any]
    alertId = alert?["id"] as? String
    alertText = alert?["text"] as? String
  }
}

/// The ride's messages and one-tap replies (shape: messages / replies on CarPlayState). Kept apart
/// from RideState so a new message refreshes the Messages screen without redrawing the grid.
struct RideMessages: Equatable {
  let messages: [RideButton]
  let replies: [RideButton]

  init(_ d: [String: Any]) {
    messages = (d["messages"] as? [[String: Any]] ?? []).compactMap { m in
      guard let id = m["id"] as? String else { return nil }
      // title: the sender; symbol carries the preview (RideButton is just three strings).
      return RideButton(id: id, title: m["title"] as? String ?? "", symbol: m["detail"] as? String ?? "")
    }
    replies = (d["replies"] as? [[String: Any]] ?? []).compactMap { b in
      guard let id = b["id"] as? String, let title = b["title"] as? String else { return nil }
      return RideButton(id: id, title: title, symbol: b["symbol"] as? String ?? "text.bubble.fill")
    }
  }

  init() {
    messages = []
    replies = []
  }
}

/// What Map Mode on the phone last sent (shape: CarPlayMapState in src/core/carplay.ts).
struct MapState: Equatable {
  let title: String
  let items: [RiderRow]
  let actions: [RideButton]
  let labels: CarPlayLabels?

  init(_ d: [String: Any]) {
    labels = d["labels"] == nil ? nil : CarPlayLabels(d["labels"] as? [String: Any])
    title = d["title"] as? String ?? "Map Mode"
    items = (d["items"] as? [[String: Any]] ?? []).map {
      RiderRow(title: $0["title"] as? String ?? "", detail: $0["detail"] as? String ?? "")
    }
    actions = (d["actions"] as? [[String: Any]] ?? []).compactMap { b in
      guard let id = b["id"] as? String, let title = b["title"] as? String else { return nil }
      return RideButton(id: id, title: title, symbol: b["symbol"] as? String ?? "")
    }
  }
}

/// Owns the CarPlay templates. Everything here runs on the main thread.
final class CarPlayBridge {
  static let shared = CarPlayBridge()

  var emit: ((String) -> Void)?
  private(set) var interface: CPInterfaceController?
  private(set) var state: RideState?
  private var grid: CPGridTemplate?
  /// Map Mode's dash, when no ride is on the car screen.
  private(set) var mapState: MapState?
  /// What the car map draws for the ride and for Map Mode (CarMapData; ignored without the map).
  private(set) var rideMap: CarMapData?
  private(set) var modeMap: CarMapData?
  /// The car map (CarPlay Navigation entitlement), when the car gave us a window to draw in.
  private var mapScreen: CarMapScreen?
  private var mapInfo: CPInformationTemplate?
  private var mapInfoTitle: String?
  private var shownAlertId: String?
  private(set) var labels = CarPlayLabels()
  private(set) var rideMessages = RideMessages()
  /// The Messages screen while it is open, refreshed as messages come in.
  private weak var messagesList: CPListTemplate?

  func setLabels(_ next: CarPlayLabels) {
    guard next != labels else { return }
    labels = next
    if let mapScreen { mapScreen.refresh(); return }
    // The waiting screen is the only one built from labels alone; redraw it in the new language.
    if state == nil { render() }
  }

  /// `window`: the car's map window, which iOS hands only to navigation apps. With it (and the map
  /// switched on in Info.plist, plugins/with-carplay.js) the car screen is the map; without it the
  /// Driving Task screens below.
  func connect(_ interface: CPInterfaceController, window: UIWindow? = nil) {
    if mapScreen != nil, self.interface === interface { return }
    self.interface = interface
    grid = nil
    mapInfo = nil
    mapScreen?.tearDown()
    mapScreen = nil
    if let window, CarMapScreen.available {
      let screen = CarMapScreen(bridge: self, interface: interface, window: window)
      mapScreen = screen
      screen.refresh()
      return
    }
    render()
  }

  func disconnect() {
    mapScreen?.tearDown()
    mapScreen = nil
    interface = nil
    grid = nil
    mapInfo = nil
  }

  /// Map Mode on the phone. A ride on the car screen wins; the dash shows once the ride clears.
  func updateMap(_ next: MapState?, map: CarMapData? = nil) {
    if let mapScreen {
      modeMap = next == nil ? nil : map
      mapState = next
      if let l = next?.labels { labels = l }
      mapScreen.refresh()
      return
    }
    guard next != mapState else { return }
    if let l = next?.labels { labels = l }
    mapState = next
    guard interface != nil, state == nil else { return }
    if let next, let mapInfo, mapInfoTitle == next.title {
      mapInfo.items = infoItems(next)
      mapInfo.actions = infoActions(next)
    } else {
      render()
    }
  }

  func update(_ next: RideState?, map: CarMapData? = nil, messages: RideMessages = RideMessages()) {
    if messages != rideMessages {
      rideMessages = messages
      messagesList?.updateSections(messageSections())
    }
    if let mapScreen {
      rideMap = next == nil ? nil : map
      if next?.alertId == nil { shownAlertId = nil }
      if let l = next?.labels { labels = l }
      state = next
      mapScreen.refresh()
      return
    }
    guard next != state else { return }
    if let l = next?.labels { labels = l }
    let hadRide = state != nil
    state = next
    // Once the problem clears, the same rider separating again alerts again.
    if next?.alertId == nil { shownAlertId = nil }
    guard interface != nil else { return }
    if let next, hadRide, let grid {
      grid.updateTitle(next.title)
      grid.updateGridButtons(gridButtons(next))
      showAlertIfNew(next)
    } else {
      render()
    }
  }

  private func render() {
    guard let interface else { return }
    guard let state else {
      grid = nil
      if let mapState {
        let dash = CPInformationTemplate(
          title: mapState.title,
          layout: .twoColumn,
          items: infoItems(mapState),
          actions: infoActions(mapState)
        )
        mapInfo = dash
        mapInfoTitle = mapState.title
        interface.setRootTemplate(dash, animated: false, completion: nil)
        return
      }
      mapInfo = nil
      var actions: [CPTextButton] = []
      if !labels.openMapMode.isEmpty {
        actions.append(CPTextButton(title: labels.openMapMode, textStyle: .confirm) { [weak self] _ in
          self?.emit?("open:map")
        })
      }
      let waiting = CPInformationTemplate(
        title: "OnMyLead",
        layout: .leading,
        items: [CPInformationItem(title: labels.waitingTitle, detail: labels.waitingDetail)],
        actions: actions
      )
      interface.setRootTemplate(waiting, animated: false, completion: nil)
      return
    }
    mapInfo = nil
    let template = CPGridTemplate(title: state.title, gridButtons: gridButtons(state))
    template.leadingNavigationBarButtons = [exitRideButton()]
    template.trailingNavigationBarButtons = [messagesButton()]
    grid = template
    interface.setRootTemplate(template, animated: false, completion: nil)
    showAlertIfNew(state)
  }

  private func infoItems(_ map: MapState) -> [CPInformationItem] {
    map.items.prefix(10).map { CPInformationItem(title: $0.title, detail: $0.detail) }
  }

  private func infoActions(_ map: MapState) -> [CPTextButton] {
    map.actions.prefix(3).map { b in
      CPTextButton(title: b.title, textStyle: .normal) { [weak self] _ in
        if b.id == "map:exit" { self?.exitMap() } else { self?.emit?(b.id) }
      }
    }
  }

  /// Exit on the ride grid (and the car map's bar): asks first, then the phone leaves Ride Mode.
  /// The rider stays on the ride.
  func exitRideButton() -> CPBarButton {
    CPBarButton(title: labels.exit) { [weak self] _ in self?.confirmExitRide() }
  }

  func confirmExitRide() {
    let exit = CPAlertAction(title: labels.exitRideMode, style: .default) { [weak self] _ in
      self?.emit?("ride:exit")
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    let cancel = CPAlertAction(title: labels.cancel, style: .cancel) { [weak self] _ in
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    present(CPAlertTemplate(titleVariants: [labels.exitRideConfirm], actions: [exit, cancel]))
  }

  /// Map Mode's Exit: straight away, or ask first while a recording runs (it pauses).
  func exitMap() {
    let recording = mapState?.actions.contains { $0.id == "map:pause" } ?? false
    guard recording else { emit?("map:exit"); return }
    let exit = CPAlertAction(title: labels.exit, style: .default) { [weak self] _ in
      self?.emit?("map:exit")
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    let cancel = CPAlertAction(title: labels.cancel, style: .cancel) { [weak self] _ in
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    present(CPAlertTemplate(titleVariants: [labels.exitMapConfirm], actions: [exit, cancel]))
  }

  func gridButtons(_ state: RideState) -> [CPGridButton] {
    state.buttons.prefix(8).map { b in
      let image = UIImage(systemName: b.symbol) ?? UIImage(systemName: "circle.fill") ?? UIImage()
      return CPGridButton(titleVariants: [b.title], image: image) { [weak self] _ in
        self?.tapped(b.id)
      }
    }
  }

  private func tapped(_ id: String) {
    switch id {
    case "group":
      showGroup()
    case "emergency":
      confirmEmergency()
    default:
      emit?(id)
    }
  }

  func messagesButton() -> CPBarButton {
    CPBarButton(title: labels.messages) { [weak self] _ in self?.showMessages() }
  }

  /// The ride's messages: Reply first, then the newest messages. Tap one to hear it (the phone
  /// reads it out in the rider's voice). Nothing to type: Apple doesn't allow typing in the car.
  func showMessages() {
    guard let interface, state != nil else { return }
    let list = CPListTemplate(title: labels.messages, sections: messageSections())
    messagesList = list
    interface.pushTemplate(list, animated: true, completion: nil)
  }

  private func messageSections() -> [CPListSection] {
    let reply = CPListItem(text: labels.reply, detailText: labels.replyDetail, image: UIImage(systemName: "arrowshape.turn.up.left.fill"))
    reply.handler = { [weak self] _, done in
      self?.showReplies()
      done()
    }
    let items: [CPListItem] = rideMessages.messages.map { m in
      let item = CPListItem(text: m.title, detailText: m.symbol)
      item.handler = { [weak self] _, done in
        self?.emit?("hear:\(m.id)")
        done()
      }
      return item
    }
    let list = items.isEmpty ? [CPListItem(text: labels.noMessages, detailText: nil)] : items
    return [CPListSection(items: [reply]), CPListSection(items: list, header: labels.tapToHear, sectionIndexTitle: nil)]
  }

  private func showReplies() {
    guard let interface else { return }
    let items: [CPListItem] = rideMessages.replies.map { r in
      let item = CPListItem(text: r.title, detailText: nil, image: UIImage(systemName: r.symbol))
      item.handler = { [weak self] _, done in
        self?.emit?(r.id)
        done()
        // Back to the messages, where the reply shows up once it's sent.
        self?.interface?.popTemplate(animated: true, completion: nil)
      }
      return item
    }
    interface.pushTemplate(CPListTemplate(title: labels.reply, sections: [CPListSection(items: items)]), animated: true, completion: nil)
  }

  func showGroup() {
    guard let interface, let state else { return }
    let items = state.riders.map { CPListItem(text: $0.title, detailText: $0.detail) }
    let list = CPListTemplate(title: labels.group, sections: [CPListSection(items: items)])
    list.emptyViewTitleVariants = [labels.nobodySharing]
    interface.pushTemplate(list, animated: true, completion: nil)
  }

  func confirmEmergency() {
    let send = CPAlertAction(title: labels.alertGroup, style: .destructive) { [weak self] _ in
      self?.emit?("emergency_confirmed")
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    let cancel = CPAlertAction(title: labels.cancel, style: .cancel) { [weak self] _ in
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    present(CPAlertTemplate(titleVariants: [labels.confirmEmergency], actions: [send, cancel]))
  }

  func showAlertIfNew(_ state: RideState) {
    guard let id = state.alertId, let text = state.alertText, id != shownAlertId else { return }
    shownAlertId = id
    let ok = CPAlertAction(title: labels.ok, style: .default) { [weak self] _ in
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    present(CPAlertTemplate(titleVariants: [text], actions: [ok]))
  }

  /// CarPlay shows one alert at a time; replace whatever is up.
  private func present(_ template: CPTemplate) {
    guard let interface else { return }
    if interface.presentedTemplate != nil {
      interface.dismissTemplate(animated: false) { _, _ in
        interface.presentTemplate(template, animated: true, completion: nil)
      }
    } else {
      interface.presentTemplate(template, animated: true, completion: nil)
    }
  }
}
