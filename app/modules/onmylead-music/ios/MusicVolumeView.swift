import ExpoModulesCore
import MediaPlayer
import UIKit

// The system volume slider (MPVolumeView), the way Apple lets apps change the phone's volume.
// The Music sheet's − and + buttons move this same slider, so it only works while it is on screen.
public final class MusicVolumeView: ExpoView {
  private static weak var shown: MusicVolumeView?
  private let volumeView = MPVolumeView(frame: .zero)

  var tint: UIColor? {
    didSet { applyTint() }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    volumeView.showsRouteButton = false
    addSubview(volumeView)
    MusicVolumeView.shown = self
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { MusicVolumeView.shown = self }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    let h = max(volumeView.sizeThatFits(bounds.size).height, 34)
    volumeView.frame = CGRect(x: 0, y: (bounds.height - h) / 2, width: bounds.width, height: h)
    applyTint()
  }

  private var slider: UISlider? {
    volumeView.subviews.compactMap { $0 as? UISlider }.first
  }

  private func applyTint() {
    guard let s = slider, let t = tint else { return }
    s.minimumTrackTintColor = t
    s.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.22)
  }

  static func setSystemVolume(_ value: Float) {
    guard let v = shown, v.window != nil, let s = v.slider else { return }
    s.setValue(max(0, min(1, value)), animated: false)
    s.sendActions(for: .valueChanged)
  }
}
