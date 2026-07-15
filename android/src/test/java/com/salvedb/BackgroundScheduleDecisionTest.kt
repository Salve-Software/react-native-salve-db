package com.salvedb

import org.junit.Assert.assertEquals
import org.junit.Test

class BackgroundScheduleDecisionTest {

  @Test
  fun `no config cancels`() {
    val decision = backgroundScheduleDecision(
      hasConfig = false,
      minimumIntervalMs = 900000.0,
      requiresNetwork = true,
      requiresCharging = true,
      floorMs = 900000L,
    )

    assertEquals(BackgroundScheduleDecision.Cancel, decision)
  }

  @Test
  fun `interval above the floor is kept as-is`() {
    val decision = backgroundScheduleDecision(
      hasConfig = true,
      minimumIntervalMs = 3600000.0,
      requiresNetwork = false,
      requiresCharging = false,
      floorMs = 900000L,
    )

    assertEquals(BackgroundScheduleDecision.Enqueue(3600000L, false, false), decision)
  }

  @Test
  fun `interval below the floor is clamped up to it`() {
    val decision = backgroundScheduleDecision(
      hasConfig = true,
      minimumIntervalMs = 60000.0,
      requiresNetwork = true,
      requiresCharging = false,
      floorMs = 900000L,
    )

    assertEquals(BackgroundScheduleDecision.Enqueue(900000L, true, false), decision)
  }

  @Test
  fun `requiresNetwork and requiresCharging are carried through independently`() {
    val decision = backgroundScheduleDecision(
      hasConfig = true,
      minimumIntervalMs = 900000.0,
      requiresNetwork = false,
      requiresCharging = true,
      floorMs = 900000L,
    )

    assertEquals(BackgroundScheduleDecision.Enqueue(900000L, false, true), decision)
  }
}
