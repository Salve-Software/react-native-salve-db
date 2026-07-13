package com.salvedb.http

data class SalveDbHttpRequest(
  val method: SalveDbHttpMethod,
  val url: String,
  val headers: List<Pair<String, String>>,
  val body: String?,
  val timeoutMs: Long,
)
