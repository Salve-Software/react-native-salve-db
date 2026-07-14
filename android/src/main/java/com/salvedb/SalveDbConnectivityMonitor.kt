package com.salvedb

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

/**
 * Native offline -> online sync trigger. Registers a ConnectivityManager
 * callback only while the app is in the foreground (ProcessLifecycleOwner
 * onStart/onStop) and calls into the sync engine directly via JNI, without
 * involving the JS engine.
 *
 * Called from native init code, never reachable from JS.
 */
object SalveDbConnectivityMonitor : DefaultLifecycleObserver {
  private var appContext: Context? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  private val debouncer = SyncTriggerDebouncer(windowMillis = 5_000L, onFire = { nativeTriggerSyncAll() })

  @JvmStatic
  fun init(context: Context) {
    appContext = context.applicationContext
    ProcessLifecycleOwner.get().lifecycle.addObserver(this)
  }

  override fun onStart(owner: LifecycleOwner) {
    val context = appContext
      ?: throw IllegalStateException("SalveDbConnectivityMonitor.init() was not called before onStart")

    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        debouncer.signal()
      }
    }
    networkCallback = callback

    val request = NetworkRequest.Builder()
      .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
      .build()
    connectivityManager(context).registerNetworkCallback(request, callback)
  }

  override fun onStop(owner: LifecycleOwner) {
    val context = appContext ?: return
    val callback = networkCallback ?: return
    networkCallback = null
    connectivityManager(context).unregisterNetworkCallback(callback)
  }

  private fun connectivityManager(context: Context): ConnectivityManager {
    return context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  }

  @JvmStatic
  private external fun nativeTriggerSyncAll()
}
