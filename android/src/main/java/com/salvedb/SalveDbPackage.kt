package com.salvedb;

import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.BaseReactPackage;
import com.facebook.react.uimanager.ViewManager;
import com.margelo.nitro.salvedb.SalveDbOnLoad;


public class SalveDbPackage : BaseReactPackage() {
  private var documentsDirectorySet = false

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider { emptyMap() }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    if (!documentsDirectorySet) {
      documentsDirectorySet = true
      nativeSetDocumentsDir(reactContext.filesDir.absolutePath)
      SalveDbSecureStorage.init(reactContext)
    }
    return emptyList()
  }

  companion object {
    @JvmStatic external fun nativeSetDocumentsDir(path: String)

    init {
      SalveDbOnLoad.initializeNative();
    }
  }
}
