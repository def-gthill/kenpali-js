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

export function given({ params, kwParams }, result) {
  return {
    given: {
      params: params ?? [],
      kwParams: kwParams ?? [],
    },
    result,
  };
}

export function calling(f, args = [], namedArgs = kpobject()) {
  const result = { calling: f };
  if (args.length > 0) {
    result.args = args;
  }
  if (namedArgs.size > 0) {
    result.namedArgs = namedArgs;
  }
  return result;
}

export function optional(expression) {
  return { optional: expression };
}

export function quote(expression) {
  return { quote: expression };
}

export function unquote(expression) {
  return { unquote: expression };
}
