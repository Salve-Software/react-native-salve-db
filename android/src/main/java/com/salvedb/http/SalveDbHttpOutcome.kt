package com.salvedb.http

sealed interface SalveDbHttpOutcome {
  data class Success(val statusCode: Int, val headers: List<Pair<String, String>>, val body: String) : SalveDbHttpOutcome
  data class NetworkError(val kind: SalveDbHttpErrorKind, val message: String) : SalveDbHttpOutcome
}
