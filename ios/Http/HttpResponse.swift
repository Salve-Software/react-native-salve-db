struct HttpResponse {
  let statusCode: Int
  let headers: [(name: String, value: String)]
  let body: String
}
