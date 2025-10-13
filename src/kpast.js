export function literal(value) {
  return { type: "literal", value };
}

export function array(...elements) {
  return { type: "array", elements };
}

export function arrayPattern(...names) {
  return { type: "arrayPattern", names };
}

export function object(...entries) {
  return { type: "object", entries };
}

export function objectPattern(...entries) {
  return { type: "objectPattern", entries };
}

export function optional(name, defaultValue) {
  return { type: "optional", name, defaultValue };
}

export function spread(value) {
  return { type: "spread", value };
}

export function rest(name) {
  return { type: "rest", name };
}

export function name(name, moduleName) {
  const result = { type: "name", name };
  if (moduleName) {
    result.from = moduleName;
  }
  return result;
}

export function block(...args) {
  const defs = args.slice(0, -1);
  const result = args.at(-1);
  return { type: "block", defs, result };
}

export function function_(body, params = [], namedParams = []) {
  const result = { type: "function", body };
  if (params.length > 0) {
    result.params = params;
  }
  if (namedParams.length > 0) {
    result.namedParams = namedParams;
  }
  return result;
}

export function call(f, args = [], namedArgs = []) {
  const result = { type: "call", callee: f };
  if (args.length > 0) {
    result.args = args;
  }
  if (namedArgs.length > 0) {
    result.namedArgs = namedArgs;
  }
  return result;
}

export function index(collection, index) {
  return { type: "index", collection, index };
}

export function catch_(expression) {
  return { type: "catch", expression };
}

//#region Syntactic sugar

export function group(expression) {
  return { type: "group", expression };
}

export function pipeline(start, ...calls) {
  return { type: "pipeline", start, calls };
}

export function arraySpread(expression) {
  return { type: "arraySpread", expression };
}

export function objectSpread(expression) {
  return { type: "objectSpread", expression };
}

export function arrayRest(name) {
  return { type: "arrayRest", name };
}

export function objectRest(name) {
  return { type: "objectRest", name };
}

//#endregion

export function transformTree(expression, handlers) {
  function recurse(node) {
    return transformTree(node, handlers);
  }

  function transformNode(handlerName, defaultHandler) {
    if (handlerName in handlers) {
      return handlers[handlerName](expression, recurse, defaultHandler);
    } else {
      return defaultHandler(expression);
    }
  }

  if (
    expression === null ||
    typeof expression !== "object" ||
    !("type" in expression)
  ) {
    return transformNode("handleOther", (node) => node);
  } else {
    switch (expression.type) {
      case "literal":
        return transformNode("handleLiteral", (node) => node);
      case "array":
        return transformNode("handleArray", (node) => ({
          ...node,
          elements: node.elements.map((element) => {
            if (element.type === "spread") {
              return spread(recurse(element.value));
            } else {
              return recurse(element);
            }
          }),
        }));
      case "object":
        return transformNode("handleObject", (node) => ({
          ...node,
          entries: node.entries.map((element) => {
            if (element.type === "spread") {
              return spread(recurse(element.value));
            } else {
              const [key, value] = element;
              return [
                typeof key === "string" ? key : recurse(key),
                recurse(value),
              ];
            }
          }),
        }));
      case "name":
        return transformNode("handleName", (node) => node);
      case "block":
        return transformNode("handleBlock", (node) => ({
          ...node,
          defs: node.defs.map(([name, value]) => [
            typeof name === "string" ? name : recurse(name),
            recurse(value),
          ]),
          result: recurse(node.result),
        }));
      case "function":
        return transformNode("handleFunction", (node) => ({
          ...node,
          body: recurse(node.body),
        }));
      case "call":
        return transformNode("handleCall", (node) => ({
          ...node,
          callee: recurse(node.callee),
          args: (node.args ?? []).map((element) => {
            if (element.type === "spread") {
              return spread(recurse(element.value));
            } else {
              return recurse(element);
            }
          }),
          namedArgs: (node.namedArgs ?? []).map((element) => {
            if (element.type === "spread") {
              return spread(recurse(element.value));
            } else {
              const [name, value] = element;
              return [name, recurse(value)];
            }
          }),
        }));
      case "index":
        return transformNode("handleIndex", (node) => ({
          ...node,
          collection: recurse(node.collection),
          index: recurse(node.index),
        }));
      case "catch":
        return transformNode("handleCatch", (node) => ({
          ...node,
          expression: recurse(node.expression),
        }));
      default:
        return transformNode("handleOther", (node) => node);
    }
  }
}
