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
}
