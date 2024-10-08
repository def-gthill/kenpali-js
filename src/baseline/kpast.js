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

export function defining(...args) {
  const names = args.slice(0, -1);
  const result = args.at(-1);
  return { defining: names, result };
}

export function given(params, result) {
  return { given: params, result };
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
