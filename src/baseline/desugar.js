import {
  array,
  calling,
  catching,
  defining,
  given,
  literal,
  name,
  object,
  quote,
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
  } else if ("calling" in expression) {
    return desugarCalling(expression);
  } else if ("quote" in expression) {
    return desugarQuote(expression);
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

function desugarCalling(expression) {
  return calling(
    desugar(expression.calling),
    desugarArgs(expression.args ?? []),
    desugarNamedArgs(expression.namedArgs ?? [])
  );
}

function desugarArgs(args) {
  const desugaredArgs = desugarArray({ array: args });
  if ("array" in desugaredArgs) {
    return desugaredArgs.array;
  } else {
    return desugaredArgs;
  }
}

function desugarNamedArgs(namedArgs) {
  return namedArgs.map((arg) => {
    if ("objectSpread" in arg) {
      return { spread: desugar(arg.objectSpread) };
    } else {
      const [name, value] = arg;
      return [name, desugar(value)];
    }
  });
}

function desugarQuote(expression) {
  return quote(desugar(expression.quote));
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
  for (const step of expression.calls) {
    if (step === "BANG") {
      axis = catching(axis);
    } else {
      const [op, call] = step;
      if (op === "AT") {
        axis = calling(name("at"), [axis, desugar(call)]);
      } else {
        if ("calling" in call) {
          const args = (call.args ?? []).map(desugar);
          const namedArgs = (call.namedArgs ?? []).map((element) => {
            if ("objectSpread" in element) {
              return { spread: desugar(element.objectSpread) };
            } else {
              const [name, value] = element;
              return [name, desugar(value)];
            }
          });
          axis = calling(desugar(call.calling), [axis, ...args], namedArgs);
        } else {
          axis = calling(desugar(call), [axis]);
        }
      }
    }
  }
  return axis;
}
