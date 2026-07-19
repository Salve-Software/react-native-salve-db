package com.salvedb

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

// Owns the single global WorkManager job waking the native sync engine.
// scheduleFromNative() is called both from SalveDbPackage's init (process
// start / reboot) and from native code (platform::scheduleBackgroundSync(),
// right after Database.configure() persists a new background config).
object SalveDbBackgroundScheduler {
  private const val UNIQUE_WORK_NAME = "com.salvedb.background-sync"

  @Volatile private var appContext: Context? = null

  @JvmStatic
  fun init(context: Context) {
    appContext = context.applicationContext
    scheduleFromNative()
  }

  @JvmStatic
  fun wake() {
    nativeWakeBackgroundSync()
  }

  @JvmStatic
  fun scheduleFromNative() {
    val context = appContext ?: return
    val workManager = WorkManager.getInstance(context)

    val snapshot = nativeBackgroundConstraintsSnapshot()
    val decision = backgroundScheduleDecision(
      hasConfig = snapshot[0] != 0.0,
      minimumIntervalMs = snapshot[1],
      requiresNetwork = snapshot[2] != 0.0,
      requiresCharging = snapshot[3] != 0.0,
      floorMs = PeriodicWorkRequest.MIN_PERIODIC_INTERVAL_MILLIS,
    )

    when (decision) {
      is BackgroundScheduleDecision.Cancel -> workManager.cancelUniqueWork(UNIQUE_WORK_NAME)
      is BackgroundScheduleDecision.Enqueue -> {
        val constraints = Constraints.Builder()
          .setRequiredNetworkType(if (decision.requiresNetwork) NetworkType.CONNECTED else NetworkType.NOT_REQUIRED)
          .setRequiresCharging(decision.requiresCharging)
          .build()

        val request = PeriodicWorkRequestBuilder<SalveDbBackgroundWorker>(decision.intervalMs, TimeUnit.MILLISECONDS)
          .setConstraints(constraints)
          .build()

        workManager.enqueueUniquePeriodicWork(UNIQUE_WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
      }
    }
  }

  @JvmStatic private external fun nativeWakeBackgroundSync()
  @JvmStatic private external fun nativeBackgroundConstraintsSnapshot(): DoubleArray
}
