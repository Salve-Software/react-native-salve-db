package com.salvedb.http

import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

enum class SalveDbHttpErrorKind {
  TIMEOUT,
  NO_CONNECTION,
  CANCELLED,
  OTHER;

  companion object {
    // OkHttp's own callTimeout cancels the call internally when it fires, so
    // isCancelled is true for both a real cancel() and a timeout — the
    // exception shape must be checked first to tell them apart.
    fun from(exception: Throwable, isCancelled: Boolean): SalveDbHttpErrorKind = when {
      exception is SocketTimeoutException -> TIMEOUT
      exception is InterruptedIOException && exception.message == "timeout" -> TIMEOUT
      isCancelled -> CANCELLED
      exception is UnknownHostException || exception is ConnectException -> NO_CONNECTION
      else -> OTHER
    }
  }
}
