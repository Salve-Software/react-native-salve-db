package com.salvedb.http

// JNI marshaling type only — native code reads these fields directly via
// cached JNI field IDs (@JvmField keeps them plain public fields). Not used
// anywhere else in Kotlin.
class SalveDbHttpJniResult private constructor(
  @JvmField val isSuccess: Boolean,
  @JvmField val statusCode: Int,
  @JvmField val responseHeaderNames: Array<String>,
  @JvmField val responseHeaderValues: Array<String>,
  @JvmField val responseBody: String,
  @JvmField val errorKind: String,
  @JvmField val errorMessage: String,
) {
  companion object {
    fun from(outcome: SalveDbHttpOutcome): SalveDbHttpJniResult = when (outcome) {
      is SalveDbHttpOutcome.Success -> SalveDbHttpJniResult(
        isSuccess = true,
        statusCode = outcome.statusCode,
        responseHeaderNames = outcome.headers.map { it.first }.toTypedArray(),
        responseHeaderValues = outcome.headers.map { it.second }.toTypedArray(),
        responseBody = outcome.body,
        errorKind = "",
        errorMessage = "",
      )
      is SalveDbHttpOutcome.NetworkError -> SalveDbHttpJniResult(
        isSuccess = false,
        statusCode = 0,
        responseHeaderNames = emptyArray(),
        responseHeaderValues = emptyArray(),
        responseBody = "",
        errorKind = outcome.kind.name,
        errorMessage = outcome.message,
      )
    }
  }
}
