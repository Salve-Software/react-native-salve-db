#pragma once

#include <jni.h>

namespace margelo::nitro::salvedb::platform {

// Called once from setJavaVM (JNI_OnLoad) to cache the SalveDbHttpClient class.
void registerHttpClientClass(jclass cls);

// Called once from setJavaVM (JNI_OnLoad), on the thread that loaded the
// library. FindClass only reliably resolves app classes from that thread —
// a background thread later attached via AttachCurrentThread (e.g. the sync
// engine's own thread, where httpExecute's first real call usually lands)
// falls back to the bootstrap classloader and silently fails the lookup.
void primeHttpJniCache(JNIEnv* env);

} // namespace margelo::nitro::salvedb::platform
