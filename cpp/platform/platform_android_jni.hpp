#pragma once

#include <jni.h>

namespace margelo::nitro::salvedb::platform {

// Called once from JNI_OnLoad — lets platform_android.cpp attach the
// calling thread to the JVM later, from arbitrary native call sites
// (foreground sync, background sync worker), not just JNI-originated ones.
void setJavaVM(JavaVM* vm);

} // namespace margelo::nitro::salvedb::platform
