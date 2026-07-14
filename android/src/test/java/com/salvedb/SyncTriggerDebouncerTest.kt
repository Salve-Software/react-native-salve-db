package com.salvedb

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncTriggerDebouncerTest {

  @Test
  fun `a single signal fires`() {
    var fireCount = 0
    var now = 0L
    val debouncer = SyncTriggerDebouncer(windowMillis = 5_000L, nowMillis = { now }, onFire = { fireCount++ })

    debouncer.signal()

    assertEquals(1, fireCount)
  }

  @Test
  fun `rapid signals within the window fire exactly once`() {
    var fireCount = 0
    var now = 0L
    val debouncer = SyncTriggerDebouncer(windowMillis = 5_000L, nowMillis = { now }, onFire = { fireCount++ })

    debouncer.signal()
    now += 1_000L
    debouncer.signal()
    now += 1_000L
    debouncer.signal()
    now += 2_000L
    debouncer.signal() // still < 5_000ms since the first signal

    assertEquals(1, fireCount)
  }

  @Test
  fun `signals separated by more than the window each fire`() {
    var fireCount = 0
    var now = 0L
    val debouncer = SyncTriggerDebouncer(windowMillis = 5_000L, nowMillis = { now }, onFire = { fireCount++ })

    debouncer.signal()
    now += 5_001L
    debouncer.signal()

    assertEquals(2, fireCount)
  }
}
