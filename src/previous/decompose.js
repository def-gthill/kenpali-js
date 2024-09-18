import { isThrown } from "./builtins.js";
import {
  array,
  at,
  calling,
  catching,
  defining,
  given,
  literal,
  name,
  object,
  quote,
  rest,
  spread,
  unquote,
  withDefault,
} from "./kpast.js";
import kperror from "./kperror.js";
import { catch_ } from "./kpeval.js";

export default function decompose(
  expression,
  { scopeId = "", outerNames = new Map(), builtins = new Map() } = {}
) {
  const nameMapping = new Map([...builtins].map(([name, _]) => [name, name]));
  for (const [localName, globalName] of outerNames) {
    nameMapping.set(localName, globalName);
  }
  try {
    return decomposeInternal(expression, scopeId, nameMapping);
  } catch (error) {
    if (isThrown(error)) {
      return catch_(error);
    } else {
      throw error;
    }
  }
}

export function decomposeModule(
  moduleName,
  definitions,
  { builtins = new Map() } = {}
) {
  const nameMapping = new Map([...builtins].map(([name, _]) => [name, name]));
  for (const [name, _] of definitions) {
    nameMapping.set(name, push(moduleName, name));
  }
  const steps = [];
  for (const [name, value] of definitions) {
    const fullPartName = push(moduleName, name);
    const partPlan = decomposeInternal(value, fullPartName, nameMapping);
    const resultStep = { find: fullPartName, as: partPlan.result };
    steps.push(...partPlan.steps, resultStep);
  }
  return { steps, names: nameMapping };
}

function decomposeInternal(expression, scopeId, outerNames) {
  if ("literal" in expression) {
    return { steps: [], result: expression };
  } else if ("array" in expression) {
    return decomposeArray(expression, scopeId, outerNames);
  } else if ("object" in expression) {
    return decomposeObject(expression, scopeId, outerNames);
  } else if ("name" in expression) {
    if (!outerNames.has(expression.name)) {
      throw kperror("nameNotDefined", ["name", expression.name]);
    }
    return { steps: [], result: name(outerNames.get(expression.name)) };
  } else if ("defining" in expression) {
    return decomposeDefining(expression, scopeId, outerNames);
  } else if ("given" in expression) {
    return decomposeGiven(expression, scopeId, outerNames);
  } else if ("calling" in expression) {
    return decomposeCalling(expression, scopeId, outerNames);
  } else if ("catching" in expression) {
    return decomposeCatching(expression, scopeId, outerNames);
  } else {
    return decomposeNotSupportedYet(expression, scopeId, outerNames);
  }
}

function decomposeArray(expression, scopeId, outerNames) {
  const arrayScopeId = push(scopeId, "$arr");
  const refs = [];
  const steps = [];
  expression.array.forEach((element, i) => {
    if ("spread" in element) {
      const { ref: elementRef, steps: elementSteps } = decomposePart(
        `$${i + 1}`,
        element.spread,
        arrayScopeId,
        outerNames
      );
      refs.push(spread(elementRef));
      steps.push(...elementSteps);
    } else {
      const { ref: elementRef, steps: elementSteps } = decomposePart(
        `$${i + 1}`,
        element,
        arrayScopeId,
        outerNames
      );
      refs.push(elementRef);
      steps.push(...elementSteps);
    }
  });
  const result = array(...refs);
  return { steps, result };
}

function decomposeObject(expression, scopeId, outerNames) {
  const objectScopeId = push(scopeId, "$obj");
  const refs = [];
  const steps = [];
  expression.object.forEach((element, i) => {
    if ("spread" in element) {
      const { ref: elementRef, steps: elementSteps } = decomposePart(
        `$${i + 1}`,
        element.spread,
        objectScopeId,
        outerNames
      );
      refs.push(spread(elementRef));
      steps.push(...elementSteps);
    } else {
      const [key, value] = element;
      const { ref: valueRef, steps: valueSteps } = decomposePart(
        `$v${i + 1}`,
        value,
        objectScopeId,
        outerNames
      );
      steps.push(...valueSteps);
      if (typeof key === "string") {
        refs.push([key, valueRef]);
      } else {
        const { ref: keyRef, steps: keySteps } = decomposePart(
          `$k${i + 1}`,
          key,
          objectScopeId,
          outerNames
        );
        refs.push([keyRef, valueRef]);
        steps.push(...keySteps);
      }
    }
  });
  const result = object(...refs);
  return { steps, result };
}

