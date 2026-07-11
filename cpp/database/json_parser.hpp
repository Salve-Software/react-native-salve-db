#pragma once

#include <string>
#include <map>
#include <vector>
#include <variant>
#include <stdexcept>
#include <optional>
#include <cctype>
#include <cmath>
#include <functional>
#include <sstream>

namespace margelo::nitro::salvedb::json {

struct Value;
using Object = std::map<std::string, Value>;
using Array  = std::vector<Value>;

struct Value {
  std::variant<std::nullptr_t, bool, double, std::string, Array, Object> data;

  Value() : data(nullptr) {}
  Value(std::nullptr_t) : data(nullptr) {}
  Value(bool b) : data(b) {}
  Value(double d) : data(d) {}
  Value(std::string s) : data(std::move(s)) {}
  Value(Array a) : data(std::move(a)) {}
  Value(Object o) : data(std::move(o)) {}

  bool isNull()   const { return std::holds_alternative<std::nullptr_t>(data); }
  bool isBool()   const { return std::holds_alternative<bool>(data); }
  bool isNumber() const { return std::holds_alternative<double>(data); }
  bool isString() const { return std::holds_alternative<std::string>(data); }
  bool isArray()  const { return std::holds_alternative<Array>(data); }
  bool isObject() const { return std::holds_alternative<Object>(data); }

  bool               asBool()   const { return std::get<bool>(data); }
  double             asNumber() const { return std::get<double>(data); }
  const std::string& asString() const { return std::get<std::string>(data); }
  const Array&       asArray()  const { return std::get<Array>(data); }
  const Object&      asObject() const { return std::get<Object>(data); }

  bool has(const std::string& key) const {
    if (!isObject()) return false;
    return asObject().count(key) > 0;
  }

  const Value& operator[](const std::string& key) const {
    return asObject().at(key);
  }

  std::optional<std::reference_wrapper<const Value>> get(const std::string& key) const {
    if (!isObject()) return std::nullopt;
    auto it = asObject().find(key);
    if (it == asObject().end()) return std::nullopt;
    return std::cref(it->second);
  }

  std::string getString(const std::string& key, const std::string& fallback = "") const {
    auto v = get(key);
    if (!v || !v->get().isString()) return fallback;
    return v->get().asString();
  }

  bool getBool(const std::string& key, bool fallback = false) const {
    auto v = get(key);
    if (!v || !v->get().isBool()) return fallback;
    return v->get().asBool();
  }

  double getNumber(const std::string& key, double fallback = 0.0) const {
    auto v = get(key);
    if (!v || !v->get().isNumber()) return fallback;
    return v->get().asNumber();
  }
};

class Parser {
  const std::string& _src;
  size_t _pos = 0;

  void skipWS() {
    while (_pos < _src.size() && std::isspace((unsigned char)_src[_pos])) ++_pos;
  }

  char peek() const { return _pos < _src.size() ? _src[_pos] : '\0'; }
  char consume() { return _src[_pos++]; }

  void expect(char c) {
    if (peek() != c)
      throw std::runtime_error(std::string("JSON parse error: expected '") + c + "' at pos " + std::to_string(_pos));
    ++_pos;
  }

  std::string parseString() {
    expect('"');
    std::string result;
    while (_pos < _src.size() && peek() != '"') {
      char c = consume();
      if (c == '\\') {
        char esc = consume();
        switch (esc) {
          case '"':  result += '"';  break;
          case '\\': result += '\\'; break;
          case '/':  result += '/';  break;
          case 'n':  result += '\n'; break;
          case 'r':  result += '\r'; break;
          case 't':  result += '\t'; break;
          case 'b':  result += '\b'; break;
          case 'f':  result += '\f'; break;
          default:   result += esc;  break;
        }
      } else {
        result += c;
      }
    }
    expect('"');
    return result;
  }

