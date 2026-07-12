import XCTest
@testable import SalveDbHttp

final class URLSessionAdapterTests: XCTestCase {

  override func tearDown() {
    StubURLProtocol.handler = nil
    StubURLProtocol.delay = 0
    super.tearDown()
  }

  private func adapter() -> URLSessionAdapter {
    URLSessionAdapter(session: StubURLProtocol.session())
  }

  func testRoundTripsAllMethods() async {
    for method in ["GET", "POST", "PUT", "PATCH", "DELETE"] {
      StubURLProtocol.handler = { request in
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        return (response, Data(#"{"ok":true}"#.utf8))
      }

      let outcome = await adapter().execute(
        HttpAdapterRequest(method: method, url: "https://example.com/x", headers: [], body: "{}", timeoutMs: 5000)
      )

      guard case .response(let status, let body, _) = outcome else {
        XCTFail("expected .response for \(method)")
        continue
      }
      XCTAssertEqual(status, 200)
      XCTAssertEqual(body, #"{"ok":true}"#)
    }
  }

  func testTimeoutSurfacesAsNetworkErrorWithinBound() async {
    StubURLProtocol.delay = 2.0
    StubURLProtocol.handler = { request in
      (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
    }

    let start = Date()
    let outcome = await adapter().execute(
      HttpAdapterRequest(method: "GET", url: "https://example.com/slow", headers: [], body: "", timeoutMs: 200)
    )
    let elapsed = Date().timeIntervalSince(start)

    guard case .networkError(let kind, _) = outcome else {
      return XCTFail("expected .networkError, got \(outcome)")
    }
    XCTAssertEqual(kind, .timeout)
    XCTAssertLessThan(elapsed, 1.0, "expected timeout well under the 2s delay")
  }

  func testNoConnectionSurfacesAsNetworkErrorDistinctFromHttpError() async {
    StubURLProtocol.handler = nil

    let outcome = await adapter().execute(
      HttpAdapterRequest(method: "GET", url: "https://example.com/down", headers: [], body: "", timeoutMs: 5000)
    )

    guard case .networkError = outcome else {
      return XCTFail("expected .networkError, got \(outcome)")
    }
  }

  func testA500ResponseIsAResponseNotANetworkError() async {
    StubURLProtocol.handler = { request in
      (HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!, Data("boom".utf8))
    }

    let outcome = await adapter().execute(
      HttpAdapterRequest(method: "GET", url: "https://example.com/x", headers: [], body: "", timeoutMs: 5000)
    )

    guard case .response(let status, _, _) = outcome else {
      return XCTFail("expected .response, got \(outcome)")
    }
    XCTAssertEqual(status, 500)
  }

  func testCustomAndAuthHeadersCoexistWithoutClobbering() async {
    var capturedHeaders: [String: String] = [:]
    StubURLProtocol.handler = { request in
      capturedHeaders = request.allHTTPHeaderFields ?? [:]
      return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
    }

    _ = await adapter().execute(
      HttpAdapterRequest(
        method: "GET", url: "https://example.com/x",
        headers: [("X-Custom", "a"), ("Authorization", "Bearer xyz")],
        body: "", timeoutMs: 5000
      )
    )

    XCTAssertEqual(capturedHeaders["X-Custom"], "a")
    XCTAssertEqual(capturedHeaders["Authorization"], "Bearer xyz")
  }
}
