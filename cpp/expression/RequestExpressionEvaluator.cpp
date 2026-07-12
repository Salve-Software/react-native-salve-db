#include "RequestExpressionEvaluator.hpp"
#include <stdexcept>
#include <unordered_set>

namespace margelo::nitro::salvedb {

namespace {

const std::unordered_set<std::string> kSupportedRefs = {"cursor", "operations", "pageSize"};
const std::unordered_set<std::string> kUnimplementedRefs = {
  "changes", "deviceId", "platform", "timestamp", "userId"
};

json::Value evaluateRef(const json::Value& node, const RequestExpressionEvaluator::VariableResolver& resolver) {
  const json::Value& refValue = node["$ref"];
  if (!refValue.isString()) {
    throw std::runtime_error("ExpressionInterpreter: $ref must be a string");
  }
  const std::string& refName = refValue.asString();

  if (kUnimplementedRefs.count(refName) > 0) {
    throw std::runtime_error("ExpressionInterpreter: $ref \"" + refName + "\" is not implemented in the MVP");
  }
  if (kSupportedRefs.count(refName) == 0) {
    throw std::runtime_error("ExpressionInterpreter: unknown $ref \"" + refName + "\"");
  }
  return resolver(refName);
}

json::Value evaluateObject(const json::Value& node, const RequestExpressionEvaluator::VariableResolver& resolver) {
  const json::Value& inner = node["object"];
  if (!inner.isObject()) {
    throw std::runtime_error("ExpressionInterpreter: ObjectExpression's \"object\" must be an object");
  }
  json::Object result;
  for (const auto& [key, value] : inner.asObject()) {
    result[key] = RequestExpressionEvaluator::evaluate(value, resolver);
  }
  return json::Value(std::move(result));
}

json::Value evaluateArray(const json::Value& node, const RequestExpressionEvaluator::VariableResolver& resolver) {
  const json::Value& inner = node["items"];
  if (!inner.isArray()) {
    throw std::runtime_error("ExpressionInterpreter: ArrayExpression's \"items\" must be an array");
  }
  json::Array result;
  result.reserve(inner.asArray().size());
  for (const auto& item : inner.asArray()) {
    result.push_back(RequestExpressionEvaluator::evaluate(item, resolver));
  }
  return json::Value(std::move(result));
}

} // namespace

json::Value RequestExpressionEvaluator::evaluate(const json::Value& expression, const VariableResolver& resolver) {
  if (!expression.isObject()) {
    throw std::runtime_error("ExpressionInterpreter: expression node must be an object");
  }

  const bool hasRef    = expression.has("$ref");
  const bool hasValue  = expression.has("value");
  const bool hasObject = expression.has("object");
  const bool hasItems  = expression.has("items");
  const int matches = hasRef + hasValue + hasObject + hasItems;

  if (matches != 1) {
    throw std::runtime_error(
      "ExpressionInterpreter: expression node must have exactly one of "
      "\"$ref\", \"value\", \"object\", \"items\" (found " + std::to_string(matches) + ")"
    );
  }

  if (hasRef)    return evaluateRef(expression, resolver);
  if (hasValue)  return expression["value"];
  if (hasObject) return evaluateObject(expression, resolver);
  return evaluateArray(expression, resolver);
}

} // namespace margelo::nitro::salvedb
