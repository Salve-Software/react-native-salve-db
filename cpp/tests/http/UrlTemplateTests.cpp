#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "../../http/UrlTemplate.hpp"

using namespace margelo::nitro::salvedb;
using Catch::Matchers::Equals;

TEST_CASE("renders literal text unchanged", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("{basePath}/fixed/suffix", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE(tpl.render({{"basePath", "/customers"}, {"id", "1"}}) == "/customers/fixed/suffix");
}

TEST_CASE("substitutes a single token", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("{basePath}({id})", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE(tpl.render({{"basePath", "/Products"}, {"id", "42"}}) == "/Products(42)");
}

TEST_CASE("substitutes multiple tokens in a query template", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse(
    "$filter={cursorField} gt {since}&$top={limit}", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"
  );
  REQUIRE(
    tpl.render({{"since", "1700000000000"}, {"limit", "200"}, {"cursorField", "updatedAt"}}) ==
    "$filter=updatedAt%20gt%201700000000000&$top=200"
  );
}

TEST_CASE("{{ and }} render as literal braces", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("{{{id}}}", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE(tpl.render({{"basePath", "/customers"}, {"id", "42"}}) == "{42}");
}

TEST_CASE("basePath is inserted raw, never percent-encoded", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("{basePath}/{id}", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE(tpl.render({{"basePath", "/customers"}, {"id", "1"}}) == "/customers/1");
}

TEST_CASE("id value is percent-encoded when it needs it", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("{basePath}({id})", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE(tpl.render({{"basePath", "/customers"}, {"id", "a/b"}}) == "/customers(a%2Fb)");
}

TEST_CASE("a literal space renders as %20", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse(
    "updatedAt gt {since}", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"
  );
  REQUIRE(tpl.render({{"since", "1700"}, {"limit", "50"}, {"cursorField", "updatedAt"}}) == "updatedAt%20gt%201700");
}

TEST_CASE("rejects a token outside the closed vocabulary", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("{bogus}", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate"),
    Equals("UrlTemplate: sync.endpoint.itemPathTemplate references unknown token '{bogus}' (valid: basePath, id)")
  );
}

TEST_CASE("rejects a token that is valid in the other context (out of context)", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("?since={id}", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"),
    Equals(
      "UrlTemplate: sync.endpoint.listQueryTemplate references unknown token '{id}' (valid: since, limit, cursorField)"
    )
  );
}

TEST_CASE("rejects an unterminated '{'", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("{basePath", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate"),
    Equals("UrlTemplate: sync.endpoint.itemPathTemplate has an unterminated '{' (use '{{' for a literal brace)")
  );
}

TEST_CASE("rejects an unmatched '}'", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("{basePath}}", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate"),
    Equals("UrlTemplate: sync.endpoint.itemPathTemplate has an unmatched '}' (use '}}' for a literal brace)")
  );
}

TEST_CASE("rejects a raw illegal character in literal text, naming it", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("{basePath}/<bad>", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate"),
    Equals(
      "UrlTemplate: sync.endpoint.itemPathTemplate contains an illegal raw character '<' in its literal text — percent-encode it manually"
    )
  );
}

TEST_CASE("rejects a raw double quote in literal text", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("$filter=\"{since}\"", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"),
    Equals(
      "UrlTemplate: sync.endpoint.listQueryTemplate contains an illegal raw character '\"' in its literal text — percent-encode it manually"
    )
  );
}

TEST_CASE("{{id}} renders the literal text '{id}' — it is not substituted", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("{{id}}", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE(tpl.render({{"basePath", "/customers"}, {"id", "42"}}) == "{id}");
}

TEST_CASE("references() reports which vocabulary tokens a template actually uses", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("{basePath}({id})", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE(tpl.references("id"));
  REQUIRE(tpl.references("basePath"));

  auto noId = UrlTemplate::parse("{basePath}/fixed", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE_FALSE(noId.references("id"));

  // An escaped `{{id}}` is literal text, not a reference.
  auto escaped = UrlTemplate::parse("{{id}}", UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  REQUIRE_FALSE(escaped.references("id"));
}

TEST_CASE("rejects a raw '#' in literal text — it would truncate the URL into a fragment", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("updatedAfter={since}#frag", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"),
    Equals(
      "UrlTemplate: sync.endpoint.listQueryTemplate contains an illegal raw character '#' in its literal text — percent-encode it manually"
    )
  );
}

TEST_CASE("rejects a raw non-ASCII byte in literal text — a URL is ASCII-only", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("nome=jos\xc3\xa9&limit={limit}", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"),
    Equals(
      "UrlTemplate: sync.endpoint.listQueryTemplate contains an illegal raw character '\xc3' in its literal text — percent-encode it manually"
    )
  );
}

TEST_CASE("accepts a well-formed %HH percent escape in literal text", "[http][UrlTemplate]") {
  auto tpl = UrlTemplate::parse("status=%2Bactive&since={since}", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate");
  REQUIRE(tpl.render({{"since", "1700"}, {"limit", "50"}, {"cursorField", "updatedAt"}}) == "status=%2Bactive&since=1700");
}

TEST_CASE("rejects a trailing '%' with no escape digits", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("since={since}%", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"),
    Equals("UrlTemplate: sync.endpoint.listQueryTemplate contains an incomplete or invalid percent-escape '%' in its literal text")
  );
}

TEST_CASE("rejects a percent escape with non-hex digits", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("status=%GG&since={since}", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"),
    Equals("UrlTemplate: sync.endpoint.listQueryTemplate contains an incomplete or invalid percent-escape '%' in its literal text")
  );
}

TEST_CASE("rejects a percent escape with only one hex digit", "[http][UrlTemplate]") {
  REQUIRE_THROWS_WITH(
    UrlTemplate::parse("status=%0G&since={since}", UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate"),
    Equals("UrlTemplate: sync.endpoint.listQueryTemplate contains an incomplete or invalid percent-escape '%' in its literal text")
  );
}
