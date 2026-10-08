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

/// What Ride Mode on the phone last sent (shape: CarPlayState in src/core/carplay.ts).
struct RideState: Equatable {
  let title: String
  let buttons: [RideButton]
  let riders: [RiderRow]
  let alertId: String?
  let alertText: String?

  init(_ d: [String: Any]) {
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
        items: [CPInformationItem(title: "No ride running", detail: "Open Ride Mode on your phone and your group shows up here.")],
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
    let list = CPListTemplate(title: "Group", sections: [CPListSection(items: items)])
    list.emptyViewTitleVariants = ["Nobody is sharing yet"]
    interface.pushTemplate(list, animated: true, completion: nil)
  }

  private func confirmEmergency() {
    let send = CPAlertAction(title: "Alert my group", style: .destructive) { [weak self] _ in
      self?.emit?("emergency_confirmed")
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    let cancel = CPAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
      self?.interface?.dismissTemplate(animated: true, completion: nil)
    }
    present(CPAlertTemplate(titleVariants: ["Send EMERGENCY with your location to everyone on the ride?"], actions: [send, cancel]))
  }

  private func showAlertIfNew(_ state: RideState) {
    guard let id = state.alertId, let text = state.alertText, id != shownAlertId else { return }
    shownAlertId = id
    let ok = CPAlertAction(title: "OK", style: .default) { [weak self] _ in
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
