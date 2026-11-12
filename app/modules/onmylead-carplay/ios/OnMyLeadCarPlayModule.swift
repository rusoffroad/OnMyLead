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

    Function("clearRide") {
      DispatchQueue.main.async { CarPlayBridge.shared.update(nil) }
    }
  }
}
