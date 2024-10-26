import {
  array,
  calling,
  catching,
  defining,
  given,
  literal,
  name,
  object,
  optional,
  quote,
  unquote,
} from "./kpast.js";
import kpobject, { kpoEntries, kpoMap } from "./kpobject.js";

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
  } else if ("optional" in expression) {
    return desugarOptional(expression);
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
  if (!expression.array.some((element) => "arraySpread" in element)) {
    return array(...expression.array.map(desugar));
  }
  if (expression.array.length === 1) {
    return desugar(expression.array[0].arraySpread);
  }
  const subArrays = [];
  let currentSubArray = [];
  for (const element of expression.array) {
    if ("arraySpread" in element) {
      if (currentSubArray.length > 0) {
        subArrays.push(array(...currentSubArray));
        currentSubArray = [];
      }
      subArrays.push(desugar(element.arraySpread));
    } else {
      currentSubArray.push(desugar(element));
    }
  }
  if (currentSubArray.length > 0) {
    subArrays.push(array(...currentSubArray));
  }
  return calling(name("flatten"), [array(...subArrays)]);
}

function desugarObject(expression) {
  if (!expression.object.some((entry) => "objectSpread" in entry)) {
    return object(
      ...expression.object.map(([key, value]) => [
        desugarPropertyDefinition(key),
        desugar(value),
      ])
    );
  }
  if (expression.object.length === 1) {
    return desugar(expression.object[0].objectSpread);
  }
  const subObjects = [];
  let currentSubObject = [];
  for (const entry of expression.object) {
    if ("objectSpread" in entry) {
      if (currentSubObject.length > 0) {
        subObjects.push(object(...currentSubObject));
        currentSubObject = [];
      }
      subObjects.push(desugar(entry.objectSpread));
    } else {
      const [key, value] = entry;
      currentSubObject.push([desugarPropertyDefinition(key), desugar(value)]);
    }
  }
  if (currentSubObject.length > 0) {
    subObjects.push(object(...currentSubObject));
  }
  return calling(name("merge"), [array(...subObjects)]);
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
    desugarNamedArgs(expression.namedArgs ?? kpobject())
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
  if (namedArgs instanceof Map) {
    return kpoMap(namedArgs, ([name, arg]) => [name, desugar(arg)]);
  } else {
    return kpobject([
      "#all",
      desugarObject({
        object: namedArgs.map((arg) => {
          if (Array.isArray(arg)) {
            const [key, value] = arg;
            if (typeof key === "string") {
              return [literal(key), value];
            } else {
              return arg;
            }
          } else {
            return arg;
          }
        }),
      }),
    ]);
  }
}

function desugarOptional(expression) {
  return optional(desugar(expression.optional));
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
          const args = call.args?.map(desugar) ?? [];
          const namedArgs = kpoMap(
            call.namedArgs ?? kpobject(),
            ([name, arg]) => [name, desugar(arg)]
          );
          axis = calling(desugar(call.calling), [axis, ...args], namedArgs);
        } else {
          axis = calling(desugar(call), [axis]);
        }
      }
    }
  }
  return axis;
}
