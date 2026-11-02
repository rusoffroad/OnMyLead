import AVFoundation
import ExpoModulesCore
import MediaPlayer
import UIKit

// JavaScript side: src/lib/music.ts, read by src/core/music.ts.
//
// Apple lets an app control only the system music player (Apple Music) and the system volume.
// Other apps, like Spotify, can't be paused or skipped from here; their volume can.
// Nothing read here leaves the phone.
public class OnMyLeadMusicModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OnMyLeadMusic")

    AsyncFunction("getState") { () -> [String: Any] in
      let session = AVAudioSession.sharedInstance()
      let player = MPMusicPlayerController.systemMusicPlayer
      let auth = MPMediaLibrary.authorizationStatus()
      let state = player.playbackState
      let applePlaying = state == .playing
      var out: [String: Any] = [
        "applePlaying": applePlaying,
        "appleHasItem": state == .playing || state == .paused,
        "otherAudio": session.isOtherAudioPlaying,
        "volume": Double(session.outputVolume),
        "access": auth == .authorized ? "granted" : auth == .notDetermined ? "ask" : "denied",
      ]
      // Song names need the rider's OK for the media library (NSAppleMusicUsageDescription).
      if auth == .authorized, let item = player.nowPlayingItem {
        out["appleHasItem"] = true
        if let t = item.title { out["title"] = t }
        if let a = item.artist { out["artist"] = a }
      }
      return out
    }.runOnQueue(.main)

    AsyncFunction("requestAccess") { (promise: Promise) in
      MPMediaLibrary.requestAuthorization { status in
        promise.resolve(status == .authorized)
      }
    }

    AsyncFunction("command") { (name: String) in
      let player = MPMusicPlayerController.systemMusicPlayer
      switch name {
      case "toggle":
        if player.playbackState == .playing { player.pause() } else { player.play() }
      case "next":
        player.skipToNextItem()
      case "previous":
        // Like the Music app: back to the start first, the song before on a second tap.
        if player.currentPlaybackTime > 3 { player.skipToBeginning() } else { player.skipToPreviousItem() }
      default:
        break
      }
    }.runOnQueue(.main)

    AsyncFunction("setVolume") { (value: Double) in
      MusicVolumeView.setSystemVolume(Float(value))
    }.runOnQueue(.main)

    AsyncFunction("openAccessSettings") {
      if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url)
      }
    }.runOnQueue(.main)

    View(MusicVolumeView.self) {
      Prop("tint") { (view: MusicVolumeView, color: UIColor?) in
        view.tint = color
      }
    }
  }
}
