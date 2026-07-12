#include "../../../../cpp/platform/platform.hpp"
#include "../../../../cpp/platform/platform_android_jni.hpp"
#include <jni.h>
#include <stdexcept>
#include <string>

namespace margelo::nitro::salvedb::platform {

static std::string s_documentsDirectory;
static JavaVM* s_javaVm = nullptr;
static jclass s_secureStorageClass = nullptr;

void setDocumentsDirectory(const std::string& path) {
  s_documentsDirectory = path;
}

std::string getDocumentsDirectory() {
  return s_documentsDirectory;
}

void setJavaVM(JavaVM* vm) {
  s_javaVm = vm;

  JNIEnv* env = nullptr;
  if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) return;
  jclass localClass = env->FindClass("com/salvedb/SalveDbSecureStorage");
  if (localClass == nullptr) {
    env->ExceptionClear();
    return;
  }
  s_secureStorageClass = static_cast<jclass>(env->NewGlobalRef(localClass));
  env->DeleteLocalRef(localClass);
}

namespace {

jclass secureStorageClass() {
  if (!s_secureStorageClass) {
    throw std::runtime_error("SalveDb: SalveDbSecureStorage class was not resolved — setJavaVM (JNI_OnLoad) must run first");
  }
  return s_secureStorageClass;
}

// Secure storage calls can happen from any native thread (foreground sync,
// background sync worker), not just ones the JVM already attached — so this
// attaches on demand and detaches again if it was the one that attached.
class ScopedJNIEnv {
public:
  ScopedJNIEnv() {
    if (!s_javaVm) {
      throw std::runtime_error("SalveDb: JavaVM not set — JNI_OnLoad must run before secure storage access");
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

  ~ScopedJNIEnv() {
    if (_didAttach) s_javaVm->DetachCurrentThread();
  }

  JNIEnv* env() const { return _env; }

private:
  JNIEnv* _env = nullptr;
  bool _didAttach = false;
};

// Throws with `context` if a pending Java exception exists, clearing it —
// otherwise a pending exception left on the JNIEnv corrupts the next call.
void throwIfJavaExceptionPending(JNIEnv* env, const std::string& context) {
  if (!env->ExceptionCheck()) return;
  env->ExceptionClear();
  throw std::runtime_error("SalveDb: " + context + " threw a Java exception");
}

} // namespace

void setSecureValue(const std::string& key, const std::string& value) {
  ScopedJNIEnv scoped;
  JNIEnv* env = scoped.env();
  jclass cls = secureStorageClass();

  jmethodID mid = env->GetStaticMethodID(cls, "setValue", "(Ljava/lang/String;Ljava/lang/String;)V");
  jstring jKey = env->NewStringUTF(key.c_str());
  jstring jValue = env->NewStringUTF(value.c_str());

  env->CallStaticVoidMethod(cls, mid, jKey, jValue);

  env->DeleteLocalRef(jKey);
  env->DeleteLocalRef(jValue);
  throwIfJavaExceptionPending(env, "SalveDbSecureStorage.setValue(\"" + key + "\")");
}

std::optional<std::string> getSecureValue(const std::string& key) {
  ScopedJNIEnv scoped;
  JNIEnv* env = scoped.env();
  jclass cls = secureStorageClass();

  jmethodID mid = env->GetStaticMethodID(cls, "getValue", "(Ljava/lang/String;)Ljava/lang/String;");
  jstring jKey = env->NewStringUTF(key.c_str());

  auto jResult = static_cast<jstring>(env->CallStaticObjectMethod(cls, mid, jKey));

  env->DeleteLocalRef(jKey);
  throwIfJavaExceptionPending(env, "SalveDbSecureStorage.getValue(\"" + key + "\")");

  if (jResult == nullptr) return std::nullopt;
  const char* chars = env->GetStringUTFChars(jResult, nullptr);
  std::string result(chars);
  env->ReleaseStringUTFChars(jResult, chars);
  env->DeleteLocalRef(jResult);
  return result;
}

void deleteSecureValue(const std::string& key) {
  ScopedJNIEnv scoped;
  JNIEnv* env = scoped.env();
  jclass cls = secureStorageClass();

  jmethodID mid = env->GetStaticMethodID(cls, "deleteValue", "(Ljava/lang/String;)V");
  jstring jKey = env->NewStringUTF(key.c_str());

  env->CallStaticVoidMethod(cls, mid, jKey);

  env->DeleteLocalRef(jKey);
  throwIfJavaExceptionPending(env, "SalveDbSecureStorage.deleteValue(\"" + key + "\")");
}

} // namespace margelo::nitro::salvedb::platform

// Called from SalveDbPackage.kt via System.loadLibrary
extern "C" JNIEXPORT void JNICALL
Java_com_salvedb_SalveDbPackage_nativeSetDocumentsDir(JNIEnv* env, jclass, jstring path) {
  const char* str = env->GetStringUTFChars(path, nullptr);
  margelo::nitro::salvedb::platform::setDocumentsDirectory(std::string(str));
  env->ReleaseStringUTFChars(path, str);
}
