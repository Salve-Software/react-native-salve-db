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
    let decision = backgroundScheduleDecision(
      hasConfig: SalveDbSyncBridge.backgroundHasConfig(),
      minimumIntervalMs: SalveDbSyncBridge.backgroundMinimumIntervalMs(),
      requiresNetwork: SalveDbSyncBridge.backgroundRequiresNetwork(),
      requiresCharging: SalveDbSyncBridge.backgroundRequiresCharging()
    )

    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)

    guard case let .enqueue(secondsFromNow, requiresNetwork, requiresCharging) = decision else {
      return
    }

    let request = BGProcessingTaskRequest(identifier: taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: secondsFromNow)
    request.requiresNetworkConnectivity = requiresNetwork
    request.requiresExternalPower = requiresCharging

    try? BGTaskScheduler.shared.submit(request)
  }

  private static func handle(_ task: BGProcessingTask) {
    scheduleNext()
    task.expirationHandler = {
      task.setTaskCompleted(success: false)
    }

    SalveDbSyncBridge.wakeBackgroundSync()
    task.setTaskCompleted(success: true)
  }
}
