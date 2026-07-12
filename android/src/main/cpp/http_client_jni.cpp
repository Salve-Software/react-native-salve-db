#include "../../../../cpp/http/IHttpClient.hpp"
#include <jni.h>

namespace margelo::nitro::salvedb {

namespace {

const char* httpMethodToString(HttpMethod method) {
  switch (method) {
    case HttpMethod::Get: return "GET";
    case HttpMethod::Post: return "POST";
    case HttpMethod::Put: return "PUT";
    case HttpMethod::Patch: return "PATCH";
    case HttpMethod::Delete: return "DELETE";
  }
  return "GET";
}

// Attaches the current thread if it isn't already JNI-attached (OkHttp's
// dispatcher threads aren't). Caller detaches only if this attached it.
JNIEnv* getEnvForCurrentThread(JavaVM* vm, bool& didAttach) {
  JNIEnv* env = nullptr;
  didAttach = false;
  if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) == JNI_EDETACHED) {
    vm->AttachCurrentThread(&env, nullptr);
    didAttach = true;
  }
  return env;
}

jobjectArray toJStringArray(JNIEnv* env, const HttpHeaders& headers, bool names) {
  jclass stringClass = env->FindClass("java/lang/String");
  auto array = env->NewObjectArray(static_cast<jsize>(headers.size()), stringClass, nullptr);
  for (size_t i = 0; i < headers.size(); i++) {
    const std::string& value = names ? headers[i].first : headers[i].second;
    env->SetObjectArrayElement(array, static_cast<jsize>(i), env->NewStringUTF(value.c_str()));
  }
  return array;
}

} // namespace

// Implements IHttpClient by delegating to a Kotlin OkHttpJniBridge instance
// held via NewGlobalRef. Not yet instantiated anywhere in production —
// TASK-012 owns wiring a live instance into SyncOrchestrator.
class JniHttpClientAdapter: public IHttpClient {
public:
  JniHttpClientAdapter(JNIEnv* env, jobject bridge) {
    env->GetJavaVM(&_vm);
    _bridgeGlobalRef = env->NewGlobalRef(bridge);
    jclass cls = env->GetObjectClass(_bridgeGlobalRef);
    _executeMethodId = env->GetMethodID(
      cls, "execute",
      "(JLjava/lang/String;Ljava/lang/String;[Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;J)V"
    );
  }

  ~JniHttpClientAdapter() override {
    bool didAttach;
    JNIEnv* env = getEnvForCurrentThread(_vm, didAttach);
    if (env) env->DeleteGlobalRef(_bridgeGlobalRef);
    if (didAttach) _vm->DetachCurrentThread();
  }

  void execute(const HttpRequest& request, std::function<void(HttpOutcome)> callback) override {
    bool didAttach;
    JNIEnv* env = getEnvForCurrentThread(_vm, didAttach);

    auto* callbackPtr = new std::function<void(HttpOutcome)>(std::move(callback));
    auto requestHandle = reinterpret_cast<jlong>(callbackPtr);

    env->CallVoidMethod(
      _bridgeGlobalRef, _executeMethodId, requestHandle,
      env->NewStringUTF(httpMethodToString(request.method)),
      env->NewStringUTF(request.url.c_str()),
      toJStringArray(env, request.headers, /*names*/ true),
      toJStringArray(env, request.headers, /*names*/ false),
      env->NewStringUTF(request.body.c_str()),
      static_cast<jlong>(request.timeoutMs)
    );

    if (env->ExceptionCheck()) {
      env->ExceptionDescribe();
      env->ExceptionClear();
      delete callbackPtr;
    }

    if (didAttach) _vm->DetachCurrentThread();
  }

private:
  JavaVM* _vm = nullptr;
  jobject _bridgeGlobalRef = nullptr;
  jmethodID _executeMethodId = nullptr;
};

} // namespace margelo::nitro::salvedb

using margelo::nitro::salvedb::HttpHeaders;
using margelo::nitro::salvedb::HttpNetworkError;
using margelo::nitro::salvedb::HttpNetworkErrorKind;
using margelo::nitro::salvedb::HttpOutcome;
using margelo::nitro::salvedb::HttpResponse;

namespace {

std::string jstringToStd(JNIEnv* env, jstring value) {
  if (!value) return "";
  const char* chars = env->GetStringUTFChars(value, nullptr);
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

HttpHeaders jstringArraysToHeaders(JNIEnv* env, jobjectArray names, jobjectArray values) {
  HttpHeaders headers;
  if (!names || !values) return headers;
  jsize count = env->GetArrayLength(names);
  headers.reserve(static_cast<size_t>(count));
  for (jsize i = 0; i < count; i++) {
    auto name = static_cast<jstring>(env->GetObjectArrayElement(names, i));
    auto value = static_cast<jstring>(env->GetObjectArrayElement(values, i));
    headers.emplace_back(jstringToStd(env, name), jstringToStd(env, value));
  }
  return headers;
}

} // namespace

// Called from OkHttpJniBridge.deliver(...) — reconstructs HttpOutcome and
// fires the callback stored (as a heap pointer) at requestHandle, exactly once.
extern "C" JNIEXPORT void JNICALL
Java_com_salvedb_http_OkHttpJniBridge_nativeOnHttpResult(
  JNIEnv* env, jobject /*thiz*/, jlong requestHandle, jint status, jstring body,
  jobjectArray headerNames, jobjectArray headerValues,
  jboolean isNetworkError, jint errorKind, jstring errorMessage
) {
  auto* callbackPtr = reinterpret_cast<std::function<void(HttpOutcome)>*>(requestHandle);

  HttpOutcome outcome = isNetworkError
    ? HttpOutcome(HttpNetworkError{static_cast<HttpNetworkErrorKind>(errorKind), jstringToStd(env, errorMessage)})
    : HttpOutcome(HttpResponse{status, jstringToStd(env, body), jstringArraysToHeaders(env, headerNames, headerValues)});

  (*callbackPtr)(outcome);
  delete callbackPtr;
}
