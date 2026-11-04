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
  var waitingDetail = "Open Ride Mode on your phone and your group shows up here."
  var group = "Group"
  var nobodySharing = "Nobody Is Sharing Yet"
  var confirmEmergency = "Send EMERGENCY with your location to everyone on the ride?"
  var alertGroup = "Alert My Group"
  var cancel = "Cancel"
  var ok = "OK"

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

/// Owns the CarPlay templates. Everything here runs on the main thread.
final class CarPlayBridge {
  static let shared = CarPlayBridge()

  var emit: ((String) -> Void)?
  private var interface: CPInterfaceController?
  private var state: RideState?
  private var grid: CPGridTemplate?
  private var shownAlertId: String?
  private var labels = CarPlayLabels()

  func setLabels(_ next: CarPlayLabels) {
    guard next != labels else { return }
    labels = next
    // The waiting screen is the only one built from labels alone; redraw it in the new language.
    if state == nil { render() }
  }

  func connect(_ interface: CPInterfaceController) {
    self.interface = interface
    grid = nil
    render()
  }

  func disconnect() {
    interface = nil
    grid = nil
  }

  func update(_ next: RideState?) {
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
      let waiting = CPInformationTemplate(
        title: "OnMyLead",
        layout: .leading,
        items: [CPInformationItem(title: labels.waitingTitle, detail: labels.waitingDetail)],
        actions: []
      )
      interface.setRootTemplate(waiting, animated: false, completion: nil)
      return
    }
    let template = CPGridTemplate(title: state.title, gridButtons: gridButtons(state))
    grid = template
    interface.setRootTemplate(template, animated: false, completion: nil)
    showAlertIfNew(state)
  }

  private func gridButtons(_ state: RideState) -> [CPGridButton] {
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

  private func showGroup() {
    guard let interface, let state else { return }
    let items = state.riders.map { CPListItem(text: $0.title, detailText: $0.detail) }
    let list = CPListTemplate(title: labels.group, sections: [CPListSection(items: items)])
    list.emptyViewTitleVariants = [labels.nobodySharing]
    interface.pushTemplate(list, animated: true, completion: nil)
  }

  private func confirmEmergency() {
    let send = CPAlertAction(title: labels.alertGroup, style: .destructive) { [weak self] _ in
      self?.emit?("emergency_confirmed")
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    let cancel = CPAlertAction(title: labels.cancel, style: .cancel) { [weak self] _ in
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    present(CPAlertTemplate(titleVariants: [labels.confirmEmergency], actions: [send, cancel]))
  }

  private func showAlertIfNew(_ state: RideState) {
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
