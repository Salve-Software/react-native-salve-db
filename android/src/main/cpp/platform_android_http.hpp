#pragma once

#include <jni.h>

namespace margelo::nitro::salvedb::platform {

// Called once from setJavaVM (JNI_OnLoad) to cache the SalveDbHttpClient class.
void registerHttpClientClass(jclass cls);

} // namespace margelo::nitro::salvedb::platform
