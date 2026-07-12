import Foundation

final class StubURLProtocol: URLProtocol {
  static var handler: ((URLRequest) -> (HTTPURLResponse, Data)?)?
  static var delay: TimeInterval = 0

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    guard let handler = StubURLProtocol.handler, let (response, data) = handler(request) else {
      client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
      return
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + StubURLProtocol.delay) { [client, self] in
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    }
  }

  override func stopLoading() {}

  static func session() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubURLProtocol.self]
    return URLSession(configuration: config)
  }
}
