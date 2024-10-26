import kpobject from "./kpobject.js";

export function literal(value) {
  return { literal: value };
}

export function array(...elements) {
  return { array: elements };
}

export function object(...entries) {
  return { object: entries };
}

export function name(name) {
  return { name };
}

export function defining(...args) {
  const names = args.slice(0, -1);
  const result = args.at(-1);
  return { defining: kpobject(...names), result };
}

export function given(params, result) {
  return { given: params, result };
}

export function calling(f, args = [], namedArgs = kpobject()) {
  const result = { calling: f };
  if (!Array.isArray(args) || args.length > 0) {
    result.args = args;
  }
  if (!(namedArgs instanceof Map) || namedArgs.size > 0) {
    result.namedArgs = namedArgs;
  }
  return result;
}

// REMOVE ME
export function optional(expression) {
  return { optional: expression };
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
