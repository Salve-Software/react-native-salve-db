#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace margelo::nitro::salvedb {

// Item path (`itemPathTemplate`) and list-query (`listQueryTemplate`) templates
// use different closed vocabularies — using a token outside its context (e.g.
// `{id}` inside a list query) is a parse-time error, not a runtime one.
enum class UrlTemplateContext { Item, ListQuery };

// A deliberately minimal `{token}` template engine for sync endpoint URLs and
// query strings (#115) — NOT RFC 6570. See docs/sync-rest-contract.md.
//
// Literal text is emitted as-is except for a literal space, which is rendered
// as `%20`; any other raw character outside the unreserved set that isn't a
// digit/letter/`-_.~` and isn't already percent-safe URL syntax (`/ ? & = $
// ( ) : , ;` etc.) is fine to keep raw — only a small explicit blocklist
// (`"`, `<`, `>`, backtick, control characters) is rejected at parse time,
// since those are never valid in a URL and are almost certainly copy-paste
// mistakes. Use `{{`/`}}` for a literal brace.
//
// Substituted variable values are always percent-encoded via
// `HttpUrlBuilder::encodeSegment` — the schema author can never opt out of
// this — with one structural exception: `{basePath}` is inserted raw. It
// carries the entity's route prefix (e.g. `/Products`), which legitimately
// contains `/`; encoding it would break the very path it's building, and it
// is schema-author-controlled configuration, not runtime/user data (the same
// trust level as the literal template text around it). `{id}`, `{since}`,
// `{limit}`, and `{cursorField}` are always encoded.
class UrlTemplate {
public:
  UrlTemplate() = default;

  // Parses `raw` against the vocabulary allowed for `context`. `fieldName`
  // (e.g. "sync.endpoint.listQueryTemplate") is used verbatim in thrown
  // error messages so failures name the offending schema field. Throws
  // `std::runtime_error` on: a `{token}` outside the closed vocabulary, an
  // unbalanced `{`/`}`, or a raw illegal character in literal text.
  static UrlTemplate parse(const std::string& raw, UrlTemplateContext context, const std::string& fieldName);

  // Substitutes each `{token}` with `vars.at(token)`. Missing keys are a
  // caller bug (the caller always supplies exactly the context's
  // vocabulary) and throw `std::out_of_range`. Throws `std::runtime_error`
  // if called on a default-constructed instance that was never parsed —
  // rendering silent empty output on unset config is worse than failing loud.
  std::string render(const std::unordered_map<std::string, std::string>& vars) const;

  // True if the parsed template contains a `{token}` variable reference
  // (not literal text) naming `token`. Used to enforce that a template
  // references the tokens its consumer structurally depends on — e.g. a
  // `listQueryTemplate` missing `{limit}` would silently defeat the pull
  // loop's tied-timestamp escalation (SyncPullPhase).
  bool references(const std::string& token) const;

private:
  // A parsed template is a flat, ordered sequence of literal spans and
  // variable references — rendering is a single linear pass, no backtracking.
  struct Segment {
    bool isVariable;
    std::string text; // literal text, or the variable name when isVariable
  };

  std::vector<Segment> segments_;
  // Distinguishes "parsed an empty/literal-only template" from "never
  // parsed" — segments_.empty() alone can't tell those apart.
  bool _parsed = false;
};

} // namespace margelo::nitro::salvedb
