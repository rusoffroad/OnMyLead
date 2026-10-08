import ExpoModulesCore

// JavaScript side: src/lib/carplay.ts. Ride Mode sends its state here; button presses on the
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
      DispatchQueue.main.async { CarPlayBridge.shared.update(RideState(state)) }
    }

    Function("clearRide") {
      DispatchQueue.main.async { CarPlayBridge.shared.update(nil) }
    }
  }
}
