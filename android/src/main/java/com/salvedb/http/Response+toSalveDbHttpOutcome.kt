package com.salvedb.http

import okhttp3.Response

internal fun Response.toSalveDbHttpOutcome(): SalveDbHttpOutcome {
  val headerPairs = (0 until headers.size).map { headers.name(it) to headers.value(it) }
  return SalveDbHttpOutcome.Success(code, headerPairs, body?.string() ?: "")
}
