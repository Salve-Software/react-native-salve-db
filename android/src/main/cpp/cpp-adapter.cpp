#include <jni.h>
#include <fbjni/fbjni.h>
#include "SalveDbOnLoad.hpp"
#include "../../../../cpp/platform/platform_android_jni.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  margelo::nitro::salvedb::platform::setJavaVM(vm);
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::salvedb::registerAllNatives();
  });
}