import CarPlay
import UIKit

// Named for Objective-C so Info.plist can point at it without knowing the pod's module name
// (plugins/with-carplay.js adds the CarPlay scene that uses it).
@objc(OMLCarPlaySceneDelegate)
public class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    CarPlayBridge.shared.connect(interfaceController)
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    CarPlayBridge.shared.disconnect()
  }

  // Navigation apps (CarPlay Navigation entitlement) get a window to draw the map in. Without
  // the map switched on (CarMapScreen.available) the bridge ignores the window and shows the
  // Driving Task screens, so this is safe in every build.
  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController,
    to window: CPWindow
  ) {
    CarPlayBridge.shared.connect(interfaceController, window: window)
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnect interfaceController: CPInterfaceController,
    from window: CPWindow
  ) {
    CarPlayBridge.shared.disconnect()
  }
}
