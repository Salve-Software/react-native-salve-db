import Foundation

final class URLSessionAdapter {
  private let session: URLSession

  init(session: URLSession = .shared) {
    self.session = session
  }

  func execute(_ request: HttpAdapterRequest) async -> HttpAdapterOutcome {
    guard let url = URL(string: request.url) else {
      return .networkError(kind: .other, message: "invalid URL: \(request.url)")
    }

    var urlRequest = URLRequest(url: url)
    urlRequest.httpMethod = request.method
    urlRequest.timeoutInterval = request.timeoutMs / 1000.0
    for (name, value) in request.headers {
      urlRequest.addValue(value, forHTTPHeaderField: name)
    }
    if !request.body.isEmpty {
      urlRequest.httpBody = request.body.data(using: .utf8)
    }

    do {
      let (data, response) = try await session.data(for: urlRequest)
      guard let httpResponse = response as? HTTPURLResponse else {
        return .networkError(kind: .other, message: "non-HTTP response")
      }
      let body = String(data: data, encoding: .utf8) ?? ""
      return .response(status: httpResponse.statusCode, body: body, headers: headerPairs(from: httpResponse))
    } catch {
      return .networkError(kind: .from(error), message: error.localizedDescription)
    }
  }
}

private func headerPairs(from response: HTTPURLResponse) -> [(String, String)] {
  response.allHeaderFields.compactMap { key, value in
    guard let name = key as? String else { return nil }
    return (name, String(describing: value))
  }
}
