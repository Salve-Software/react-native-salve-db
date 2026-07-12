package com.salvedb.http

import java.util.concurrent.TimeUnit
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class OkHttpAdapterTest {

  private lateinit var server: MockWebServer
  private val adapter = OkHttpAdapter()

  @Before
  fun setUp() {
    server = MockWebServer()
    server.start()
  }

  @After
  fun tearDown() {
    server.shutdown()
  }

  private fun request(
    method: SalveDbHttpMethod,
    headers: List<Pair<String, String>> = emptyList(),
    body: String? = null,
    timeoutMs: Long = 5000,
  ) = SalveDbHttpRequest(method, server.url("/").toString(), headers, body, timeoutMs)

  @Test
  fun `GET returns the mocked status and body`() {
    server.enqueue(MockResponse().setResponseCode(200).setBody("hello"))

    val outcome = adapter.execute(request(SalveDbHttpMethod.GET)) as SalveDbHttpOutcome.Success
    assertEquals(200, outcome.statusCode)
    assertEquals("hello", outcome.body)
  }

  @Test
  fun `POST sends the request body intact`() {
    server.enqueue(MockResponse().setResponseCode(201))

    adapter.execute(request(SalveDbHttpMethod.POST, body = """{"a":1}"""))

    val recorded = server.takeRequest()
    assertEquals("POST", recorded.method)
    assertEquals("""{"a":1}""", recorded.body.readUtf8())
  }

  @Test
  fun `PUT sends the request body intact`() {
    server.enqueue(MockResponse().setResponseCode(200))
    adapter.execute(request(SalveDbHttpMethod.PUT, body = """{"a":2}"""))
    assertEquals("PUT", server.takeRequest().method)
  }

  @Test
  fun `PATCH sends the request body intact`() {
    server.enqueue(MockResponse().setResponseCode(200))
    adapter.execute(request(SalveDbHttpMethod.PATCH, body = """{"a":3}"""))
    assertEquals("PATCH", server.takeRequest().method)
  }

  @Test
  fun `DELETE without a body succeeds`() {
    server.enqueue(MockResponse().setResponseCode(204))
    val outcome = adapter.execute(request(SalveDbHttpMethod.DELETE)) as SalveDbHttpOutcome.Success
    assertEquals(204, outcome.statusCode)
    assertEquals("DELETE", server.takeRequest().method)
  }

  @Test
  fun `a 500 response is a Success outcome, not a network error`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("boom"))

    val outcome = adapter.execute(request(SalveDbHttpMethod.GET))
    assertTrue(outcome is SalveDbHttpOutcome.Success)
    assertEquals(500, (outcome as SalveDbHttpOutcome.Success).statusCode)
  }

  @Test
  fun `a shutdown server produces a NetworkError`() {
    val url = server.url("/").toString()
    server.shutdown()

    val outcome = adapter.execute(SalveDbHttpRequest(SalveDbHttpMethod.GET, url, emptyList(), null, 2000))
    assertTrue(outcome is SalveDbHttpOutcome.NetworkError)
  }

  @Test
  fun `a slow response beyond the timeout produces a TIMEOUT NetworkError`() {
    server.enqueue(MockResponse().setResponseCode(200).setBody("slow-response").setBodyDelay(2, TimeUnit.SECONDS))

    val outcome = adapter.execute(request(SalveDbHttpMethod.GET, timeoutMs = 200))
    assertTrue(outcome is SalveDbHttpOutcome.NetworkError)
    assertEquals(SalveDbHttpErrorKind.TIMEOUT, (outcome as SalveDbHttpOutcome.NetworkError).kind)
  }

  @Test
  fun `custom headers and an auth-like header coexist without overwriting`() {
    server.enqueue(MockResponse().setResponseCode(200))

    adapter.execute(
      request(
        SalveDbHttpMethod.GET,
        headers = listOf("X-Custom" to "custom-value", "Authorization" to "Bearer token"),
      )
    )

    val recorded = server.takeRequest()
    assertEquals("custom-value", recorded.getHeader("X-Custom"))
    assertEquals("Bearer token", recorded.getHeader("Authorization"))
  }

  @Test
  fun `response headers are returned`() {
    server.enqueue(MockResponse().setResponseCode(200).addHeader("X-Reply", "value"))

    val outcome = adapter.execute(request(SalveDbHttpMethod.GET)) as SalveDbHttpOutcome.Success
    assertTrue(outcome.headers.any { it.first == "X-Reply" && it.second == "value" })
  }
}
