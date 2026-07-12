#pragma once

#include "../database/json_parser.hpp"
#include <functional>
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — evaluates a parsed
// RequestExpression tree (json::Value) into a request body json::Value.
class RequestExpressionEvaluator {
public:
  using VariableResolver = std::function<json::Value(const std::string& refName)>;

  static json::Value evaluate(const json::Value& expression, const VariableResolver& resolver);
};

} // namespace margelo::nitro::salvedb
