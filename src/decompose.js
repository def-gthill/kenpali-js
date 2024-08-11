import { isThrown } from "./builtins.js";
import {
  array,
  calling,
  catching,
  defining,
  given,
  name,
  object,
  quote,
  spread,
  unquote,
} from "./kpast.js";
import kperror from "./kperror.js";
import { catch_ } from "./kpeval.js";
import kpobject from "./kpobject.js";

export default function decompose(expression, names = kpobject()) {
  const nameMapping = new Map([...names].map(([name, _]) => [name, name]));
  try {
    return decomposeInScope(expression, "", nameMapping);
  } catch (error) {
    if (isThrown(error)) {
      return catch_(error);
    } else {
      throw error;
    }
  }
}

function decomposeInScope(expression, scopeId, outerNames) {
  if ("literal" in expression) {
    return { steps: [], result: expression };
  } else if ("array" in expression) {
    return decomposeArray(expression, scopeId, outerNames);
  } else if ("name" in expression) {
    if (!outerNames.has(expression.name)) {
      throw kperror("nameNotDefined", ["name", expression.name]);
    }
    return { steps: [], result: name(outerNames.get(expression.name)) };
  } else if ("defining" in expression) {
    if (expression.defining.some(([name, _]) => typeof name !== "string")) {
      return decomposeNotSupportedYet(expression, scopeId, outerNames);
    } else {
      return decomposeDefining(expression, scopeId, outerNames);
    }
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

function decomposeDefining(expression, scopeId, outerNames) {
  const definingScopeId = push(scopeId, "$def");
  const names = new Map([...outerNames]);
  for (const [name, _] of expression.defining) {
    names.set(name, push(definingScopeId, name));
  }
  const steps = [];
  for (const [name, value] of expression.defining) {
    const fullPartName = push(definingScopeId, name);
    const partPlan = decomposeInScope(value, fullPartName, names);
    const resultStep = { find: fullPartName, as: partPlan.result };
    steps.push(...partPlan.steps, resultStep);
  }
  const resultSteps = decomposeInScope(
    expression.result,
    definingScopeId,
    names
  );
  steps.push(...resultSteps.steps);
  return { steps, result: resultSteps.result };
}

function decomposePart(partName, part, scopeId, outerNames) {
  if ("name" in part) {
    if (!outerNames.has(part.name)) {
      throw kperror("nameNotDefined", ["name", part.name]);
    }
    return { ref: name(outerNames.get(part.name)), steps: [] };
  }
  const fullPartName = push(scopeId, partName);
  const partPlan = decomposeInScope(part, fullPartName, outerNames);
  const resultStep = { find: fullPartName, as: partPlan.result };
  const steps = [...partPlan.steps, resultStep];
  return { ref: name(fullPartName), steps };
}

function push(scopeId, name) {
  if (scopeId) {
    return `${scopeId}.${name}`;
  } else {
    return name;
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