function decomposeDefining(expression, scopeId, outerNames) {
  const definingScopeId = push(scopeId, "$def");
  const names = new Map([...outerNames]);
  for (const [name, _] of expression.defining) {
    if (typeof name === "string") {
      names.set(name, push(definingScopeId, name));
    } else if ("arrayPattern" in name) {
      for (const element of name.arrayPattern) {
        names.set(element, push(definingScopeId, element));
      }
    } else {
      throw new Error("Pattern not supported yets");
    }
  }
  const steps = [];
  for (const [name, value] of expression.defining) {
    if (typeof name === "string") {
      const fullPartName = push(definingScopeId, name);
      const partPlan = decomposeInternal(value, fullPartName, names);
      const resultStep = { find: fullPartName, as: partPlan.result };
      steps.push(...partPlan.steps, resultStep);
    } else if ("arrayPattern" in name) {
      const partName = push(definingScopeId, `*${name.arrayPattern[0]}`);
      const partPlan = decomposeInternal(value, partName, names);
      steps.push(...partPlan.steps);
      if ("name" in partPlan.result) {
        name.arrayPattern.forEach((element, i) => {
          steps.push({
            find: push(definingScopeId, element),
            as: at(partPlan.result, literal(i + 1)),
          });
        });
      } else {
        steps.push({ find: partName, as: partPlan.result });
        name.arrayPattern.forEach((element, i) => {
          steps.push({
            find: push(definingScopeId, element),
            as: at({ name: partName }, literal(i + 1)),
          });
        });
      }
    } else {
      throw new Error("Pattern not supported yet");
    }
  }
  const resultSteps = decomposeInternal(
    expression.result,
    definingScopeId,
    names
  );
  steps.push(...resultSteps.steps);
  return { steps, result: resultSteps.result };
}

function decomposeGiven(expression, scopeId, outerNames) {
  const givenScopeId = push(scopeId, "$f", "{callId}");
  const names = new Map([...outerNames]);
  const params = [];
  const namedParams = [];
  const steps = [];
  for (const param of expression.given.params ?? []) {
    if (typeof param === "string") {
      const paramName = push(givenScopeId, "$param", param);
      params.push(paramName);
      names.set(param, paramName);
    } else if ("defaultValue" in param) {
      const paramName = push(givenScopeId, "$param", param.name);
      const { ref: defaultRef, steps: defaultSteps } = decomposePart(
        "$default",
        param.defaultValue,
        // Exclude {callId} - all calls share their defaults
        push(scopeId, "$f", "$param", param.name),
        outerNames
      );
      params.push(withDefault(paramName, defaultRef));
      names.set(param.name, paramName);
      steps.push(...defaultSteps);
    } else {
      const paramName = push(givenScopeId, "$param", param.rest);
      params.push(rest(paramName));
      names.set(param.rest, paramName);
    }
  }
  for (const param of expression.given.namedParams ?? []) {
    if (typeof param === "string") {
      const paramName = push(givenScopeId, "$param", param);
      namedParams.push(paramName);
      names.set(param, paramName);
    } else if ("defaultValue" in param) {
      const paramName = push(givenScopeId, "$param", param.name);
      const { ref: defaultRef, steps: defaultSteps } = decomposePart(
        "$default",
        param.defaultValue,
        // Exclude {callId} - all calls share their defaults
        push(scopeId, "$f", "$param", param.name),
        outerNames
      );
      namedParams.push(withDefault(paramName, defaultRef));
      names.set(param.name, paramName);
      steps.push(...defaultSteps);
    } else {
      const paramName = push(givenScopeId, "$param", param.rest);
      namedParams.push(rest(paramName));
      names.set(param.rest, paramName);
    }
  }
  const paramSpec = {};
  if (params.length) {
    paramSpec.params = params;
  }
  if (namedParams.length) {
    paramSpec.namedParams = namedParams;
  }
  const result = given(
    paramSpec,
    decomposeInternal(expression.result, givenScopeId, names)
  );
  return { steps, result };
}

