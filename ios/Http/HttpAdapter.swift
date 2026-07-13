import Foundation

final class HttpAdapter {
  private let session: URLSession

  init(session: URLSession = .shared) {
    self.session = session
  }

  func execute(_ request: HttpRequest, completion: @escaping (HttpOutcome) -> Void) {
    guard let url = URL(string: request.url) else {
      completion(.networkError(HttpNetworkError(kind: .other, message: "invalid URL: \(request.url)")))
      return
    }

    var urlRequest = URLRequest(url: url)
    urlRequest.httpMethod = request.method.rawValue
    urlRequest.timeoutInterval = request.timeoutMs / 1000
    for header in request.headers {
      urlRequest.addValue(header.value, forHTTPHeaderField: header.name)
    }
    if let body = request.body {
      urlRequest.httpBody = body.data(using: .utf8)
    }

    let task = session.dataTask(with: urlRequest) { data, response, error in
      if let urlError = error as? URLError {
        completion(.networkError(HttpNetworkError(kind: .from(urlError), message: urlError.localizedDescription)))
        return
      }
      if let error = error {
        completion(.networkError(HttpNetworkError(kind: .other, message: error.localizedDescription)))
        return
      }
      guard let httpResponse = response as? HTTPURLResponse else {
        completion(.networkError(HttpNetworkError(kind: .other, message: "no HTTP response")))
        return
      }
      guard let data = data, let body = String(data: data, encoding: .utf8) else {
        completion(.networkError(HttpNetworkError(kind: .other, message: "response body is not valid UTF-8")))
        return
      }

      let headers = httpResponse.allHeaderFields.compactMap { key, value -> (name: String, value: String)? in
        guard let name = key as? String, let value = value as? String else { return nil }
        return (name: name, value: value)
      }
      completion(.success(HttpResponse(statusCode: httpResponse.statusCode, headers: headers, body: body)))
    }
    task.resume()
  }
}
