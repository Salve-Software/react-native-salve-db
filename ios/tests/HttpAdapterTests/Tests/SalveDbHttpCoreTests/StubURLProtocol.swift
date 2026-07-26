import Foundation

final class StubURLProtocol: URLProtocol {
  static var handler: ((URLRequest) -> (HTTPURLResponse, Data)?)?
  static var errorToThrow: Error?
  static var delay: TimeInterval = 0

  private let lock = NSLock()
  private var _isCancelled = false
  private var isCancelled: Bool {
    get { lock.withLock { _isCancelled } }
    set { lock.withLock { _isCancelled = newValue } }
  }

  override static func canInit(with request: URLRequest) -> Bool { true }
  override static func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    if let error = StubURLProtocol.errorToThrow {
      client?.urlProtocol(self, didFailWithError: error)
      return
    }
    guard let (response, data) = StubURLProtocol.handler?(request) else {
      client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
      return
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + StubURLProtocol.delay) { [client, self] in
      guard !isCancelled else { return }
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    }
  }

  override func stopLoading() {
    isCancelled = true
  }

  static func session() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubURLProtocol.self]
    return URLSession(configuration: config)
  }

  static func reset() {
    handler = nil
    errorToThrow = nil
    delay = 0
  }
}
