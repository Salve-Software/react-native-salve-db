#include "JniSupport.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb::platform {

namespace {
JavaVM* s_javaVm = nullptr;
} // namespace

void registerJavaVM(JavaVM* vm) {
  s_javaVm = vm;
}

ScopedJNIEnv::ScopedJNIEnv() {
  if (!s_javaVm) {
    throw std::runtime_error("SalveDb: JavaVM not registered — JNI_OnLoad must run before native JNI calls");
  }
  jint status = s_javaVm->GetEnv(reinterpret_cast<void**>(&_env), JNI_VERSION_1_6);
  if (status == JNI_EDETACHED) {
    if (s_javaVm->AttachCurrentThread(&_env, nullptr) != JNI_OK) {
      throw std::runtime_error("SalveDb: failed to attach current thread to JVM");
    }
    _didAttach = true;
  } else if (status != JNI_OK) {
    throw std::runtime_error("SalveDb: JNI GetEnv failed");
  }
}

ScopedJNIEnv::~ScopedJNIEnv() {
  if (_didAttach) s_javaVm->DetachCurrentThread();
}

void throwIfJavaExceptionPending(JNIEnv* env, const std::string& context) {
  if (!env->ExceptionCheck()) return;
  env->ExceptionClear();
  throw std::runtime_error("SalveDb: " + context + " threw a Java exception");
}

jclass resolveGlobalClass(JNIEnv* env, const char* binaryClassName) {
  jclass localClass = env->FindClass(binaryClassName);
  if (localClass == nullptr) {
    env->ExceptionClear();
    return nullptr;
  }
  jclass globalClass = static_cast<jclass>(env->NewGlobalRef(localClass));
  env->DeleteLocalRef(localClass);
  return globalClass;
}

} // namespace margelo::nitro::salvedb::platform
