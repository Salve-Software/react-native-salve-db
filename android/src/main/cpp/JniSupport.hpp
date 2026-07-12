#pragma once

#include <jni.h>
#include <string>

namespace margelo::nitro::salvedb::platform {

// Stores the JavaVM* used by ScopedJNIEnv to attach/detach native threads.
// Call once, before any ScopedJNIEnv is constructed (e.g. from JNI_OnLoad).
void registerJavaVM(JavaVM* vm);

// Attaches the current thread to the JVM on demand, detaches again on
// destruction if this instance was the one that attached. Safe to
// construct from any native thread, not just JNI-originated ones.
class ScopedJNIEnv {
public:
  ScopedJNIEnv();
  ~ScopedJNIEnv();
  JNIEnv* env() const { return _env; }

private:
  JNIEnv* _env = nullptr;
  bool _didAttach = false;
};

// Throws with `context` if a pending Java exception exists, clearing it —
// otherwise a pending exception left on the JNIEnv corrupts the next call.
void throwIfJavaExceptionPending(JNIEnv* env, const std::string& context);

// Resolves and caches a global ref to `binaryClassName`. Returns nullptr
// (clearing the pending exception) if the class can't be found.
jclass resolveGlobalClass(JNIEnv* env, const char* binaryClassName);

} // namespace margelo::nitro::salvedb::platform