  double parseNumber() {
    size_t start = _pos;
    if (peek() == '-') ++_pos;
    while (_pos < _src.size() && std::isdigit((unsigned char)peek())) ++_pos;
    if (peek() == '.') {
      ++_pos;
      while (_pos < _src.size() && std::isdigit((unsigned char)peek())) ++_pos;
    }
    if (peek() == 'e' || peek() == 'E') {
      ++_pos;
      if (peek() == '+' || peek() == '-') ++_pos;
      while (_pos < _src.size() && std::isdigit((unsigned char)peek())) ++_pos;
    }
    return std::stod(_src.substr(start, _pos - start));
  }

  Value parseValue() {
    skipWS();
    char c = peek();
    if (c == '"') return Value(parseString());
    if (c == '{') return Value(parseObject());
    if (c == '[') return Value(parseArray());
    if (c == 't') { _pos += 4; return Value(true); }
    if (c == 'f') { _pos += 5; return Value(false); }
    if (c == 'n') { _pos += 4; return Value(nullptr); }
    if (c == '-' || std::isdigit((unsigned char)c)) return Value(parseNumber());
    throw std::runtime_error(std::string("JSON parse error: unexpected char '") + c + "' at pos " + std::to_string(_pos));
  }

  Object parseObject() {
    expect('{');
    Object obj;
    skipWS();
    if (peek() == '}') { ++_pos; return obj; }
    while (true) {
      skipWS();
      std::string key = parseString();
      skipWS();
      expect(':');
      skipWS();
      obj[std::move(key)] = parseValue();
      skipWS();
      if (peek() == '}') { ++_pos; break; }
      expect(',');
    }
    return obj;
  }

  Array parseArray() {
    expect('[');
    Array arr;
    skipWS();
    if (peek() == ']') { ++_pos; return arr; }
    while (true) {
      skipWS();
      arr.push_back(parseValue());
      skipWS();
      if (peek() == ']') { ++_pos; break; }
      expect(',');
    }
    return arr;
  }

public:
  explicit Parser(const std::string& src) : _src(src) {}

  Value parse() {
    Value v = parseValue();
    skipWS();
    return v;
  }
};

inline Value parse(const std::string& json) {
  return Parser(json).parse();
}

namespace detail {

inline void stringifyString(const std::string& s, std::ostringstream& out) {
  out << '"';
  for (char c : s) {
    switch (c) {
      case '"':  out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\n': out << "\\n";  break;
      case '\r': out << "\\r";  break;
      case '\t': out << "\\t";  break;
      case '\b': out << "\\b";  break;
      case '\f': out << "\\f";  break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[7];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out << buf;
        } else {
          out << c;
        }
    }
  }
  out << '"';
}

inline void stringifyNumber(double d, std::ostringstream& out) {
  if (std::isfinite(d) && d == std::floor(d) &&
      std::abs(d) < 1e15) {
    out << static_cast<long long>(d);
  } else {
    out << d;
  }
}

inline void stringifyValue(const Value& v, std::ostringstream& out) {
  if (v.isNull()) {
    out << "null";
  } else if (v.isBool()) {
    out << (v.asBool() ? "true" : "false");
  } else if (v.isNumber()) {
    stringifyNumber(v.asNumber(), out);
  } else if (v.isString()) {
    stringifyString(v.asString(), out);
  } else if (v.isArray()) {
    out << '[';
    const Array& arr = v.asArray();
    for (size_t i = 0; i < arr.size(); ++i) {
      if (i > 0) out << ',';
      stringifyValue(arr[i], out);
    }
    out << ']';
  } else if (v.isObject()) {
    out << '{';
    const Object& obj = v.asObject();
    bool first = true;
    for (const auto& [key, value] : obj) {
      if (!first) out << ',';
      first = false;
      stringifyString(key, out);
      out << ':';
      stringifyValue(value, out);
    }
    out << '}';
  }
}

} // namespace detail

// Object key order follows std::map's lexicographic order, not insertion order.
inline std::string stringify(const Value& v) {
  std::ostringstream out;
  detail::stringifyValue(v, out);
  return out.str();
}

} // namespace margelo::nitro::salvedb::json
