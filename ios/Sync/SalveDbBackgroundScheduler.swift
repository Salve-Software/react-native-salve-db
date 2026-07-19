import BackgroundTasks
import Foundation

/// Registers and drives the single global BGProcessingTask that wakes the
/// native sync engine. Started from SalveDbLifecycleBootstrap, never
/// reachable from JS.
@objc(SalveDbBackgroundScheduler) public final class SalveDbBackgroundScheduler: NSObject {
  private static let taskIdentifier = "com.salvedb.background.sync"

  @objc public static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
      handle(task as! BGProcessingTask)
    }
  }

  @objc public static func scheduleNext() {
    let snapshot = SalveDbSyncBridge.backgroundConstraints()
    let decision = backgroundScheduleDecision(
      hasConfig: snapshot.hasConfig,
      minimumIntervalMs: snapshot.minimumIntervalMs,
      requiresNetwork: snapshot.requiresNetwork,
      requiresCharging: snapshot.requiresCharging
    )

    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)

    guard case let .enqueue(secondsFromNow, requiresNetwork, requiresCharging) = decision else {
      return
    }

    let request = BGProcessingTaskRequest(identifier: taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: secondsFromNow)
    request.requiresNetworkConnectivity = requiresNetwork
    request.requiresExternalPower = requiresCharging

    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      NSLog("SalveDb: BGTaskScheduler.submit failed, will retry on next handle()/configure(): \(error)")
    }
  }

  private static func handle(_ task: BGProcessingTask) {
    scheduleNext()

    let completionLock = NSLock()
    var didComplete = false
    func completeOnce(success: Bool) {
      completionLock.lock()
      defer { completionLock.unlock() }
      guard !didComplete else { return }
      didComplete = true
      task.setTaskCompleted(success: success)
    }

    task.expirationHandler = {
      completeOnce(success: false)
    }

    SalveDbSyncBridge.wakeBackgroundSync()
    completeOnce(success: true)
  }
}
