package com.salvedb

sealed interface BackgroundScheduleDecision {
  data object Cancel : BackgroundScheduleDecision
  data class Enqueue(
    val intervalMs: Long,
    val requiresNetwork: Boolean,
    val requiresCharging: Boolean,
  ) : BackgroundScheduleDecision
}

fun backgroundScheduleDecision(
  hasConfig: Boolean,
  minimumIntervalMs: Double,
  requiresNetwork: Boolean,
  requiresCharging: Boolean,
  floorMs: Long,
): BackgroundScheduleDecision {
  if (!hasConfig) return BackgroundScheduleDecision.Cancel
  return BackgroundScheduleDecision.Enqueue(
    intervalMs = minimumIntervalMs.toLong().coerceAtLeast(floorMs),
    requiresNetwork = requiresNetwork,
    requiresCharging = requiresCharging,
  )
}
