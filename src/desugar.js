import {
  array,
  calling,
  catching,
  defining,
  given,
  indexing,
  literal,
  name,
  object,
  unquote,
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
  } else if ("unquote" in expression) {
    return desugarUnquote(expression);
  } else if ("group" in expression) {
    return desugarGroup(expression);
  } else if ("access" in expression) {
    return desugarAccess(expression);
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
      name,
      desugar(value),
    ]),
    desugar(expression.result)
  );
}

function desugarGiven(expression) {
  return given(expression.given, desugar(expression.result));
}

function desugarUnquote(expression) {
  return unquote(desugar(expression.unquote));
}

function desugarGroup(expression) {
  return desugar(expression.group);
}

function desugarAccess(expression) {
  return calling(name("at"), [
    desugar(expression.on),
    desugar(desugarProperty(expression.access)),
  ]);
}

function desugarProperty(expression) {
  if ("name" in expression) {
    return literal(expression.name);
  } else if ("unquote" in expression) {
    return desugar(expression.unquote);
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
