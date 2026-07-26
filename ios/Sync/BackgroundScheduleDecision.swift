import Foundation

enum BackgroundScheduleDecision: Equatable {
  case cancel
  case enqueue(secondsFromNow: TimeInterval, requiresNetwork: Bool, requiresCharging: Bool)
}

func backgroundScheduleDecision(
  hasConfig: Bool,
  minimumIntervalMs: Double,
  requiresNetwork: Bool,
  requiresCharging: Bool
) -> BackgroundScheduleDecision {
  guard hasConfig else { return .cancel }
  return .enqueue(
    secondsFromNow: minimumIntervalMs / 1000,
    requiresNetwork: requiresNetwork,
    requiresCharging: requiresCharging
  )
}
