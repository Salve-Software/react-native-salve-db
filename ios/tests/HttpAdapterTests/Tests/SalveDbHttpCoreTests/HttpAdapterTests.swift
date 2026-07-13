import XCTest
@testable import SalveDbHttpCore

final class HttpAdapterTests: XCTestCase {

  override func tearDown() {
    StubURLProtocol.reset()
    super.tearDown()
  }

  private func request(
    method: HttpMethod = .get,
    headers: [(name: String, value: String)] = [],
    body: String? = nil,
    timeoutMs: Double = 5000
  ) -> HttpRequest {
    HttpRequest(method: method, url: "https://example.com/path", headers: headers, body: body, timeoutMs: timeoutMs)
  }

  private func execute(_ request: HttpRequest) -> HttpOutcome {
    let expectation = expectation(description: "completion")
    var result: HttpOutcome?
    HttpAdapter(session: StubURLProtocol.session()).execute(request) {
      result = $0
      expectation.fulfill()
    }
    wait(for: [expectation], timeout: 2)
    return result!
  }

  func testGetReturnsTheStubbedStatusAndBody() {
    StubURLProtocol.handler = { _ in
      (HTTPURLResponse(url: URL(string: "https://example.com/path")!, statusCode: 200, httpVersion: nil, headerFields: nil)!,
       "hello".data(using: .utf8)!)
    }

    guard case .success(let response) = execute(request()) else { return XCTFail("expected success") }
    XCTAssertEqual(response.statusCode, 200)
    XCTAssertEqual(response.body, "hello")
  }

  func testEachMethodSendsTheCorrectHTTPMethod() {
    for method in [HttpMethod.get, .post, .put, .patch, .delete] {
      var capturedMethod: String?
      StubURLProtocol.handler = { req in
        capturedMethod = req.httpMethod
        return (HTTPURLResponse(url: URL(string: "https://example.com/path")!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
      }

      _ = execute(request(method: method))
      XCTAssertEqual(capturedMethod, method.rawValue)
    }
  }

  func testRequestBodyArrivesIntact() {
    var capturedBody: Data?
    StubURLProtocol.handler = { req in
      capturedBody = req.httpBody ?? req.httpBodyStream.map { stream -> Data in
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 1024
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while stream.hasBytesAvailable {
          let read = stream.read(&buffer, maxLength: bufferSize)
          if read > 0 { data.append(buffer, count: read) }
        }
        return data
      }
      return (HTTPURLResponse(url: URL(string: "https://example.com/path")!, statusCode: 201, httpVersion: nil, headerFields: nil)!, Data())
    }

    _ = execute(request(method: .post, body: #"{"a":1}"#))
    XCTAssertEqual(capturedBody.flatMap { String(data: $0, encoding: .utf8) }, #"{"a":1}"#)
  }

  func testA500ResponseIsSuccessNotNetworkError() {
    StubURLProtocol.handler = { _ in
      (HTTPURLResponse(url: URL(string: "https://example.com/path")!, statusCode: 500, httpVersion: nil, headerFields: nil)!,
       "boom".data(using: .utf8)!)
    }

    guard case .success(let response) = execute(request()) else { return XCTFail("expected success, not a network error") }
    XCTAssertEqual(response.statusCode, 500)
  }

  func testATransportErrorIsANetworkError() {
    StubURLProtocol.errorToThrow = URLError(.notConnectedToInternet)

    guard case .networkError(let error) = execute(request()) else { return XCTFail("expected a network error") }
    XCTAssertEqual(error.kind, .noConnection)
  }

  func testASlowResponseBeyondTheTimeoutProducesATimeoutError() {
    StubURLProtocol.delay = 2
    StubURLProtocol.handler = { _ in
      (HTTPURLResponse(url: URL(string: "https://example.com/path")!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
    }

    guard case .networkError(let error) = execute(request(timeoutMs: 200)) else { return XCTFail("expected a timeout network error") }
    XCTAssertEqual(error.kind, .timeout)
  }

  func testCustomHeadersAndAnAuthLikeHeaderCoexist() {
    var capturedHeaders: [String: String] = [:]
    StubURLProtocol.handler = { req in
      capturedHeaders = req.allHTTPHeaderFields ?? [:]
      return (HTTPURLResponse(url: URL(string: "https://example.com/path")!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
    }

    _ = execute(request(headers: [(name: "X-Custom", value: "custom-value"), (name: "Authorization", value: "Bearer token")]))
    XCTAssertEqual(capturedHeaders["X-Custom"], "custom-value")
    XCTAssertEqual(capturedHeaders["Authorization"], "Bearer token")
  }

  func testResponseHeadersAreReturned() {
    StubURLProtocol.handler = { _ in
      (HTTPURLResponse(url: URL(string: "https://example.com/path")!, statusCode: 200, httpVersion: nil, headerFields: ["X-Reply": "value"])!, Data())
    }

    guard case .success(let response) = execute(request()) else { return XCTFail("expected success") }
    XCTAssertTrue(response.headers.contains { $0.name == "X-Reply" && $0.value == "value" })
  }
}
