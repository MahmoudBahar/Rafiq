import CoreMotion
import ExpoModulesCore

/// One batch per display frame (seconds).
private let flushInterval: TimeInterval = 1.0 / 60.0
/// Device motion at 100 Hz: gravity, the bias-removed rotation rate and the calibrated field, under one timestamp.
private let motionInterval: TimeInterval = 0.01

/**
 * Streams the three things the Qibla engine needs from one CMMotionManager
 * (Apple: "create only one"), in one batch per frame:
 *  - up: the negated `gravity` (CoreMotion's gravity points down: z ≈ -1 lying face up);
 *  - gyro: `rotationRate`, rad/s, bias removed by CoreMotion;
 *  - mag: `magneticField.field`, µT, device bias removed, only when calibrated
 *    and only when it changed (CoreMotion repeats it between magnetometer
 *    readings, and a repeat is not a new measurement).
 * The attitude is not sent: in the magnetic-north frame its yaw is pulled by
 * the magnet, and the engine takes north from the field itself. That frame is
 * used only because it is where `magneticField` is filled in.
 * Timestamps are CMLogItem.timestamp: seconds since boot.
 */
public class RafiqMotionModule: Module {
  private let manager = CMMotionManager()
  private lazy var queue: OperationQueue = {
    let q = OperationQueue()
    q.name = "RafiqMotion"
    q.maxConcurrentOperationCount = 1
    return q
  }()
  // Touched only from `queue`.
  private var up: [Double] = []
  private var gyro: [Double] = []
  private var mag: [Double] = []
  private var accuracy = -1
  private var lastField: (x: Double, y: Double, z: Double)?
  private var lastFlush: TimeInterval = 0

  public func definition() -> ModuleDefinition {
    Name("RafiqMotion")

    Events("batch")

    Function("getAvailability") { () -> [String: Any] in
      let magnetic = CMMotionManager.availableAttitudeReferenceFrames().contains(.xMagneticNorthZVertical)
      return [
        "gyro": self.manager.isGyroAvailable && self.manager.isDeviceMotionAvailable,
        "up": self.manager.isDeviceMotionAvailable,
        "upIsAccelerometer": false,
        "magnetometer": magnetic && self.manager.isMagnetometerAvailable,
        // CoreMotion's calibration state is believed on its own.
        "trustAccuracy": true,
      ]
    }

    Function("start") {
      self.start()
    }

    Function("stop") {
      self.stop()
    }

    OnDestroy {
      self.stop()
    }
  }

  private func start() {
    guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
    let frame: CMAttitudeReferenceFrame =
      CMMotionManager.availableAttitudeReferenceFrames().contains(.xMagneticNorthZVertical)
      ? .xMagneticNorthZVertical : .xArbitraryZVertical
    // Our own card asks for the figure-eight; never the system's overlay.
    manager.showsDeviceMovementDisplay = false
    manager.deviceMotionUpdateInterval = motionInterval
    queue.addOperation { [weak self] in
      self?.up.removeAll()
      self?.gyro.removeAll()
      self?.mag.removeAll()
      self?.lastField = nil
      self?.lastFlush = 0
    }
    manager.startDeviceMotionUpdates(using: frame, to: queue) { [weak self] motion, _ in
      guard let self, let motion else { return }
      self.take(motion)
    }
  }

  private func stop() {
    if manager.isDeviceMotionActive {
      manager.stopDeviceMotionUpdates()
    }
  }

  private func take(_ m: CMDeviceMotion) {
    let t = m.timestamp
    let g = m.gravity
    up.append(contentsOf: [t, -g.x, -g.y, -g.z])
    let r = m.rotationRate
    gyro.append(contentsOf: [t, r.x, r.y, r.z])

    let field = m.magneticField
    accuracy = Self.accuracy(field.accuracy)
    if field.accuracy != .uncalibrated {
      let f = field.field
      let fresh = lastField.map { $0.x != f.x || $0.y != f.y || $0.z != f.z } ?? true
      if fresh && !(f.x == 0 && f.y == 0 && f.z == 0) {
        mag.append(contentsOf: [t, f.x, f.y, f.z])
        lastField = (f.x, f.y, f.z)
      }
    }

    if t - lastFlush >= flushInterval {
      lastFlush = t
      sendEvent("batch", [
        "up": up,
        "gyro": gyro,
        "mag": mag,
        "magAccuracy": accuracy,
        // CoreMotion does not expose its bias re-estimates.
        "biasEpoch": 0,
        "dropped": 0,
      ])
      up.removeAll(keepingCapacity: true)
      gyro.removeAll(keepingCapacity: true)
      mag.removeAll(keepingCapacity: true)
    }
  }

  /// CoreMotion's calibration onto the 0–3 scale the engine uses (Android's).
  private static func accuracy(_ a: CMMagneticFieldCalibrationAccuracy) -> Int {
    switch a {
    case .uncalibrated: return 0
    case .low: return 1
    case .medium: return 2
    case .high: return 3
    @unknown default: return -1
    }
  }
}