function decomposeCalling(expression, scopeId, outerNames) {
  const callingScopeId = push(scopeId, "$call");
  const steps = [];

  const { ref: functionRef, steps: functionSteps } = decomposePart(
    "$fun",
    expression.calling,
    callingScopeId,
    outerNames
  );
  steps.push(...functionSteps);

  const posArgRefs = [];
  (expression.args ?? []).forEach((arg, i) => {
    if ("spread" in arg) {
      const { ref: posArgRef, steps: posArgSteps } = decomposePart(
        `$pa${i + 1}`,
        arg.spread,
        callingScopeId,
        outerNames
      );
      posArgRefs.push(spread(posArgRef));
      steps.push(...posArgSteps);
    } else {
      const { ref: posArgRef, steps: posArgSteps } = decomposePart(
        `$pa${i + 1}`,
        arg,
        callingScopeId,
        outerNames
      );
      posArgRefs.push(posArgRef);
      steps.push(...posArgSteps);
    }
  });

  const namedArgRefs = [];
  (expression.namedArgs ?? []).forEach((arg, i) => {
    if ("spread" in arg) {
      const { ref: namedArgRef, steps: namedArgSteps } = decomposePart(
        `$na${i + 1}`,
        arg.spread,
        callingScopeId,
        outerNames
      );
      namedArgRefs.push(spread(namedArgRef));
      steps.push(...namedArgSteps);
    } else {
      const [name, value] = arg;
      const { ref: namedArgRef, steps: namedArgSteps } = decomposePart(
        `$na${i + 1}`,
        value,
        callingScopeId,
        outerNames
      );
      namedArgRefs.push([name, namedArgRef]);
      steps.push(...namedArgSteps);
    }
  });

  return { steps, result: calling(functionRef, posArgRefs, namedArgRefs) };
}

function decomposeCatching(expression, scopeId, outerNames) {
  const { ref, steps } = decomposePart(
    "$catch",
    expression.catching,
    scopeId,
    outerNames
  );
  return { steps, result: catching(ref) };
}

function decomposePart(partName, part, scopeId, outerNames) {
  if ("name" in part) {
    if (!outerNames.has(part.name)) {
      throw kperror("nameNotDefined", ["name", part.name]);
    }
    return { ref: name(outerNames.get(part.name)), steps: [] };
  }
  const fullPartName = push(scopeId, partName);
  const partPlan = decomposeInternal(part, fullPartName, outerNames);
  const resultStep = { find: fullPartName, as: partPlan.result };
  const steps = [...partPlan.steps, resultStep];
  return { ref: name(fullPartName), steps };
}

export function push(scopeId, ...names) {
  const joinedNames = names.join(".");
  if (scopeId) {
    return `${scopeId}.${joinedNames}`;
  } else {
    return joinedNames;
  }
}

// Temporary functions bridging the old tree walker with the new compilation pipeline
// TODO Remove this once everything is moved over to the compilation pipeline

function decomposeNotSupportedYet(expression, scopeId, outerNames) {
  return { steps: [], result: replaceNames(expression, outerNames) };
}

function replaceNames(expression, outerNames) {
  if ("array" in expression) {
    return array(
      ...expression.array.map((element) => replaceNames(element, outerNames))
    );
  } else if ("object" in expression) {
    return object(
      ...expression.object.map((element) =>
        Array.isArray(element)
          ? [
              typeof element[0] === "string"
                ? element[0]
                : replaceNames(element[0], outerNames),
              replaceNames(element[1], outerNames),
            ]
          : replaceNames(element, outerNames)
      )
    );
  } else if ("spread" in expression) {
    return spread(replaceNames(expression.spread, outerNames));
  } else if ("name" in expression) {
    return name(outerNames.get(expression.name) ?? expression.name);
  } else if ("defining" in expression) {
    return defining(
      ...expression.defining.map(([name, value]) => [
        name,
        replaceNames(value, outerNames),
      ]),
      replaceNames(expression.result, outerNames)
    );
  } else if ("given" in expression) {
    return given(expression.given, replaceNames(expression.result, outerNames));
  } else if ("calling" in expression) {
    return calling(
      replaceNames(expression.calling, outerNames),
      (expression.args ?? []).map((arg) => replaceNames(arg, outerNames)),
      (expression.namedArgs ?? []).map((arg) =>
        Array.isArray(arg)
          ? [arg[0], replaceNames(arg[1], outerNames)]
          : replaceNames(arg, outerNames)
      )
    );
  } else if ("catching" in expression) {
    return catching(replaceNames(expression.catching, outerNames));
  } else if ("quote" in expression) {
    return quote(replaceNames(expression.quote, outerNames));
  } else if ("unquote" in expression) {
    return unquote(replaceNames(expression.unquote, outerNames));
  } else {
    return expression;
  }
}
