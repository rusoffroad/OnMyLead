package com.rusoffroad.onmylead.meshradio

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelUuid
import android.util.Base64
import java.util.UUID

// Radio Sharing's Bluetooth link to the rider's Meshtastic radio, for Android phones and tablets.
// Same flow as the iOS side (ios/OnMyLeadMeshRadioModule.swift): connect, ask for a 512-byte
// packet size, find the Meshtastic service, subscribe to FromNum, then read FromRadio until it
// comes back empty after every write and every FromNum notification. Bytes only: JavaScript
// (src/core/meshtastic.ts) reads and writes the messages.
//
// Android runs one Bluetooth operation at a time per connection, so writes, reads and the
// subscription wait in one queue and go one after another. Separate from Bluetooth Sharing
// (modules/onmylead-nearby): nothing here runs until JavaScript asks.
@SuppressLint("MissingPermission")
class MeshRadioLink(
  private val context: Context,
  private val service: UUID,
  private val toRadio: UUID,
  private val fromRadio: UUID,
  private val fromNum: UUID,
  private val onDevice: (String, String, Int) -> Unit,
  private val onState: (String, String?) -> Unit,
  private val onFromRadio: (String) -> Unit,
) {
  companion object {
    private const val WANT_MTU = 512
    private const val MAX_QUEUE = 64
    private const val MAX_READS_PER_DRAIN = 64
    private const val RECONNECT_MS = 5_000L
    private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  }

  private sealed class Op {
    class Write(val data: ByteArray) : Op()
    object Read : Op()
    object Subscribe : Op()
  }

  private val thread = HandlerThread("onmylead-meshradio").apply { start() }
  private val handler = Handler(thread.looper)
  private val adapter: BluetoothAdapter? = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter

  private var gatt: BluetoothGatt? = null
  private var toChar: BluetoothGattCharacteristic? = null
  private var fromChar: BluetoothGattCharacteristic? = null
  private var numChar: BluetoothGattCharacteristic? = null
  private var wantedId: String? = null
  private var scanning = false
  @Volatile private var state = "idle"
  private val ops = ArrayDeque<Op>()
  private var busy = false
  private var readsLeft = 0

  fun currentState(): String = state

  private fun setState(s: String) {
    state = s
    onState(s, gatt?.device?.address ?: wantedId)
  }

  // ---- Scan ----

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val name = result.scanRecord?.deviceName ?: (try { result.device.name } catch (_: SecurityException) { null }) ?: ""
      onDevice(result.device.address, name, result.rssi)
    }

    override fun onScanFailed(errorCode: Int) {
      handler.post { scanning = false }
    }
  }

  fun startScan() {
    handler.post {
      val scanner = adapter?.bluetoothLeScanner ?: return@post setState(if (adapter == null) "unsupported" else "off")
      if (scanning) return@post
      try {
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(service)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        scanner.startScan(listOf(filter), settings, scanCallback)
        scanning = true
      } catch (_: SecurityException) {
        setState("unauthorized")
      }
    }
  }

  fun stopScan() {
    handler.post {
      if (!scanning) return@post
      scanning = false
      try { adapter?.bluetoothLeScanner?.stopScan(scanCallback) } catch (_: Exception) {}
    }
  }

  // ---- Connection ----

  fun connect(id: String) {
    handler.post {
      wantedId = id
      if (gatt?.device?.address == id) return@post
      close()
      open(autoConnect = false)
    }
  }

  fun disconnect() {
    handler.post {
      wantedId = null
      close()
      setState("idle")
    }
  }

  private fun open(autoConnect: Boolean) {
    val id = wantedId ?: return
    val a = adapter ?: return setState("unsupported")
    if (!a.isEnabled) return setState("off")
    val device = try { a.getRemoteDevice(id) } catch (_: IllegalArgumentException) { return setState("not_found") }
    setState("connecting")
    try {
      // autoConnect on a reconnect: Android waits for the radio to come back in range.
      gatt = device.connectGatt(context, autoConnect, callback, BluetoothDevice.TRANSPORT_LE)
    } catch (_: SecurityException) {
      setState("unauthorized")
    }
  }

  private fun close() {
    ops.clear()
    busy = false
    toChar = null
    fromChar = null
    numChar = null
    val g = gatt
    gatt = null
    try { g?.disconnect() } catch (_: Exception) {}
    try { g?.close() } catch (_: Exception) {}
  }

  fun write(b64: String) {
    handler.post {
      if (toChar == null) return@post
      val data = try { Base64.decode(b64, Base64.NO_WRAP) } catch (_: IllegalArgumentException) { return@post }
      val writes = ops.count { it is Op.Write }
      if (writes >= MAX_QUEUE) ops.firstOrNull { it is Op.Write }?.let { ops.remove(it) }
      ops.addLast(Op.Write(data))
      pump()
    }
  }

  private fun drain() {
    if (fromChar == null) return
    if (ops.any { it is Op.Read }) return
    readsLeft = MAX_READS_PER_DRAIN
    ops.addLast(Op.Read)
    pump()
  }

  @Suppress("DEPRECATION")
  private fun pump() {
    if (busy) return
    val g = gatt ?: return
    val op = ops.removeFirstOrNull() ?: return
    busy = true
    val ok = try {
      when (op) {
        is Op.Write -> {
          val c = toChar ?: return run { busy = false }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(c, op.data, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == STATUS_SUCCESS
          } else {
            c.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            c.value = op.data
            g.writeCharacteristic(c)
          }
        }
        is Op.Read -> {
          val c = fromChar ?: return run { busy = false }
          g.readCharacteristic(c)
        }
        is Op.Subscribe -> {
          val c = numChar ?: return run { busy = false }
          g.setCharacteristicNotification(c, true)
          val d = c.getDescriptor(CCCD) ?: return run { busy = false; setState("not_meshtastic") }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == STATUS_SUCCESS
          } else {
            d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            g.writeDescriptor(d)
          }
        }
      }
    } catch (_: SecurityException) {
      false
    }
    if (!ok) {
      busy = false
      // Refused by the stack (busy, bonding): try that one again shortly.
      ops.addFirst(op)
      handler.postDelayed({ pump() }, 300)
    }
  }

  private fun gotValue(uuid: UUID, value: ByteArray?) {
    if (uuid == fromNum) return drain()
    if (uuid != fromRadio) return
    val v = value ?: ByteArray(0)
    if (v.isEmpty()) return
    onFromRadio(Base64.encodeToString(v, Base64.NO_WRAP))
    readsLeft -= 1
    // More waiting: read again, after anything already queued.
    if (readsLeft > 0) ops.addLast(Op.Read) else handler.post { drain() }
  }

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
      handler.post {
        if (g !== gatt) {
          try { g.close() } catch (_: Exception) {}
          return@post
        }
        if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
          if (!g.requestMtu(WANT_MTU)) g.discoverServices()
          return@post
        }
        close()
        if (wantedId == null) return@post setState("idle")
        setState("disconnected")
        // Still wanted: wait for it to come back in range.
        handler.postDelayed({ if (wantedId != null && gatt == null) open(autoConnect = true) }, RECONNECT_MS)
      }
    }

    override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
      handler.post { if (g === gatt) g.discoverServices() }
    }

    override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
      handler.post {
        if (g !== gatt) return@post
        val s = g.getService(service)
        toChar = s?.getCharacteristic(toRadio)
        fromChar = s?.getCharacteristic(fromRadio)
        numChar = s?.getCharacteristic(fromNum)
        if (toChar == null || fromChar == null || numChar == null) {
          setState("not_meshtastic")
          wantedId = null
          close()
          return@post
        }
        // The subscription is encrypted: the first time, Android asks for the radio's PIN.
        ops.addLast(Op.Subscribe)
        pump()
      }
    }

    override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      handler.post {
        if (g !== gatt) return@post
        busy = false
        if (status != BluetoothGatt.GATT_SUCCESS) {
          setState("pairing_failed")
          return@post
        }
        setState("connected")
        drain()
        pump()
      }
    }

    override fun onCharacteristicWrite(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      handler.post {
        if (g !== gatt) return@post
        busy = false
        // The radio may have answered: read it.
        drain()
        pump()
      }
    }

    // Android 13+.
    override fun onCharacteristicRead(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
      handler.post {
        if (g !== gatt) return@post
        busy = false
        if (status == BluetoothGatt.GATT_SUCCESS) gotValue(characteristic.uuid, value)
        pump()
      }
    }

    // Android 12 and older.
    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onCharacteristicRead(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      val v = characteristic.value?.copyOf()
      handler.post {
        if (g !== gatt) return@post
        busy = false
        if (status == BluetoothGatt.GATT_SUCCESS) gotValue(characteristic.uuid, v)
        pump()
      }
    }

    // Android 13+.
    override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      handler.post { if (g === gatt) gotValue(characteristic.uuid, value) }
    }

    // Android 12 and older.
    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      val v = characteristic.value?.copyOf()
      handler.post { if (g === gatt) gotValue(characteristic.uuid, v) }
    }
  }
}

/** android.bluetooth.BluetoothStatusCodes.SUCCESS (API 31+), spelled out for older compile checks. */
private const val STATUS_SUCCESS = 0
