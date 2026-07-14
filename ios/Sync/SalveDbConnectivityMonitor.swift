import Foundation
import Network
import UIKit

/// Native offline -> online sync trigger. Starts an NWPathMonitor only
/// while the app is in the foreground (UIApplication did-become-active /
/// will-resign-active) and calls straight into the C++ sync engine via
/// SalveDbSyncBridge, without involving the JS engine.
///
/// Started from SalveDbLifecycleBootstrap, never reachable from JS.
@objc(SalveDbConnectivityMonitor) public final class SalveDbConnectivityMonitor: NSObject {
  private static let shared = SalveDbConnectivityMonitor()

  private let queue = DispatchQueue(label: "com.salvedb.connectivity-monitor")
  private var monitor: NWPathMonitor?
  private lazy var debouncer = SyncTriggerDebouncer(windowSeconds: 5) {
    SalveDbSyncBridge.triggerSyncAll()
  }

  private override init() {
    super.init()
  }

  @objc public static func start() {
    NotificationCenter.default.addObserver(
      shared, selector: #selector(didBecomeActive),
      name: UIApplication.didBecomeActiveNotification, object: nil
    )
    NotificationCenter.default.addObserver(
      shared, selector: #selector(willResignActive),
      name: UIApplication.willResignActiveNotification, object: nil
    )
  }

  @objc private func didBecomeActive() {
    let pathMonitor = NWPathMonitor()
    pathMonitor.pathUpdateHandler = { [weak self] path in
      guard path.status == .satisfied else { return }
      self?.debouncer.signal()
    }
    monitor = pathMonitor
    pathMonitor.start(queue: queue)
  }

  @objc private func willResignActive() {
    monitor?.cancel()
    monitor = nil
  }
}
