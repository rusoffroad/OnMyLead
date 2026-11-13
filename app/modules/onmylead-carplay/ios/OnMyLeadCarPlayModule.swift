import ExpoModulesCore

// JavaScript side: src/lib/carplay.ts. Ride Mode and Map Mode send their state here; button presses on the
// car screen come back as "onAction" events with the button id.
public class OnMyLeadCarPlayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OnMyLeadCarPlay")

    Events("onAction")

    OnStartObserving {
      CarPlayBridge.shared.emit = { [weak self] id in
        self?.sendEvent("onAction", ["id": id])
      }
    }

    OnStopObserving {
      CarPlayBridge.shared.emit = nil
    }

    Function("setRide") { (state: [String: Any]) in
      // The map rides along with the ride (CarMapData); builds without the car map ignore it.
      let map = CarMapData(state["map"])
      let messages = RideMessages(state)
      DispatchQueue.main.async { CarPlayBridge.shared.update(RideState(state), map: map, messages: messages) }
    }

    Function("setLabels") { (labels: [String: Any]) in
      DispatchQueue.main.async { CarPlayBridge.shared.setLabels(CarPlayLabels(labels)) }
    }

    Function("setMap") { (state: [String: Any]) in
      let map = CarMapData(state["map"])
      DispatchQueue.main.async { CarPlayBridge.shared.updateMap(MapState(state), map: map) }
    }

    Function("clearMap") {
      DispatchQueue.main.async { CarPlayBridge.shared.updateMap(nil) }
    }

    // 3.1: the Map Features the car map draws and the Layers screen's rows.
    Function("setTrails") { (data: [String: Any]) in
      let trails = CarTrailsData(data)
      DispatchQueue.main.async { CarPlayBridge.shared.setTrails(trails) }
    }

    // 3.1: what the car's home screen offers (Open Ride Mode while sharing on a ride).
    Function("setHome") { (data: [String: Any]) in
      let sharing = data["sharingRide"] as? Bool ?? false
      DispatchQueue.main.async { CarPlayBridge.shared.setHome(sharingRide: sharing) }
    }

    // 3.1: the rider's group chats, and the one open on the car.
    Function("setChats") { (data: [String: Any]) in
      let rows: [RideButton] = (data["chats"] as? [[String: Any]] ?? []).compactMap { c in
        guard let id = c["id"] as? String else { return nil }
        return RideButton(id: id, title: c["title"] as? String ?? "", symbol: c["detail"] as? String ?? "")
      }
      DispatchQueue.main.async { CarPlayBridge.shared.setChats(rows) }
    }

    Function("setChat") { (data: [String: Any]) in
      let chat = CarChatData(data)
      DispatchQueue.main.async { CarPlayBridge.shared.setChat(chat) }
    }

    Function("clearRide") {
      DispatchQueue.main.async { CarPlayBridge.shared.update(nil) }
    }
  }
}
