export function literal(value) {
  return { literal: value };
}

export function array(...elements) {
  return { array: elements };
}

export function arrayPattern(...elements) {
  return { arrayPattern: elements };
}

export function object(...entries) {
  return { object: entries };
}

export function objectPattern(...elements) {
  return { objectPattern: elements };
}

export function spread(node) {
  return { spread: node };
}

export function name(name) {
  return { name };
}

export function module(...args) {
  return { module: args };
}

export function defining(...args) {
  const names = args.slice(0, -1);
  const result = args.at(-1);
  return { defining: names, result };
}

export function given(params, result) {
  return { given: params, result };
}

export function rest(param) {
  return { rest: param };
}

export function withDefault(name, defaultValue) {
  return { name, defaultValue };
}

export function calling(f, args = [], namedArgs = []) {
  const result = { calling: f };
  if (args.length > 0) {
    result.args = args;
  }
  if (namedArgs.length > 0) {
    result.namedArgs = namedArgs;
  }
  return result;
}

export function catching(expression) {
  return { catching: expression };
}

export function quote(expression) {
  return { quote: expression };
}

export function unquote(expression) {
  return { unquote: expression };
}

// Syntactic sugar

export function group(expression) {
  return { group: expression };
}

export function access(object, key) {
  return { on: object, access: key };
}

export function pipeline(start, ...expressions) {
  return { start, calls: expressions };
}

export function arraySpread(expression) {
  return { arraySpread: expression };
}

export function objectSpread(expression) {
  return { objectSpread: expression };
}

// Instructions

export function findAll(value) {
  return { findAll: value };
}

export function if_(condition, ifTrue, ifFalse) {
  return { if: condition, then: ifTrue, else: ifFalse };
}

export function and(a, b) {
  return { and: [a, b] };
}

export function or(a, b) {
  return { or: [a, b] };
}

export function ifThrown(possibleError, valueIfError) {
  return { ifThrown: possibleError, then: valueIfError };
}

export function passThrown(possibleError, valueIfNotError) {
  return { passThrown: possibleError, otherwise: valueIfNotError };
}

export function firstError(possibleErrors) {
  return { firstError: possibleErrors };
}

export function at(collection, index) {
  return { at: index, in: collection };
}

export function bind(value, schema) {
  if (value === 10) {
    throw new Error("Not acceptable!");
  }
  return { bind: value, to: schema };
}

export function bindValid(value, schema) {
  return { bindValid: value, to: schema };
}

export function bindArrayElement(array, index, schema) {
  return { bindElementOf: array, index, to: schema };
}

export function bindArrayRest(array, schema) {
  return { bindArrayRest: array, to: schema };
}

export function bindObjectEntry(object, key, schema) {
  return { bindEntryOf: object, key, to: schema };
}

export function bindObjectRest(object, schema) {
  return { bindObjectRest: object, to: schema };
}

export function assert(value, condition) {
  return { assert: value, satisfies: condition };
}

export function checkType(value, type) {
  return { check: value, type };
}

export function callingEagerBuiltin(f, args = [], namedArgs = []) {
  const result = { callingEagerBuiltin: f };
  if (args.length > 0) {
    result.args = args;
  }
  if (namedArgs.length > 0) {
    result.namedArgs = namedArgs;
  }
  return result;
}

export function toArgumentError(value) {
  return { toArgumentError: value };
}
