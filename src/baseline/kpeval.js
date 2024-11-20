import { loadBuiltins } from "./builtins.js";
import { core as coreCode } from "./core.js";
import { Interpreter, Scope, defineNames, evalClean } from "./evalClean.js";
import kperror, { catch_ } from "./kperror.js";
import kpobject, { kpoMap, toKpobject } from "./kpobject.js";
import kpparse from "./kpparse.js";
import { isError } from "./values.js";

export function kpevalJson(
  json,
  { names = kpobject(), modules = kpobject() } = {}
) {
  const expressionRaw = JSON.parse(json);
  const expression = toAst(expressionRaw);
  return kpeval(expression, { names, modules });
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

export default function kpeval(
  expression,
  { names = kpobject(), modules = kpobject(), timeLimitSeconds = 0 } = {}
) {
  validateExpression(expression);
  const builtins = loadBuiltins(modules);
  const interpreter = new Interpreter({ timeLimitSeconds });
  const withCore = loadCore(builtins, interpreter);
  const withCustomNames = new Scope(withCore, names);
  return catch_(() => evalClean(expression, withCustomNames, interpreter));
}

function validateExpression(expression) {
  try {
    transformTree(expression, {
      handleOther(node) {
        if (node === null || typeof node !== "object") {
          throw kperror("notAnExpression", ["value", node]);
        }
      },
    });
  } catch (error) {
    if (isError(error)) {
      return error;
    } else {
      throw error;
    }
  }
}

function transformTree(expression, handlers) {
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
      array: node.array.map(recurse),
    }));
  } else if ("object" in expression) {
    return transformNode("handleObject", (node) => ({
      ...node,
      object: node.object.map((element) => {
        if ("spread" in element) {
          return recurse(element);
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
      defining: Array.isArray(node.defining)
        ? node.defining.map(([name, value]) => [
            typeof name === "string" ? name : recurse(name),
            recurse(value),
          ])
        : kpoMap(node.defining, ([name, value]) => [name, recurse(value)]),
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
  } else if ("catching" in expression) {
    return transformNode("handleCatching", (node) => ({
      ...node,
      catching: recurse(node.catching),
    }));
  } else if ("expression" in expression) {
    // Special node type that shows up when loading core
    return transformNode("handleExpression", (node) => ({
      ...node,
      expression: recurse(node.expression),
    }));
  } else {
    return transformNode("handleOther", (node) => node);
  }
}

let core = null;

function loadCore(enclosingScope, interpreter) {
  if (!core) {
    const code = coreCode;
    const ast = kpparse(code + "null");
    core = ast.defining;
  }
  return defineNames(core, enclosingScope, interpreter);
}
