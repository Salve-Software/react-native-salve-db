package com.salvedb.http

sealed interface HttpResult {
  data class Success(val status: Int, val body: String, val headers: List<Pair<String, String>>) : HttpResult
  data class NetworkError(val kind: NetworkErrorKind, val message: String) : HttpResult
}
