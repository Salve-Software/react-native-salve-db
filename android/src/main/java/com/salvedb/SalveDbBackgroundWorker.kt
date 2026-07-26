package com.salvedb

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// WorkManager job handler. Runs even in a process where JS never started
// this launch — bootstraps documents dir and secure storage natively
// before waking the sync engine.
class SalveDbBackgroundWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    SalveDbPackage.nativeSetDocumentsDir(applicationContext.filesDir.absolutePath)
    SalveDbSecureStorage.init(applicationContext)
    SalveDbBackgroundScheduler.wake()
    Result.success()
  }
}
