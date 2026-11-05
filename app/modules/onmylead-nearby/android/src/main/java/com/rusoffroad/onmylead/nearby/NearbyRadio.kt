package com.rusoffroad.onmylead.nearby

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelUuid
import android.util.Base64
import java.util.UUID

// Bluetooth Sharing radio for Android phones and tablets. Same design as the iOS side
// (ios/OnMyLeadNearbyModule.swift): every phone advertises the OnMyLead service with an "inbox"
// it can be written to and an "outbox" that notifies, and also scans for, connects to, writes to
// and subscribes to other phones. Packets are encrypted in JavaScript; this never reads them.
//
// Android allows one Bluetooth operation at a time per connection, so writes to a phone (and
// notifications to a subscribed phone) wait in a small queue and go one after another.
//
// Runs while the app runs: in Ride Mode the location foreground service keeps the app alive with
// the screen off. The JavaScript side asks for the Nearby Devices permission before start().
@SuppressLint("MissingPermission")
class NearbyRadio(
  private val context: Context,
  private val service: UUID,
  private val inbox: UUID,
  private val outbox: UUID,
  private val onFrame: (String) -> Unit,
  private val onState: (String, Int) -> Unit,
) {
  companion object {
    private const val MAX_PEERS = 8
    private const val SUBSCRIBE_TRIES = 20
    private const val MAX_SUBSCRIBE_FAILS = 5
    private const val ROUND_MS = 4_000L
    // Low power (service, nobody in range, or Max Battery Saver): send less often and let the
    // chip scan and advertise in its low-power duty cycle. Phones that connect are served at once.
    private const val LOW_ROUND_MS = 10_000L
    private const val MAX_BUFFERED = 500
    private const val MAX_QUEUE = 64
    private const val WANT_MTU = 247
    private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  }

  private val thread = HandlerThread("onmylead-nearby").apply { start() }
  private val handler = Handler(thread.looper)

  private val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
  private val adapter: BluetoothAdapter? = manager?.adapter

  private var server: BluetoothGattServer? = null
  private var outboxChar: BluetoothGattCharacteristic? = null
  private var advertising = false
  private var scanning = false

  private class Peer(val gatt: BluetoothGatt) {
    var inbox: BluetoothGattCharacteristic? = null
    var subscribeFails = 0
    var mtu = 23
    var busy = false
    val queue = ArrayDeque<ByteArray>()
  }

  private class Subscriber(val device: BluetoothDevice) {
    var mtu = 23
    var busy = false
    val queue = ArrayDeque<ByteArray>()
  }

  private val peers = HashMap<String, Peer>()
  private val subscribers = HashMap<String, Subscriber>()
  private var outgoing: List<ByteArray> = emptyList()
  private val received = ArrayList<String>()
  private var state = "starting"
  private var running = false
  private var low = false

  // ---------------------------------------------------------------------------------------------
  // Called from JavaScript (any thread); everything else runs on `handler`.

  // Bluetooth switched off and on between two rounds would leave dead scans and links behind, so
  // the switch itself resets them; the next round starts everything again.
  private var stateReceiverOn = false
  private val roundTask = Runnable { round() }
  private val stateReceiver = object : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
      val st = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
      if (st == BluetoothAdapter.STATE_TURNING_OFF || st == BluetoothAdapter.STATE_OFF) {
        handler.post {
          if (!running) return@post
          resetLinks()
          report("off")
        }
      } else if (st == BluetoothAdapter.STATE_ON) {
        handler.post {
          if (!running || !hasPermissions() || adapter == null) return@post
          // One loop of rounds: drop the waiting one and run now.
          handler.removeCallbacks(roundTask)
          round()
        }
      }
    }
  }

  fun start() = handler.post {
    running = true
    if (!stateReceiverOn) {
      try {
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          context.registerReceiver(stateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          context.registerReceiver(stateReceiver, filter)
        }
        stateReceiverOn = true
      } catch (_: Exception) {}
    }
    if (!hasPermissions()) return@post report("unauthorized")
    val a = adapter ?: return@post report("unsupported")
    if (a.isEnabled) {
      openServer()
      startScan()
      report("on")
    } else {
      // Rounds keep running so the radio starts by itself once the rider turns Bluetooth on.
      report("off")
    }
    handler.postDelayed(roundTask, if (low) LOW_ROUND_MS else ROUND_MS)
  }

  fun stop() {
    handler.post {
      running = false
      handler.removeCallbacksAndMessages(null)
      if (stateReceiverOn) {
        try { context.unregisterReceiver(stateReceiver) } catch (_: Exception) {}
        stateReceiverOn = false
      }
      resetLinks()
      thread.quitSafely()
    }
  }

  fun setOutgoing(frames: List<String>) {
    val decoded = frames.mapNotNull { decode(it) }
    handler.post { outgoing = decoded }
  }

  fun sendNow(frames: List<String>) {
    val decoded = frames.mapNotNull { decode(it) }
    handler.post { send(decoded) }
  }

  fun drain(): List<String> = synchronized(received) {
    val out = ArrayList(received)
    received.clear()
    out
  }

  fun snapshot(): Map<String, Any> = mapOf("state" to state, "peers" to peerCount())

  fun setPower(low: Boolean) = handler.post {
    if (this.low == low) return@post
    this.low = low
    if (!running) return@post
    // Scan and advertise settings are fixed at start: restart both with the new ones.
    try {
      if (scanning) adapter?.bluetoothLeScanner?.stopScan(scanCallback)
      if (advertising) adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
    } catch (_: Exception) {}
    scanning = false
    advertising = false
    val a = adapter
    if (a != null && a.isEnabled) {
      startAdvertising()
      startScan()
    }
  }

  // ---------------------------------------------------------------------------------------------

  private fun decode(b64: String): ByteArray? =
    try { Base64.decode(b64, Base64.NO_WRAP) } catch (_: IllegalArgumentException) { null }

  private fun hasPermissions(): Boolean {
    val needed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_ADVERTISE)
    } else {
      listOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }
    return needed.all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
  }

  private fun peerCount() = maxOf(peers.values.count { it.inbox != null }, subscribers.size)

  private fun report(s: String? = null) {
    if (s != null) state = s
    onState(state, peerCount())
  }

  private fun deliver(value: ByteArray) {
    val b64 = Base64.encodeToString(value, Base64.NO_WRAP)
    synchronized(received) {
      if (received.size >= MAX_BUFFERED) received.removeAt(0)
      received.add(b64)
    }
    onFrame(b64)
  }

  private fun round() {
    if (!running) return
    val a = adapter
    if (a == null || !a.isEnabled) {
      if (state != "off") {
        // Turning Bluetooth off ends every scan, advertisement and link: forget them, so they all
        // start again when it comes back on.
        resetLinks()
        report("off")
      }
    } else {
      if (server == null) openServer() else if (!advertising) startAdvertising()
      if (!scanning) startScan()
      if (state != "on") report("on")
      send(outgoing)
    }
    handler.postDelayed(roundTask, if (low) LOW_ROUND_MS else ROUND_MS)
  }

  private fun resetLinks() {
    try {
      if (scanning) adapter?.bluetoothLeScanner?.stopScan(scanCallback)
      if (advertising) adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
    } catch (_: Exception) {}
    scanning = false
    advertising = false
    peers.values.forEach { try { it.gatt.close() } catch (_: Exception) {} }
    peers.clear()
    subscribers.clear()
    try { server?.close() } catch (_: Exception) {}
    server = null
  }

  private fun send(frames: List<ByteArray>) {
    if (frames.isEmpty()) return
    for (p in peers.values) {
      if (p.inbox == null) continue
      for (f in frames) if (f.size <= p.mtu - 3 && p.queue.size < MAX_QUEUE) p.queue.add(f)
      pump(p)
    }
    for (s in subscribers.values) {
      for (f in frames) if (f.size <= s.mtu - 3 && s.queue.size < MAX_QUEUE) s.queue.add(f)
      pump(s)
    }
  }

  @Suppress("DEPRECATION")
  private fun pump(p: Peer) {
    val ch = p.inbox ?: return
    if (p.busy) return
    val f = p.queue.removeFirstOrNull() ?: return
    p.busy = true
    val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      p.gatt.writeCharacteristic(ch, f, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) == BluetoothStatusCodesSuccess
    } else {
      ch.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      ch.value = f
      p.gatt.writeCharacteristic(ch)
    }
    if (!ok) {
      p.busy = false
      p.queue.clear()
    }
  }

  @Suppress("DEPRECATION")
  private fun pump(s: Subscriber) {
    val srv = server ?: return
    val ch = outboxChar ?: return
    if (s.busy) return
    val f = s.queue.removeFirstOrNull() ?: return
    s.busy = true
    val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      srv.notifyCharacteristicChanged(s.device, ch, false, f) == BluetoothStatusCodesSuccess
    } else {
      ch.value = f
      srv.notifyCharacteristicChanged(s.device, ch, false)
    }
    if (!ok) {
      s.busy = false
      s.queue.clear()
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Peripheral: the GATT server and advertising

  private fun openServer() {
    val m = manager ?: return
    val srv = m.openGattServer(context, serverCallback) ?: return
    val inboxChar = BluetoothGattCharacteristic(
      inbox,
      BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
      BluetoothGattCharacteristic.PERMISSION_WRITE,
    )
    val out = BluetoothGattCharacteristic(outbox, BluetoothGattCharacteristic.PROPERTY_NOTIFY, BluetoothGattCharacteristic.PERMISSION_READ)
    out.addDescriptor(BluetoothGattDescriptor(CCCD, BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE))
    val s = BluetoothGattService(service, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    s.addCharacteristic(inboxChar)
    s.addCharacteristic(out)
    outboxChar = out
    srv.addService(s)
    server = srv
  }

  private fun startAdvertising() {
    val adv = adapter?.bluetoothLeAdvertiser ?: return
    if (advertising) return
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(if (low) AdvertiseSettings.ADVERTISE_MODE_LOW_POWER else AdvertiseSettings.ADVERTISE_MODE_BALANCED)
      // Full transmit power either way: range is the point, and it costs little next to scanning.
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
      .setConnectable(true)
      .build()
    // No name in the advertisement: other phones see only that an OnMyLead phone is near.
    val data = AdvertiseData.Builder().addServiceUuid(ParcelUuid(service)).setIncludeDeviceName(false).build()
    try {
      adv.startAdvertising(settings, data, advertiseCallback)
      advertising = true
    } catch (_: Exception) {}
  }

  private val advertiseCallback = object : AdvertiseCallback() {
    override fun onStartFailure(errorCode: Int) {
      handler.post { advertising = errorCode == ADVERTISE_FAILED_ALREADY_STARTED }
    }
  }

  private val serverCallback = object : BluetoothGattServerCallback() {
    override fun onServiceAdded(status: Int, service: BluetoothGattService) {
      handler.post { startAdvertising() }
    }

    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_DISCONNECTED) handler.post {
        subscribers.remove(device.address)
        report()
      }
    }

    override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
      handler.post { subscribers[device.address]?.mtu = mtu }
      pendingMtu[device.address] = mtu
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice, requestId: Int, characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray?,
    ) {
      if (characteristic.uuid == inbox && !preparedWrite && offset == 0 && value != null) deliver(value)
      if (responseNeeded) server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
    }

    override fun onDescriptorWriteRequest(
      device: BluetoothDevice, requestId: Int, descriptor: BluetoothGattDescriptor,
      preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray?,
    ) {
      if (descriptor.uuid == CCCD) handler.post {
        val on = value != null && value.isNotEmpty() && value[0].toInt() != 0
        if (on) {
          subscribers.getOrPut(device.address) { Subscriber(device) }.mtu = pendingMtu[device.address] ?: 185
          report()
          send(outgoing)
        } else {
          subscribers.remove(device.address)
          report()
        }
      }
      if (responseNeeded) server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
    }

    override fun onNotificationSent(device: BluetoothDevice, status: Int) {
      handler.post {
        val s = subscribers[device.address] ?: return@post
        s.busy = false
        pump(s)
      }
    }
  }

  /** MTU a central asked for before it subscribed (the server callbacks can arrive in any order). */
  private val pendingMtu = java.util.concurrent.ConcurrentHashMap<String, Int>()

  // ---------------------------------------------------------------------------------------------
  // Central: scanning, connecting, writing, subscribing

  private fun startScan() {
    val scanner = adapter?.bluetoothLeScanner ?: return
    val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(service)).build()
    val settings = ScanSettings.Builder()
      .setScanMode(if (low) ScanSettings.SCAN_MODE_LOW_POWER else ScanSettings.SCAN_MODE_BALANCED)
      .build()
    try {
      scanner.startScan(listOf(filter), settings, scanCallback)
      scanning = true
    } catch (_: Exception) {}
  }

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      handler.post { connect(result.device) }
    }

    override fun onScanFailed(errorCode: Int) {
      handler.post { scanning = false }
    }
  }

  private fun connect(device: BluetoothDevice) {
    if (!running || peers.containsKey(device.address) || peers.size >= MAX_PEERS) return
    val gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE) ?: return
    peers[device.address] = Peer(gatt)
  }

  /**
   * Asks the peer for its packets (turns on notifications). The stack can refuse while another
   * request is still going (common right after discovery on Android 13+): no callback comes then,
   * so writes aren't held back, and it is asked again every half second, up to SUBSCRIBE_TRIES times.
   */
  @Suppress("DEPRECATION")
  private fun subscribe(gatt: BluetoothGatt, out: BluetoothGattCharacteristic, tries: Int) {
    val p = peerOf(gatt) ?: return
    if (!running) return
    val d = out.getDescriptor(CCCD) ?: return
    if (p.busy) {
      if (tries < SUBSCRIBE_TRIES) handler.postDelayed({ subscribe(gatt, out, tries + 1) }, 500)
      return
    }
    p.busy = true
    val started = try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodesSuccess
      } else {
        d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        gatt.writeDescriptor(d)
      }
    } catch (_: Exception) {
      false
    }
    if (!started) {
      p.busy = false
      pump(p)
      if (tries < SUBSCRIBE_TRIES) handler.postDelayed({ subscribe(gatt, out, tries + 1) }, 500)
    }
  }

  /** The peer this link belongs to, or null for a link already closed and replaced. */
  private fun peerOf(gatt: BluetoothGatt): Peer? = peers[gatt.device.address]?.takeIf { it.gatt === gatt }

  private fun drop(gatt: BluetoothGatt) {
    // A late callback from a link already closed (Bluetooth switched off and on) must not remove
    // the new link to the same phone.
    if (peers[gatt.device.address]?.gatt === gatt) peers.remove(gatt.device.address)
    try { gatt.close() } catch (_: Exception) {}
    report()
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      handler.post {
        if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
          // Bigger packets first; services are found once the size is agreed.
          if (!gatt.requestMtu(WANT_MTU)) gatt.discoverServices()
        } else {
          drop(gatt)
        }
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      handler.post {
        val p = peerOf(gatt) ?: return@post
        p.mtu = if (status == BluetoothGatt.GATT_SUCCESS) mtu else 23
        gatt.discoverServices()
      }
    }

    @Suppress("DEPRECATION")
    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      handler.post {
        val p = peerOf(gatt) ?: return@post
        val s = gatt.getService(service) ?: return@post drop(gatt)
        p.inbox = s.getCharacteristic(inbox)
        val out = s.getCharacteristic(outbox)
        if (out != null) {
          gatt.setCharacteristicNotification(out, true)
          subscribe(gatt, out, 0)
        }
        report()
        send(outgoing)
      }
    }

    override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      handler.post {
        val p = peerOf(gatt) ?: return@post
        p.busy = false
        pump(p)
        // The stack took the request but the peer refused it: ask again, a few times per link.
        if (descriptor.uuid == CCCD) {
          if (status == BluetoothGatt.GATT_SUCCESS) {
            p.subscribeFails = 0
          } else {
            val out = descriptor.characteristic
            if (out != null && ++p.subscribeFails < MAX_SUBSCRIBE_FAILS) handler.postDelayed({ subscribe(gatt, out, 0) }, 500)
          }
        }
      }
    }

    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      handler.post {
        val p = peerOf(gatt) ?: return@post
        p.busy = false
        pump(p)
      }
    }

    // Android 13+.
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      if (characteristic.uuid == outbox) deliver(value)
    }

    // Android 12 and older.
    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && characteristic.uuid == outbox) {
        characteristic.value?.let { deliver(it.copyOf()) }
      }
    }
  }
}

/** android.bluetooth.BluetoothStatusCodes.SUCCESS (API 31+), spelled out for older compile checks. */
private const val BluetoothStatusCodesSuccess = 0
