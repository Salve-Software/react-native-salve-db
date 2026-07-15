import Foundation

/// Coalesces rapid `signal()` calls into at most one `onFire` per `windowSeconds`.
final class SyncTriggerDebouncer {
  private let windowSeconds: TimeInterval
  private let now: () -> TimeInterval
  private let onFire: () -> Void
  private var lastFiredAt: TimeInterval?

  init(
    windowSeconds: TimeInterval,
    now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 },
    onFire: @escaping () -> Void
  ) {
    self.windowSeconds = windowSeconds
    self.now = now
    self.onFire = onFire
  }

  func signal() {
    let current = now()
    if let last = lastFiredAt, current - last < windowSeconds {
      return
    }
    lastFiredAt = current
    onFire()
  }
}
