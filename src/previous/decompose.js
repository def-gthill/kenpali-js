import { array, name, spread } from "./kpast.js";
import kpobject from "./kpobject.js";

export default function decompose(expression, names = kpobject()) {
  return decomposeInScope(expression, "", names);
}

function decomposeInScope(expression, scopeId, outerNames) {
  if ("literal" in expression) {
    return { steps: [], result: expression };
  } else if ("array" in expression) {
    return decomposeArray(expression, scopeId, outerNames);
  }
  return { steps: [], result: expression };
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
