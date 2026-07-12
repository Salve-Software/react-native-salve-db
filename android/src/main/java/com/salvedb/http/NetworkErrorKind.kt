package com.salvedb.http

import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

enum class NetworkErrorKind {
  TIMEOUT, NO_CONNECTION, CANCELLED, OTHER;

  companion object {
    // OkHttp's callTimeout fires as an InterruptedIOException("timeout"), not a
    // SocketTimeoutException — that one's reserved for connect/read/write timeouts.
    fun from(exception: Throwable): NetworkErrorKind = when {
      exception is SocketTimeoutException -> TIMEOUT
      exception is InterruptedIOException && exception.message == "timeout" -> TIMEOUT
      exception is UnknownHostException -> NO_CONNECTION
      exception.message?.contains("Canceled", ignoreCase = true) == true -> CANCELLED
      else -> OTHER
    }
  }
}
