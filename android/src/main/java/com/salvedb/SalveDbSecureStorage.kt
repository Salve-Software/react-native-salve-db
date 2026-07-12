package com.salvedb

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

// Keystore-backed encrypted storage behind CredentialProvider (cpp/credentials).
// Called from native code (platform_android.cpp) via JNI, at arbitrary times
// (foreground sync, background sync worker) — never reachable from JS.
object SalveDbSecureStorage {
  private const val PREFS_FILE_NAME = "salvedb_secure_credentials"

  private var appContext: Context? = null
  private var cachedPrefs: SharedPreferences? = null

  @JvmStatic
  fun init(context: Context) {
    appContext = context.applicationContext
  }

  @JvmStatic
  fun setValue(key: String, value: String) {
    prefs().edit().putString(key, value).apply()
  }

  @JvmStatic
  fun getValue(key: String): String? {
    return prefs().getString(key, null)
  }

  @JvmStatic
  fun deleteValue(key: String) {
    prefs().edit().remove(key).apply()
  }

  @Synchronized
  private fun prefs(): SharedPreferences {
    cachedPrefs?.let { return it }

    val context = appContext
      ?: throw IllegalStateException("SalveDbSecureStorage.init() was not called before secure storage access")

    val masterKey = MasterKey.Builder(context)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()

    val prefs = EncryptedSharedPreferences.create(
      context,
      PREFS_FILE_NAME,
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    cachedPrefs = prefs
    return prefs
  }
}
