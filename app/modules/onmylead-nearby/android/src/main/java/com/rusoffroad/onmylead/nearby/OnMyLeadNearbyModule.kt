package com.rusoffroad.onmylead.nearby

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

// JavaScript side: src/lib/nearby.ts. Packet format and encryption: src/core/nearby.ts.
// The radio itself is NearbyRadio.kt. Same behavior as ios/OnMyLeadNearbyModule.swift.
class OnMyLeadNearbyModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var radio: NearbyRadio? = null

  override fun definition() = ModuleDefinition {
    Name("OnMyLeadNearby")
    Events("onFrame", "onState")

    Function("isSupported") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    }

    Function("start") { service: String, inbox: String, outbox: String ->
      if (radio != null) return@Function
      val r = NearbyRadio(
        context.applicationContext,
        UUID.fromString(service), UUID.fromString(inbox), UUID.fromString(outbox),
        onFrame = { b64 -> sendEvent("onFrame", mapOf("data" to b64)) },
        onState = { state, peers -> sendEvent("onState", mapOf("state" to state, "peers" to peers)) },
      )
      radio = r
      r.start()
    }

    Function("stop") {
      radio?.stop()
      radio = null
    }

    Function("setOutgoing") { frames: List<String> ->
      radio?.setOutgoing(frames)
    }

    Function("sendNow") { frames: List<String> ->
      radio?.sendNow(frames)
    }

    Function("drain") {
      radio?.drain() ?: emptyList<String>()
    }

    Function("getState") {
      radio?.snapshot() ?: mapOf("state" to "off", "peers" to 0)
    }

    OnDestroy {
      radio?.stop()
      radio = null
    }
  }
}
