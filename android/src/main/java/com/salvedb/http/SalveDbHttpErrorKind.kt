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
    fun from(exception: Throwable, isCancelled: Boolean): SalveDbHttpErrorKind = when {
      isCancelled -> CANCELLED
      exception is SocketTimeoutException -> TIMEOUT
      exception is InterruptedIOException && exception.message == "timeout" -> TIMEOUT
      exception is UnknownHostException || exception is ConnectException -> NO_CONNECTION
      else -> OTHER
    }
  }
}
