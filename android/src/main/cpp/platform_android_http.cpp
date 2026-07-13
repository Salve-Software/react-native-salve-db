#include "platform_android_http.hpp"
#include "../../../../cpp/http/HttpTypes.hpp"
#include "../../../../cpp/platform/platform.hpp"
#include "JniSupport.hpp"
#include <algorithm>
#include <mutex>
#include <stdexcept>

namespace margelo::nitro::salvedb::platform {

namespace {

jclass s_httpClientClass = nullptr;
jclass s_resultClass = nullptr;
jclass s_stringClass = nullptr;
jmethodID s_executeMethod = nullptr;
jfieldID s_isSuccessField = nullptr;
jfieldID s_statusCodeField = nullptr;
jfieldID s_responseHeaderNamesField = nullptr;
jfieldID s_responseHeaderValuesField = nullptr;
jfieldID s_responseBodyField = nullptr;
jfieldID s_errorKindField = nullptr;
jfieldID s_errorMessageField = nullptr;

jclass httpClientClass() {
  if (!s_httpClientClass) {
    throw std::runtime_error("SalveDb: SalveDbHttpClient class was not resolved — setJavaVM (JNI_OnLoad) must run first");
  }
  return s_httpClientClass;
}

std::once_flag s_cacheOnceFlag;

void ensureCached(JNIEnv* env) {
  std::call_once(s_cacheOnceFlag, [env]() {
    s_resultClass = resolveGlobalClass(env, "com/salvedb/http/SalveDbHttpJniResult");
    s_stringClass = resolveGlobalClass(env, "java/lang/String");
    s_executeMethod = env->GetStaticMethodID(
      httpClientClass(), "execute",
      "(Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;J)Lcom/salvedb/http/SalveDbHttpJniResult;"
    );
    s_isSuccessField = env->GetFieldID(s_resultClass, "isSuccess", "Z");
    s_statusCodeField = env->GetFieldID(s_resultClass, "statusCode", "I");
    s_responseHeaderNamesField = env->GetFieldID(s_resultClass, "responseHeaderNames", "[Ljava/lang/String;");
    s_responseHeaderValuesField = env->GetFieldID(s_resultClass, "responseHeaderValues", "[Ljava/lang/String;");
    s_responseBodyField = env->GetFieldID(s_resultClass, "responseBody", "Ljava/lang/String;");
    s_errorKindField = env->GetFieldID(s_resultClass, "errorKind", "Ljava/lang/String;");
    s_errorMessageField = env->GetFieldID(s_resultClass, "errorMessage", "Ljava/lang/String;");
  });
}

const char* methodName(HttpMethod method) {
  switch (method) {
    case HttpMethod::Get: return "GET";
    case HttpMethod::Post: return "POST";
    case HttpMethod::Put: return "PUT";
    case HttpMethod::Patch: return "PATCH";
    case HttpMethod::Delete: return "DELETE";
  }
  throw std::runtime_error("SalveDb: unknown HttpMethod");
}

HttpNetworkErrorKind parseErrorKind(const std::string& kind) {
  if (kind == "TIMEOUT") return HttpNetworkErrorKind::Timeout;
  if (kind == "NO_CONNECTION") return HttpNetworkErrorKind::NoConnection;
  if (kind == "CANCELLED") return HttpNetworkErrorKind::Cancelled;
  return HttpNetworkErrorKind::Other;
}

jobjectArray toJStringArray(JNIEnv* env, const std::vector<std::string>& values) {
  jobjectArray array = env->NewObjectArray(static_cast<jsize>(values.size()), s_stringClass, nullptr);
  for (size_t i = 0; i < values.size(); i++) {
    jstring value = env->NewStringUTF(values[i].c_str());
    env->SetObjectArrayElement(array, static_cast<jsize>(i), value);
    env->DeleteLocalRef(value);
  }
  return array;
}

std::string jstringToStd(JNIEnv* env, jstring value) {
  if (!value) return "";
  const char* chars = env->GetStringUTFChars(value, nullptr);
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

} // namespace

void registerHttpClientClass(jclass cls) {
  s_httpClientClass = cls;
}

HttpOutcome httpExecute(const HttpRequest& request) {
  ScopedJNIEnv scoped;
  JNIEnv* env = scoped.env();
  jclass cls = httpClientClass();
  ensureCached(env);

  // Bounds every local ref created below (request/response strings, arrays,
  // the result object) — freed on return or on exception unwind, so a reused
  // attached thread issuing many requests never accumulates local refs.
  ScopedLocalFrame frame(env);

  std::vector<std::string> headerNames;
  std::vector<std::string> headerValues;
  headerNames.reserve(request.headers.size());
  headerValues.reserve(request.headers.size());
  for (const auto& [name, value] : request.headers) {
    headerNames.push_back(name);
    headerValues.push_back(value);
  }

  jstring jMethod = env->NewStringUTF(methodName(request.method));
  jstring jUrl = env->NewStringUTF(request.url.c_str());
  jobjectArray jHeaderNames = toJStringArray(env, headerNames);
  jobjectArray jHeaderValues = toJStringArray(env, headerValues);
  jstring jBody = request.body.has_value() ? env->NewStringUTF(request.body->c_str()) : nullptr;

  jobject jResult = env->CallStaticObjectMethod(
    cls, s_executeMethod, jMethod, jUrl, jHeaderNames, jHeaderValues, jBody, static_cast<jlong>(request.timeoutMs)
  );
  throwIfJavaExceptionPending(env, "SalveDbHttpClient.execute");

  if (env->GetBooleanField(jResult, s_isSuccessField)) {
    int statusCode = env->GetIntField(jResult, s_statusCodeField);
    auto jRespHeaderNames = static_cast<jobjectArray>(env->GetObjectField(jResult, s_responseHeaderNamesField));
    auto jRespHeaderValues = static_cast<jobjectArray>(env->GetObjectField(jResult, s_responseHeaderValuesField));
    auto jRespBody = static_cast<jstring>(env->GetObjectField(jResult, s_responseBodyField));

    jsize count = std::min(env->GetArrayLength(jRespHeaderNames), env->GetArrayLength(jRespHeaderValues));
    HttpHeaders headers;
    headers.reserve(count);
    for (jsize i = 0; i < count; i++) {
      auto name = static_cast<jstring>(env->GetObjectArrayElement(jRespHeaderNames, i));
      auto value = static_cast<jstring>(env->GetObjectArrayElement(jRespHeaderValues, i));
      headers.emplace_back(jstringToStd(env, name), jstringToStd(env, value));
    }

    return HttpResponse{statusCode, std::move(headers), jstringToStd(env, jRespBody)};
  }

  auto jErrorKind = static_cast<jstring>(env->GetObjectField(jResult, s_errorKindField));
  auto jErrorMessage = static_cast<jstring>(env->GetObjectField(jResult, s_errorMessageField));
  return HttpNetworkError{parseErrorKind(jstringToStd(env, jErrorKind)), jstringToStd(env, jErrorMessage)};
}

} // namespace margelo::nitro::salvedb::platform
