import { loadBuiltins } from "./builtins.js";
import { core as coreCode } from "./core.js";
import { Interpreter, Scope, defineNames, evalClean } from "./evalClean.js";
import { transformTree } from "./kpast.js";
import kperror, { catch_ } from "./kperror.js";
import kpobject, { toKpobject } from "./kpobject.js";
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

let core = null;

function loadCore(enclosingScope, interpreter) {
  if (!core) {
    const code = coreCode;
    const ast = kpparse(code + "null");
    core = ast.defining;
  }
  return defineNames(core, enclosingScope, interpreter);
}
