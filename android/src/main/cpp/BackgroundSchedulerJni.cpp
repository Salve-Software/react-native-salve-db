#include "../../../../cpp/sync/SyncNativeEntryPoint.hpp"
#include <jni.h>

using margelo::nitro::salvedb::nativeBackgroundConstraints;
using margelo::nitro::salvedb::wakeBackgroundSyncFromNative;

extern "C" {

JNIEXPORT void JNICALL
Java_com_salvedb_SalveDbBackgroundScheduler_nativeWakeBackgroundSync(JNIEnv*, jclass) {
  wakeBackgroundSyncFromNative();
}

JNIEXPORT jdoubleArray JNICALL
Java_com_salvedb_SalveDbBackgroundScheduler_nativeBackgroundConstraintsSnapshot(JNIEnv* env, jclass) {
  auto constraints = nativeBackgroundConstraints();
  jdouble values[4] = {
    constraints.hasConfig ? 1.0 : 0.0,
    constraints.minimumIntervalMs,
    constraints.requiresNetwork ? 1.0 : 0.0,
    constraints.requiresCharging ? 1.0 : 0.0,
  };
  jdoubleArray result = env->NewDoubleArray(4);
  env->SetDoubleArrayRegion(result, 0, 4, values);
  return result;
}

} // extern "C"
