#include "../../../../cpp/sync/SyncNativeEntryPoint.hpp"
#include <jni.h>

// Called from SalveDbConnectivityMonitor.kt when the native connectivity
// monitor detects an offline -> online transition.
extern "C" JNIEXPORT void JNICALL
Java_com_salvedb_SalveDbConnectivityMonitor_nativeTriggerSyncAll(JNIEnv*, jclass) {
  margelo::nitro::salvedb::triggerSyncAllFromNative();
}
