#include "../../../../cpp/platform/platform.hpp"
#include "../../../../cpp/platform/platform_android_jni.hpp"
#include "JniSupport.hpp"
#include "platform_android_http.hpp"
#include <stdexcept>
#include <string>

namespace margelo::nitro::salvedb::platform {

static std::string s_documentsDirectory;
static jclass s_secureStorageClass = nullptr;
static jclass s_backgroundSchedulerClass = nullptr;

void setDocumentsDirectory(const std::string& path) {
  s_documentsDirectory = path;
}

std::string getDocumentsDirectory() {
  return s_documentsDirectory;
}

void setJavaVM(JavaVM* vm) {
  registerJavaVM(vm);

  JNIEnv* env = nullptr;
  if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) return;
  s_secureStorageClass = resolveGlobalClass(env, "com/salvedb/SalveDbSecureStorage");
  s_backgroundSchedulerClass = resolveGlobalClass(env, "com/salvedb/SalveDbBackgroundScheduler");
  registerHttpClientClass(resolveGlobalClass(env, "com/salvedb/http/SalveDbHttpClient"));
}

namespace {

jclass secureStorageClass() {
  if (!s_secureStorageClass) {
    throw std::runtime_error("SalveDb: SalveDbSecureStorage class was not resolved — setJavaVM (JNI_OnLoad) must run first");
  }
  return s_secureStorageClass;
}

} // namespace

void setSecureValue(const std::string& key, const std::string& value) {
  ScopedJNIEnv scoped;
  JNIEnv* env = scoped.env();
  jclass cls = secureStorageClass();

  jmethodID mid = env->GetStaticMethodID(cls, "setValue", "(Ljava/lang/String;Ljava/lang/String;)V");
  throwIfJavaExceptionPending(env, "SalveDbSecureStorage.setValue lookup");
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
  throwIfJavaExceptionPending(env, "SalveDbSecureStorage.getValue lookup");
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
  throwIfJavaExceptionPending(env, "SalveDbSecureStorage.deleteValue lookup");
  jstring jKey = env->NewStringUTF(key.c_str());

  env->CallStaticVoidMethod(cls, mid, jKey);

  env->DeleteLocalRef(jKey);
  throwIfJavaExceptionPending(env, "SalveDbSecureStorage.deleteValue(\"" + key + "\")");
}

void scheduleBackgroundSync() {
  if (!s_backgroundSchedulerClass) return;

  ScopedJNIEnv scoped;
  JNIEnv* env = scoped.env();

  jmethodID mid = env->GetStaticMethodID(s_backgroundSchedulerClass, "scheduleFromNative", "()V");
  if (!mid) {
    env->ExceptionClear();
    return;
  }

  env->CallStaticVoidMethod(s_backgroundSchedulerClass, mid);
  env->ExceptionClear();
}

} // namespace margelo::nitro::salvedb::platform

// Called from SalveDbPackage.kt via System.loadLibrary
extern "C" JNIEXPORT void JNICALL
Java_com_salvedb_SalveDbPackage_nativeSetDocumentsDir(JNIEnv* env, jclass, jstring path) {
  const char* str = env->GetStringUTFChars(path, nullptr);
  margelo::nitro::salvedb::platform::setDocumentsDirectory(std::string(str));
  env->ReleaseStringUTFChars(path, str);
}
