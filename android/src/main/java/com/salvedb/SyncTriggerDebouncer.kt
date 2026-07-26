package com.salvedb

/** Coalesces rapid [signal] calls into at most one [onFire] per [windowMillis]. */
class SyncTriggerDebouncer(
  private val windowMillis: Long,
  private val nowMillis: () -> Long = System::currentTimeMillis,
  private val onFire: () -> Unit,
) {
  private var lastFiredAt: Long? = null

  @Synchronized
  fun signal() {
    val now = nowMillis()
    val last = lastFiredAt
    if (last != null && now - last < windowMillis) return

    lastFiredAt = now
    onFire()
  }
}
