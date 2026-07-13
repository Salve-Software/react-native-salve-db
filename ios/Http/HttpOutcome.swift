enum HttpOutcome {
  case success(HttpResponse)
  case networkError(HttpNetworkError)
}
