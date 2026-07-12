enum HttpAdapterOutcome {
  case response(status: Int, body: String, headers: [(String, String)])
  case networkError(kind: NetworkErrorKind, message: String)
}
