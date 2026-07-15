#include "../../../../cpp/sync/SyncNativeEntryPoint.hpp"
#include <jni.h>

using margelo::nitro::salvedb::nativeBackgroundConstraints;
using margelo::nitro::salvedb::wakeBackgroundSyncFromNative;

extern "C" {

JNIEXPORT void JNICALL
Java_com_salvedb_SalveDbBackgroundScheduler_nativeWakeBackgroundSync(JNIEnv*, jclass) {
  wakeBackgroundSyncFromNative();
}

JNIEXPORT jboolean JNICALL
Java_com_salvedb_SalveDbBackgroundScheduler_nativeBackgroundHasConfig(JNIEnv*, jclass) {
  return nativeBackgroundConstraints().hasConfig;
}

JNIEXPORT jdouble JNICALL
Java_com_salvedb_SalveDbBackgroundScheduler_nativeBackgroundMinimumIntervalMs(JNIEnv*, jclass) {
  return nativeBackgroundConstraints().minimumIntervalMs;
}

JNIEXPORT jboolean JNICALL
Java_com_salvedb_SalveDbBackgroundScheduler_nativeBackgroundRequiresNetwork(JNIEnv*, jclass) {
  return nativeBackgroundConstraints().requiresNetwork;
}

JNIEXPORT jboolean JNICALL
Java_com_salvedb_SalveDbBackgroundScheduler_nativeBackgroundRequiresCharging(JNIEnv*, jclass) {
  return nativeBackgroundConstraints().requiresCharging;
}

} // extern "C"
