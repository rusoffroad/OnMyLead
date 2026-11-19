package com.rusoffroad.onmylead.meshradio

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

// JavaScript side: src/lib/radio.ts. Protocol: src/core/meshtastic.ts. The Bluetooth link itself is
// MeshRadioLink.kt. Same behavior as ios/OnMyLeadMeshRadioModule.swift.
class OnMyLeadMeshRadioModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var link: MeshRadioLink? = null

  override fun definition() = ModuleDefinition {
    Name("OnMyLeadMeshRadio")
    Events("onDevice", "onState", "onFromRadio")

    Function("isSupported") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    }

    Function("configure") { service: String, toRadio: String, fromRadio: String, fromNum: String ->
      if (link != null) return@Function
      link = MeshRadioLink(
        context.applicationContext,
        UUID.fromString(service), UUID.fromString(toRadio), UUID.fromString(fromRadio), UUID.fromString(fromNum),
        onDevice = { id, name, rssi -> sendEvent("onDevice", mapOf("id" to id, "name" to name, "rssi" to rssi)) },
        onState = { state, id -> sendEvent("onState", mapOf("state" to state, "id" to (id ?: ""))) },
        onFromRadio = { b64 -> sendEvent("onFromRadio", mapOf("data" to b64)) },
      )
    }

    Function("startScan") { link?.startScan() }
    Function("stopScan") { link?.stopScan() }
    Function("connect") { id: String -> link?.connect(id) }
    Function("disconnect") { link?.disconnect() }
    Function("write") { b64: String -> link?.write(b64) }
    Function("getState") { link?.currentState() ?: "idle" }

    OnDestroy {
      link?.disconnect()
      link = null
    }
  }
}
