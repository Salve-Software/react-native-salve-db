package com.salvedb

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SalveDbHttpClientTest {

  @Test
  fun `an unrecognized HTTP method returns a graceful OTHER error instead of throwing`() {
    val result = SalveDbHttpClient.execute("PURGE", "https://example.com", emptyArray(), emptyArray(), null, 5000)
    assertFalse(result.isSuccess)
    assertEquals("OTHER", result.errorKind)
  }
}
