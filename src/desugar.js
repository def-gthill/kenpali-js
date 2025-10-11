import {
  array,
  block,
  call,
  catch_,
  function_,
  index,
  literal,
  object,
} from "./kpast.js";
import { kpoEntries } from "./kpobject.js";

export default function desugar(expression) {
  if ("type" in expression) {
    switch (expression.type) {
      case "array":
        return desugarArray(expression);
      case "object":
        return desugarObject(expression);
      case "block":
        return desugarBlock(expression);
      case "function":
        return desugarFunction(expression);
      case "index":
        return desugarIndexing(expression);
      case "group":
        return desugarGroup(expression);
      case "pipeline":
        return desugarPipeline(expression);
      default:
        return expression;
    }
  } else {
    return expression;
  }
}

function desugarArray(expression) {
  return array(
    ...expression.elements.map((element) => {
      if (element.type === "arraySpread") {
        return { spread: desugar(element.expression) };
      } else {
        return desugar(element);
      }
    })
  );
}

function desugarObject(expression) {
  return object(
    ...expression.entries.map((element) => {
      if (element.type === "objectSpread") {
        return { spread: desugar(element.expression) };
      } else if ("name" in element) {
        return [literal(element.name), element];
      } else {
        const [key, value] = element;
        return [desugarProperty(key), desugar(value)];
      }
    })
  );
}

function desugarBlock(expression) {
  return block(
    ...kpoEntries(expression.defs).map(([name, value]) => [
      name ? desugarNamePattern(name) : name,
      desugar(value),
    ]),
    desugar(expression.result)
  );
}

function desugarNamePattern(pattern) {
  if (typeof pattern === "string") {
    return pattern;
  } else if ("arrayPattern" in pattern) {
    return { arrayPattern: desugarArrayPattern(pattern.arrayPattern) };
  } else if ("objectPattern" in pattern) {
    return { objectPattern: desugarObjectPattern(pattern.objectPattern) };
  } else if ("name" in pattern) {
    return { ...pattern, name: desugarNamePattern(pattern.name) };
  }
}

function desugarArrayPattern(pattern) {
  return pattern.map(desugarNamePatternElement);
}

function desugarObjectPattern(pattern) {
  return pattern.map(desugarNamePatternElement);
}

function desugarNamePatternElement(element) {
  if (typeof element === "object" && "rest" in element) {
    return { rest: desugarNamePattern(element.rest) };
  } else if (typeof element === "object" && "namedRest" in element) {
    return { rest: desugarNamePattern(element.namedRest) };
  } else if (typeof element === "object" && "defaultValue" in element) {
    return {
      name: desugarNamePattern(element.name),
      defaultValue: desugar(element.defaultValue),
    };
  } else {
    return desugarNamePattern(element);
  }
}

function desugarFunction(expression) {
  return function_(
    desugar(expression.body),
    desugarArrayPattern(expression.params ?? []),
    desugarObjectPattern(expression.namedParams ?? [])
  );
}

function desugarIndexing(expression) {
  return index(desugar(expression.collection), desugar(expression.index));
}

function desugarGroup(expression) {
  return desugar(expression.expression);
}

function desugarProperty(expression) {
  if ("name" in expression) {
    return literal(expression.name);
  } else {
    return desugar(expression);
  }
}

function desugarPipeline(expression) {
  let axis = desugar(expression.start);
  for (const [op, ...target] of expression.calls) {
    if (op === "CALL") {
      const [allArgs] = target;
      const { args, namedArgs } = allArgs;
      axis = call(axis, desugarPosArgs(args), desugarNamedArgs(namedArgs));
    } else if (op === "PIPECALL") {
      const [callee, allArgs] = target;
      const { args, namedArgs } = allArgs;
      axis = call(
        desugar(callee),
        [axis, ...desugarPosArgs(args)],
        desugarNamedArgs(namedArgs)
      );
    } else if (op === "PIPEDOT") {
      const [propertyName] = target;
      axis = index(axis, propertyName);
    } else if (op === "PIPE") {
      const [callee] = target;
      axis = call(desugar(callee), [axis]);
    } else if (op === "AT") {
      const [i] = target;
      axis = index(axis, desugar(i));
    } else if (op === "BANG") {
      axis = catch_(axis);
    } else {
      throw new Error(`Invalid pipeline op ${op}`);
    }
  }
  return axis;
}

function desugarPosArgs(posArgs) {
  const desugaredArgs = desugarArray(array(...posArgs));
  return desugaredArgs.elements;
}

function desugarNamedArgs(namedArgs) {
  return namedArgs.map((element) => {
    if (element.type === "objectSpread") {
      return { spread: desugar(element.expression) };
    } else {
      const [name, value] = element;
      return [name, desugar(value)];
    }
  });
}
