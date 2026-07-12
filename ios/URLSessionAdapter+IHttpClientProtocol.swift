import Foundation

extension URLSessionAdapter: IHttpClientProtocol {
  func execute(
    method: String, url: String,
    headerNames: [String], headerValues: [String],
    body: String, timeoutMs: Double,
    completion: @escaping (Int, String?, [String]?, [String]?, Bool, HttpNetworkErrorKind, String?) -> Void
  ) {
    let headers = Array(zip(headerNames, headerValues))
    let request = HttpAdapterRequest(method: method, url: url, headers: headers, body: body, timeoutMs: timeoutMs)

    Task {
      switch await execute(request) {
      case .response(let status, let body, let headers):
        completion(status, body, headers.map(\.0), headers.map(\.1), false, .other, nil)
      case .networkError(let kind, let message):
        completion(0, nil, nil, nil, true, kind.toObjC(), message)
      }
    }
  }
}
