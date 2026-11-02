package com.rusoffroad.onmylead.music

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.view.KeyEvent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

// JavaScript side: src/lib/music.ts, read by src/core/music.ts.
//
// Play/pause/skip go to whichever app is playing (Spotify, YouTube Music, Apple Music...): through
// its media session when the rider allowed Notification Access, otherwise as the media keys a
// headset sends. Volume is the phone's media volume. Nothing read here leaves the phone.
class OnMyLeadMusicModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val audio: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  override fun definition() = ModuleDefinition {
    Name("OnMyLeadMusic")

    AsyncFunction("getState") {
      val out = mutableMapOf<String, Any?>()
      val access = hasAccess()
      out["access"] = access
      out["playing"] = audio.isMusicActive
      out["volume"] = volume()
      val c = controller()
      if (c != null) {
        out["hasSession"] = true
        out["package"] = c.packageName
        out["appName"] = appLabel(c.packageName)
        out["playing"] = c.playbackState?.state == PlaybackState.STATE_PLAYING
        val m = c.metadata
        if (m != null) {
          out["title"] = m.getString(MediaMetadata.METADATA_KEY_TITLE)
          out["artist"] = m.getString(MediaMetadata.METADATA_KEY_ARTIST)
            ?: m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
        }
      }
      out
    }

    AsyncFunction("command") { name: String ->
      val c = controller()
      if (c != null) {
        val t = c.transportControls
        when (name) {
          "toggle" -> if (c.playbackState?.state == PlaybackState.STATE_PLAYING) t.pause() else t.play()
          "next" -> t.skipToNext()
          "previous" -> t.skipToPrevious()
        }
      } else {
        when (name) {
          "toggle" -> key(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
          "next" -> key(KeyEvent.KEYCODE_MEDIA_NEXT)
          "previous" -> key(KeyEvent.KEYCODE_MEDIA_PREVIOUS)
        }
      }
    }

    AsyncFunction("setVolume") { value: Double ->
      val a = audio
      if (!a.isVolumeFixed) {
        val max = a.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        a.setStreamVolume(AudioManager.STREAM_MUSIC, (value.coerceIn(0.0, 1.0) * max).roundToInt(), 0)
      }
    }

    // Android has no prompt for Notification Access: the rider switches it on in Settings.
    AsyncFunction("requestAccess") {
      openListenerSettings()
      false
    }

    AsyncFunction("openAccessSettings") {
      openListenerSettings()
    }
  }

  private fun component() = ComponentName(context, MusicListenerService::class.java)

  private fun hasAccess(): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it)?.packageName == context.packageName }
  }

  private fun controller(): MediaController? {
    if (!hasAccess()) return null
    val msm = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
    val list = try {
      msm.getActiveSessions(component())
    } catch (e: SecurityException) {
      return null
    }.filter { it.packageName != context.packageName }
    return list.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: list.firstOrNull()
  }

  private fun appLabel(pkg: String): String? = try {
    val pm = context.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
  } catch (e: Exception) {
    null // Hidden by Android's package visibility; JavaScript knows the common music apps.
  }

  private fun volume(): Double? {
    val a = audio
    if (a.isVolumeFixed) return null
    val max = a.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    if (max <= 0) return null
    return a.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
  }

  private fun key(code: Int) {
    val now = SystemClock.uptimeMillis()
    audio.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0))
    audio.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0))
  }

  private fun openListenerSettings() {
    val detail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
        .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component().flattenToString())
    } else null
    val list = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
    for (intent in listOfNotNull(detail, list)) {
      try {
        val activity = appContext.currentActivity
        if (activity != null) activity.startActivity(intent)
        else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return
      } catch (e: Exception) {
        // Some phones lack the detail page; try the list.
      }
    }
  }
}
