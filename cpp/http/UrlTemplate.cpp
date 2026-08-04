#include "UrlTemplate.hpp"
#include "HttpUrlBuilder.hpp"
#include <cctype>
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

const std::vector<std::string>& vocabularyFor(UrlTemplateContext context) {
  static const std::vector<std::string> kItemVocabulary{"basePath", "id"};
  static const std::vector<std::string> kListQueryVocabulary{"since", "limit", "cursorField"};
  return context == UrlTemplateContext::Item ? kItemVocabulary : kListQueryVocabulary;
}

bool isKnownToken(UrlTemplateContext context, const std::string& token) {
  const auto& vocabulary = vocabularyFor(context);
  for (const auto& known : vocabulary) {
    if (known == token) return true;
  }
  return false;
}

std::string joinVocabulary(UrlTemplateContext context) {
  const auto& vocabulary = vocabularyFor(context);
  std::string joined;
  for (size_t i = 0; i < vocabulary.size(); ++i) {
    if (i) joined += ", ";
    joined += vocabulary[i];
  }
  return joined;
}

bool isIllegalRawChar(char c) {
  // Beyond the explicit blocklist: `#` truncates a URL into a fragment
  // (silently dropping everything after it — e.g. a cursor filter), and any
  // byte outside printable ASCII can't appear raw in a URL at all (a URL is
  // ASCII-only; UTF-8 literal text here would reach the platform HTTP layer
  // as an unparseable URL, surfacing as an opaque network failure instead of
  // this clear parse-time error). `std::iscntrl` alone doesn't catch bytes
  // >= 0x80 in the "C" locale, so check the printable-ASCII range directly.
  unsigned char u = static_cast<unsigned char>(c);
  return c == '"' || c == '<' || c == '>' || c == '`' || c == '#' || u < 0x20 || u >= 0x7F;
}

} // namespace

UrlTemplate UrlTemplate::parse(const std::string& raw, UrlTemplateContext context, const std::string& fieldName) {
  UrlTemplate result;
  std::string literal;

  auto flushLiteral = [&]() {
    if (!literal.empty()) {
      result.segments_.push_back({false, literal});
      literal.clear();
    }
  };

  size_t i = 0;
  while (i < raw.size()) {
    char c = raw[i];

    if (c == '{') {
      // `{{` — escaped literal brace.
      if (i + 1 < raw.size() && raw[i + 1] == '{') {
        literal += '{';
        i += 2;
        continue;
      }
      size_t close = raw.find('}', i + 1);
      if (close == std::string::npos) {
        throw std::runtime_error(
          "UrlTemplate: " + fieldName + " has an unterminated '{' (use '{{' for a literal brace)"
        );
      }
      std::string token = raw.substr(i + 1, close - i - 1);
      if (!isKnownToken(context, token)) {
        throw std::runtime_error(
          "UrlTemplate: " + fieldName + " references unknown token '{" + token + "}' (valid: " +
          joinVocabulary(context) + ")"
        );
      }
      flushLiteral();
      result.segments_.push_back({true, token});
      i = close + 1;
      continue;
    }

    if (c == '}') {
      // `}}` — escaped literal brace.
      if (i + 1 < raw.size() && raw[i + 1] == '}') {
        literal += '}';
        i += 2;
        continue;
      }
      throw std::runtime_error(
        "UrlTemplate: " + fieldName + " has an unmatched '}' (use '}}' for a literal brace)"
      );
    }

    if (isIllegalRawChar(c)) {
      throw std::runtime_error(
        "UrlTemplate: " + fieldName + " contains an illegal raw character '" + std::string(1, c) +
        "' in its literal text — percent-encode it manually"
      );
    }

    literal += c;
    ++i;
  }

  flushLiteral();
  return result;
}

std::string UrlTemplate::render(const std::unordered_map<std::string, std::string>& vars) const {
  std::string out;
  for (const auto& segment : segments_) {
    if (!segment.isVariable) {
      for (char c : segment.text) {
        if (c == ' ') {
          out += "%20";
        } else {
          out += c;
        }
      }
      continue;
    }

    const std::string& value = vars.at(segment.text);
    out += (segment.text == "basePath") ? value : HttpUrlBuilder::encodeSegment(value);
  }
  return out;
}

bool UrlTemplate::references(const std::string& token) const {
  for (const auto& segment : segments_) {
    if (segment.isVariable && segment.text == token) return true;
  }
  return false;
}

} // namespace margelo::nitro::salvedb
