struct HttpAdapterRequest {
  let method: String
  let url: String
  let headers: [(name: String, value: String)]
  let body: String
  let timeoutMs: Double
}
