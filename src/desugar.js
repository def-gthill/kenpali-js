import {
  array,
  calling,
  catching,
  defining,
  given,
  indexing,
  literal,
  object,
} from "./kpast.js";
import { kpoEntries } from "./kpobject.js";

export default function desugar(expression) {
  if ("array" in expression) {
    return desugarArray(expression);
  } else if ("object" in expression) {
    return desugarObject(expression);
  } else if ("defining" in expression) {
    return desugarDefining(expression);
  } else if ("given" in expression) {
    return desugarGiven(expression);
  } else if ("indexing" in expression) {
    return desugarIndexing(expression);
  } else if ("group" in expression) {
    return desugarGroup(expression);
  } else if ("calls" in expression) {
    return desugarPipeline(expression);
  } else {
    return expression;
  }
}

function desugarArray(expression) {
  return array(
    ...expression.array.map((element) => {
      if ("arraySpread" in element) {
        return { spread: desugar(element.arraySpread) };
      } else {
        return desugar(element);
      }
    })
  );
}

function desugarObject(expression) {
  return object(
    ...expression.object.map((element) => {
      if ("objectSpread" in element) {
        return { spread: desugar(element.objectSpread) };
      } else if ("name" in element) {
        return [element.name, element];
      } else {
        const [key, value] = element;
        return [desugarPropertyDefinition(key), desugar(value)];
      }
    })
  );
}

function desugarPropertyDefinition(expression) {
  const desugaredKey = desugarProperty(expression);
  if ("literal" in desugaredKey) {
    return desugaredKey.literal;
  } else {
    return desugaredKey;
  }
}

function desugarDefining(expression) {
  return defining(
    ...kpoEntries(expression.defining).map(([name, value]) => [
      name ? desugarDefiningPattern(name) : name,
      desugar(value),
    ]),
    desugar(expression.result)
  );
}

function desugarDefiningPattern(pattern) {
  if (typeof pattern === "string") {
    return pattern;
  } else if ("arrayPattern" in pattern) {
    return { arrayPattern: desugarArrayPattern(pattern.arrayPattern) };
  } else if ("objectPattern" in pattern) {
    return { objectPattern: desugarObjectPattern(pattern.objectPattern) };
  } else if ("name" in pattern) {
    return { ...pattern, name: desugarDefiningPattern(pattern.name) };
  }
}

function desugarArrayPattern(pattern) {
  return pattern.map(desugarDefiningPatternElement);
}

function desugarObjectPattern(pattern) {
  return pattern.map(desugarDefiningPatternElement);
}

function desugarDefiningPatternElement(element) {
  if (typeof element === "object" && "rest" in element) {
    return { rest: desugarDefiningPattern(element.rest) };
  } else if (typeof element === "object" && "namedRest" in element) {
    return { rest: desugarDefiningPattern(element.namedRest) };
  } else if (typeof element === "object" && "defaultValue" in element) {
    return {
      name: desugarDefiningPattern(element.name),
      defaultValue: desugar(element.defaultValue),
    };
  } else {
    return desugarDefiningPattern(element);
  }
}

function desugarGiven(expression) {
  const params = {};
  if (expression.given.params) {
    params.params = desugarArrayPattern(expression.given.params ?? []);
  }
  if (expression.given.namedParams) {
    params.namedParams = desugarObjectPattern(
      expression.given.namedParams ?? []
    );
  }
  return given(params, desugar(expression.result));
}

function desugarIndexing(expression) {
  return indexing(desugar(expression.indexing), desugar(expression.at));
}

function desugarGroup(expression) {
  return desugar(expression.group);
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
      axis = calling(axis, desugarPosArgs(args), desugarNamedArgs(namedArgs));
    } else if (op === "PIPECALL") {
      const [callee, allArgs] = target;
      const { args, namedArgs } = allArgs;
      axis = calling(
        desugar(callee),
        [axis, ...desugarPosArgs(args)],
        desugarNamedArgs(namedArgs)
      );
    } else if (op === "PIPEDOT") {
      const [propertyName] = target;
      axis = indexing(axis, propertyName);
    } else if (op === "PIPE") {
      const [callee] = target;
      axis = calling(desugar(callee), [axis]);
    } else if (op === "AT") {
      const [index] = target;
      axis = indexing(axis, desugar(index));
    } else if (op === "BANG") {
      axis = catching(axis);
    } else {
      throw new Error(`Invalid pipeline op ${op}`);
    }
  }
  return axis;
}

function desugarPosArgs(posArgs) {
  const desugaredArgs = desugarArray({ array: posArgs });
  if ("array" in desugaredArgs) {
    return desugaredArgs.array;
  } else {
    return desugaredArgs;
  }
}

function desugarNamedArgs(namedArgs) {
  return namedArgs.map((element) => {
    if ("objectSpread" in element) {
      return { spread: desugar(element.objectSpread) };
    } else {
      const [name, value] = element;
      return [name, desugar(value)];
    }
  });
}
