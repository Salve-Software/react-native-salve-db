package com.salvedb.http

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class OkHttpAdapterTest {

  private val server = MockWebServer()
  private val adapter = OkHttpAdapter()
  private var serverShutdown = false

  @Before
  fun startServer() {
    server.start()
  }

  @After
  fun stopServer() {
    if (!serverShutdown) server.shutdown()
  }

  private fun execute(request: HttpAdapterRequest): HttpResult {
    val latch = CountDownLatch(1)
    var result: HttpResult? = null
    adapter.execute(request) {
      result = it
      latch.countDown()
    }
    assertTrue("adapter never invoked its callback", latch.await(5, TimeUnit.SECONDS))
    return result!!
  }

  private fun requestFor(method: String, path: String = "/", headers: List<Pair<String, String>> = emptyList()) =
    HttpAdapterRequest(method, server.url(path).toString(), headers, body = "{}", timeoutMs = 5000)

  @Test
  fun `round-trips GET POST PUT PATCH DELETE`() {
    for (method in listOf("GET", "POST", "PUT", "PATCH", "DELETE")) {
      server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))

      val result = execute(requestFor(method))

      val success = result as HttpResult.Success
      assertEquals(200, success.status)
      assertEquals("""{"ok":true}""", success.body)
      assertEquals(method, server.takeRequest().method)
    }
  }

  @Test
  fun `timeout surfaces as NetworkError within the configured bound`() {
    server.enqueue(MockResponse().setBodyDelay(2, TimeUnit.SECONDS).setBody("too-late"))

    val start = System.nanoTime()
    val result = execute(requestFor("GET").copy(timeoutMs = 200))
    val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start)

    val error = result as HttpResult.NetworkError
    assertEquals(NetworkErrorKind.TIMEOUT, error.kind)
    assertTrue("expected timeout well under the 2s delay, took ${elapsedMs}ms", elapsedMs < 1000)
  }

  @Test
  fun `no connection surfaces as NetworkError distinct from an HTTP error`() {
    val request = requestFor("GET")
    server.shutdown()
    serverShutdown = true

    val result = execute(request)

    assertTrue(result is HttpResult.NetworkError)
  }

  @Test
  fun `a 500 response is a Success, not a NetworkError`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("boom"))

    val result = execute(requestFor("GET"))

    val success = result as HttpResult.Success
    assertEquals(500, success.status)
  }

  @Test
  fun `custom and auth headers coexist without clobbering each other`() {
    server.enqueue(MockResponse().setResponseCode(200))

    execute(requestFor("GET", headers = listOf("X-Custom" to "a", "Authorization" to "Bearer xyz")))

    val recorded = server.takeRequest()
    assertEquals("a", recorded.getHeader("X-Custom"))
    assertEquals("Bearer xyz", recorded.getHeader("Authorization"))
  }

  @Test
  fun `adapter sends the url verbatim without further mangling`() {
    server.enqueue(MockResponse().setResponseCode(200))

    execute(requestFor("GET", "/already/resolved/path"))

    assertEquals("/already/resolved/path", server.takeRequest().path)
  }
}
