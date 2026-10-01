package expo.modules.rafiqmotion

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs

/** Gravity and the gyroscope at 100 Hz: under Android 12's 200 Hz cap, so no HIGH_SAMPLING_RATE_SENSORS. */
private const val FAST_PERIOD_US = 10_000
/** The magnetometer at 50 Hz. */
private const val MAG_PERIOD_US = 20_000
/** One batch per display frame. */
private const val FLUSH_MS = 16L
/** A stream never holds more than this much unsent (seconds); older samples are dropped and counted. */
private const val MAX_QUEUED_S = 1.0
/** A bias estimate moving by more than this (µT) on any axis is a recalibration. */
private const val BIAS_STEP_UT = 0.5f

/**
 * Streams the three sensors the Qibla engine needs, unprocessed and
 * timestamped, in one batch per frame:
 *  - up: TYPE_GRAVITY (the platform's fused gravity, which points up: it reads
 *    +9.81 on Z lying face up), or the raw accelerometer on phones without it;
 *  - gyro: TYPE_GYROSCOPE (rad/s, bias-compensated);
 *  - mag: TYPE_MAGNETIC_FIELD (µT, calibrated), with its own accuracy.
 * TYPE_MAGNETIC_FIELD_UNCALIBRATED is read only for its bias estimate, to say
 * when the platform has recalibrated. No rotation vector is used: its yaw is
 * the platform's guess at north, which the engine does not take.
 * Every timestamp is SensorEvent.timestamp (elapsedRealtimeNanos base), in seconds.
 */
class RafiqMotionModule : Module() {
  private var session: Session? = null

  override fun definition() = ModuleDefinition {
    Name("RafiqMotion")

    Events("batch")

    Function("getAvailability") {
      val sm = sensorManager()
      val gravity = sm.getDefaultSensor(Sensor.TYPE_GRAVITY) != null
      mapOf(
        "gyro" to (sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null),
        "up" to (gravity || sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null),
        "upIsAccelerometer" to !gravity,
        "magnetometer" to (sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null),
        // Android's magnetometer accuracy is not believed on its own: some phones report 0
        // forever, and a Samsung reported 3 while 40° off.
        "trustAccuracy" to false
      )
    }

    Function("start") {
      if (session == null) {
        session = Session(sensorManager()) { body -> sendEvent("batch", body) }.also { it.start() }
      }
    }

    Function("stop") {
      session?.stop()
      session = null
    }

    OnDestroy {
      session?.stop()
      session = null
    }
  }

  private fun sensorManager(): SensorManager =
    requireNotNull(appContext.reactContext).getSystemService(Context.SENSOR_SERVICE) as SensorManager
}

/** One stream's unsent samples, as flat [t, x, y, z] quadruples. */
private class Stream {
  private var buffer = DoubleArray(4 * 64)
  private var size = 0
  var dropped = 0
    private set

  fun add(t: Double, x: Float, y: Float, z: Float) {
    if (size > 0 && t - buffer[0] > MAX_QUEUED_S) {
      System.arraycopy(buffer, 4, buffer, 0, size - 4)
      size -= 4
      dropped++
    }
    if (size + 4 > buffer.size) buffer = buffer.copyOf(buffer.size * 2)
    buffer[size] = t
    buffer[size + 1] = x.toDouble()
    buffer[size + 2] = y.toDouble()
    buffer[size + 3] = z.toDouble()
    size += 4
  }

  val isEmpty get() = size == 0

  fun take(): DoubleArray {
    val out = buffer.copyOf(size)
    size = 0
    return out
  }

  fun takeDropped(): Int {
    val d = dropped
    dropped = 0
    return d
  }
}

/**
 * The listeners and the flush share one HandlerThread, so the buffers are
 * only ever touched from that thread and need no locks.
 */
private class Session(
  private val sm: SensorManager,
  private val emit: (Map<String, Any?>) -> Unit
) : SensorEventListener {
  private val thread = HandlerThread("RafiqMotion").apply { start() }
  private val handler = Handler(thread.looper)
  private val up = Stream()
  private val gyro = Stream()
  private val mag = Stream()
  private var magAccuracy = -1
  private var biasEpoch = 0
  private var lastBias: FloatArray? = null
  private var running = false

  private val flush = object : Runnable {
    override fun run() {
      if (!running) return
      send()
      handler.postDelayed(this, FLUSH_MS)
    }
  }

  fun start() {
    handler.post {
      running = true
      val upSensor = sm.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
      register(upSensor, FAST_PERIOD_US)
      register(sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE), FAST_PERIOD_US)
      register(sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD), MAG_PERIOD_US)
      register(sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED), MAG_PERIOD_US)
      handler.postDelayed(flush, FLUSH_MS)
    }
  }

  fun stop() {
    handler.post {
      running = false
      sm.unregisterListener(this)
      handler.removeCallbacksAndMessages(null)
      thread.quitSafely()
    }
  }

  private fun register(sensor: Sensor?, periodUs: Int) {
    // maxReportLatencyUs = 0: deliver as soon as available, never batched in the sensor hub.
    if (sensor != null) sm.registerListener(this, sensor, periodUs, 0, handler)
  }

  override fun onSensorChanged(event: SensorEvent) {
    val t = event.timestamp / 1_000_000_000.0
    val v = event.values
    when (event.sensor.type) {
      Sensor.TYPE_GRAVITY, Sensor.TYPE_ACCELEROMETER -> up.add(t, v[0], v[1], v[2])
      Sensor.TYPE_GYROSCOPE -> gyro.add(t, v[0], v[1], v[2])
      Sensor.TYPE_MAGNETIC_FIELD -> {
        mag.add(t, v[0], v[1], v[2])
        magAccuracy = event.accuracy
      }
      Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED -> if (v.size >= 6) {
        // Measured from the last counted estimate, so a slow creep is counted once it adds up.
        val prev = lastBias
        val stepped = prev != null &&
          (abs(v[3] - prev[0]) > BIAS_STEP_UT || abs(v[4] - prev[1]) > BIAS_STEP_UT || abs(v[5] - prev[2]) > BIAS_STEP_UT)
        if (stepped) biasEpoch++
        if (prev == null || stepped) lastBias = floatArrayOf(v[3], v[4], v[5])
      }
    }
  }

  override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
    if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD) magAccuracy = accuracy
  }

  private fun send() {
    if (up.isEmpty && gyro.isEmpty && mag.isEmpty) return
    val dropped = up.takeDropped() + gyro.takeDropped() + mag.takeDropped()
    emit(
      mapOf(
        "up" to up.take(),
        "gyro" to gyro.take(),
        "mag" to mag.take(),
        "magAccuracy" to magAccuracy,
        "biasEpoch" to biasEpoch,
        "dropped" to dropped
      )
    )
  }
}
