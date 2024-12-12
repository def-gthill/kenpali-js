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

export function name(name, module = null) {
  const result = { name };
  if (module) {
    result.from = module;
  }
  return result;
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

export function indexing(collection, index) {
  return { indexing: collection, at: index };
}

export function catching(expression) {
  return { catching: expression };
}

export function unquote(expression) {
  return { unquote: expression };
}

//#region Syntactic sugar

export function group(expression) {
  return { group: expression };
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

  if (expression === null || typeof expression !== "object") {
    return transformNode("handleOther", (node) => node);
  } else if ("literal" in expression) {
    return transformNode("handleLiteral", (node) => node);
  } else if ("array" in expression) {
    return transformNode("handleArray", (node) => ({
      ...node,
      array: node.array.map((element) => {
        if ("spread" in element) {
          return { spread: recurse(element.spread) };
        } else {
          return recurse(element);
        }
      }),
    }));
  } else if ("object" in expression) {
    return transformNode("handleObject", (node) => ({
      ...node,
      object: node.object.map((element) => {
        if ("spread" in element) {
          return { spread: recurse(element.spread) };
        } else {
          const [key, value] = element;
          return [typeof key === "string" ? key : recurse(key), recurse(value)];
        }
      }),
    }));
  } else if ("name" in expression) {
    return transformNode("handleName", (node) => node);
  } else if ("defining" in expression) {
    return transformNode("handleDefining", (node) => ({
      ...node,
      defining: node.defining.map(([name, value]) => [
        typeof name === "string" ? name : recurse(name),
        recurse(value),
      ]),
      result: recurse(node.result),
    }));
  } else if ("given" in expression) {
    return transformNode("handleGiven", (node) => ({
      ...node,
      result: recurse(node.result),
    }));
  } else if ("calling" in expression) {
    return transformNode("handleCalling", (node) => {
      return {
        ...node,
        calling: recurse(node.calling),
        args: (node.args ?? []).map(recurse),
        namedArgs: (node.namedArgs ?? []).map((element) => {
          if ("spread" in element) {
            return { spread: recurse(element.spread) };
          } else {
            const [name, value] = element;
            return [name, recurse(value)];
          }
        }),
      };
    });
  } else if ("indexing" in expression) {
    return transformNode("handleIndexing", (node) => {
      return {
        ...node,
        indexing: recurse(node.indexing),
        at: recurse(node.at),
      };
    });
  } else if ("catching" in expression) {
    return transformNode("handleCatching", (node) => ({
      ...node,
      catching: recurse(node.catching),
    }));
  } else {
    return transformNode("handleOther", (node) => node);
  }
}

export function toAst(expressionRaw) {
  return transformTree(expressionRaw, {
    handleDefining(node, _recurse, handleDefault) {
      return handleDefault({
        ...node,
        defining: Array.isArray(node.defining)
          ? node.defining
          : toKpobject(node.defining),
      });
    },
    handleCalling(node, _recurse, handleDefault) {
      const result = handleDefault({
        ...node,
        args: node.args,
        namedArgs: node.namedArgs,
      });
      if (result.args.length === 0) {
        delete result.args;
      }
      if (result.namedArgs.length === 0) {
        delete result.namedArgs;
      }
      return result;
    },
  });
}
