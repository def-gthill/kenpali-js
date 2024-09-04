import {
  arrayOf,
  as,
  deepForce,
  default_,
  eagerBind,
  either,
  force,
  objectOf,
  rest,
} from "./bind.js";
import {
  demandParameterValues,
  equals,
  isArray,
  isBuiltin,
  isError,
  isFunction,
  isGiven,
  isObject,
  isSequence,
  isString,
  isThrown,
  loadBuiltins,
  selfInliningBuiltin,
  typeOf,
} from "./builtins.js";
import { core as coreCode } from "./core.js";
import decompose, { decomposeModule, push } from "./decompose.js";
import {
  array,
  assert,
  bind,
  bindArrayElement,
  bindArrayRest,
  bindObjectEntry,
  bindObjectRest,
  bindValid,
  calling,
  checkType,
  findAll,
  if_,
  literal,
  name,
  object,
  passThrown,
  spread,
} from "./kpast.js";
import kpthrow from "./kperror.js";
import kpobject, {
  kpoEntries,
  kpoFilter,
  kpoKeys,
  kpoMap,
  kpoMerge,
  kpoValues,
  toJsObject,
  toKpobject,
} from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";

export function kpevalJson(
  json,
  { names = kpobject(), modules = kpobject() } = {}
) {
  const expression = JSON.parse(json);
  return kpeval(expression, { names, modules });
}

export default function kpeval(
  expression,
  { names = kpobject(), modules = kpobject() } = {}
) {
  const compiled = kpcompile(expression, { names, modules });
  if (isError(compiled)) {
    return compiled;
  }
  return evalCompiled(compiled);
}

export function kpcompile(
  expression,
  { names = kpobject(), modules = kpobject() } = {}
) {
  const check = validateExpression(expression);
  if (isThrown(check)) {
    return catch_(check);
  }
  const builtins = loadBuiltins(modules);
  const { steps: moduleInstructions, names: nameMapping } = loadCore(builtins);
  const decomposed = decompose(expression, {
    builtins,
    outerNames: nameMapping,
  });
  if (isError(decomposed)) {
    return decomposed;
  }
  const allNames = kpoMerge(builtins, names);
  return { instructions: decomposed, moduleInstructions, names: allNames };
}

export function evalCompiled({ instructions, moduleInstructions, names }) {
  const allInstructions = {
    steps: [...instructions.steps, ...moduleInstructions],
    result: instructions.result,
  };
  return deepForce(deepCatch(evalPlan(allInstructions, names)));
}

function validateExpression(expression) {
  try {
    transformTree(expression, {
      handleOther(node) {
        if (node === null || typeof node !== "object") {
          throw kpthrow("notAnExpression", ["value", node]);
        }
      },
    });
  } catch (error) {
    if (isThrown(error)) {
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
      array: node.array.map((element) => {
        if ("spread" in element) {
          return { spread: recurse(element.spread) };
        } else {
          return recurse(element);
        }
      }),
    }));
  } else if ("object" in expression) {
    return transformNode("handleObject", (node) => ({
      ...node,
      object: node.object.map((element) => {
        if ("spread" in element) {
          return { spread: recurse(element.spread) };
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
        args: (node.args ?? []).map((element) => {
          if ("spread" in element) {
            return { spread: recurse(element.spread) };
          } else {
            return recurse(element);
          }
        }),
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
  } else if ("ifThrown" in expression) {
    return transformNode("handleIfThrown", (node) => ({
      ...node,
      ifThrown: recurse(node.ifThrown),
      then: recurse(node.then),
    }));
  } else if ("passThrown" in expression) {
    return transformNode("handlePassThrown", (node) => ({
      ...node,
      passThrown: recurse(node.passThrown),
      otherwise: recurse(node.otherwise),
    }));
  } else if ("at" in expression) {
    return transformNode("handleAt", (node) => ({
      ...node,
      at: recurse(node.at),
      in: recurse(node.in),
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

function loadCore(builtins) {
  if (!core) {
    const code = coreCode;
    const ast = kpparseModule(code).module;
    const { steps, names } = decomposeModule("core", ast, { builtins });
    core = { steps, names };
  }
  return core;
}

function evalPlan(plan, names) {
  const computed = names;
  const steps = [
    ...plan.steps,
    { find: "$lazyResult", as: plan.result },
    { find: "$result", as: findAll(name("$lazyResult")) },
  ];
  const stepsByName = new Map(steps.map((step) => [step.find, step]));
  let nextCallId = 1;

  const stack = ["$result"];
  let i = 0;
  while (stack.length > 0) {
    const step = stepsByName.get(stack.at(-1));
    // if (computed.has(step)) {
    //   stack.pop();
    //   continue;
    // }
    // TODO Make this an *exception* once everything is moved over to the compilation pipeline
    if (!step) {
      return kpthrow("nameNotDefined", ["name", stack.at(-1)]);
    }
    let result;
    if ("calling" in step.as) {
      if (step.as.callId) {
        step.callId = step.as.callId;
      }
      if (!("callId" in step)) {
        step.callId = nextCallId;
        nextCallId += 1;
      }
      result = tryEvalCalling(step.as, step.callId, computed);
    } else {
      result = tryEvalNode(step.find, step.as, computed);
    }
    // console.log(step);
    // console.log(result);
    if ("value" in result) {
      stack.pop();
      computed.set(step.find, result.value);
    } else if ("stepsNeeded" in result) {
      stack.push(...result.stepsNeeded);
    } else if ("expansion" in result) {
      for (const expansionStep of result.expansion.steps) {
        stepsByName.set(expansionStep.find, expansionStep);
      }
      stepsByName.set(step.find, {
        find: step.find,
        as: result.expansion.result,
      });
    } else {
      throw new Error(`Invalid try-eval response ${result}`);
    }
    i += 1;
    // if (i >= 1000) {
    //   throw new Error("Stop!");
    // }
  }

  return computed.get("$result");
}

export function evalCompiledToFunction({
  instructions,
  moduleInstructions,
  names,
}) {
  // TODO implement this once the temporary bridging code in evalCompiled is dealt with
  return () => 42;
}

export function value(value) {
  return { value };
}

export function stepsNeeded(steps) {
  return { stepsNeeded: steps };
}

export function expansion(result, steps = []) {
  return { expansion: { steps, result } };
}

export function tryEvalNode(name, node, computed = kpobject()) {
  if ("literal" in node) {
    return { value: node.literal };
  } else if ("name" in node) {
    return tryEvalName(node, computed);
  } else if ("array" in node) {
    return tryEvalArray(node, computed);
  } else if ("object" in node) {
    return tryEvalObject(node, computed);
  } else if ("given" in node) {
    return tryEvalGiven(node, computed);
  } else if ("catching" in node) {
    return tryEvalCatching(node, computed);
  } else if ("findAll" in node) {
    return tryEvalFindAll(node, computed);
  } else if ("if" in node) {
    return tryEvalIf(node, computed);
  } else if ("ifThrown" in node) {
    return tryEvalIfThrown(node, computed);
  } else if ("passThrown" in node) {
    return tryEvalPassThrown(node, computed);
  } else if ("at" in node) {
    return tryEvalAt(node, computed);
  } else if ("assert" in node) {
    return tryEvalAssert(name, node, computed);
  } else if ("check" in node) {
    return tryEvalCheck(node, computed);
  } else if ("bind" in node) {
    return tryEvalBind(name, node);
  } else if ("bindValid" in node) {
    return tryEvalBindValid(name, node, computed);
  } else if ("bindElementOf" in node) {
    return tryEvalBindElementOf(node, computed);
  } else if ("bindArrayRest" in node) {
    return tryEvalBindArrayRest(node, computed);
  } else if ("bindEntryOf" in node) {
    return tryEvalBindEntryOf(node, computed);
  } else if ("bindObjectRest" in node) {
    return tryEvalBindObjectRest(node, computed);
  } else {
    throw new Error(`Invalid instruction ${JSON.stringify(node)}`);
  }
}

function tryEvalName(node, computed) {
  if (computed.has(node.name)) {
    return { value: computed.get(node.name) };
  } else {
    return { stepsNeeded: [node.name] };
  }
}

function tryEvalArray(node, computed) {
  const result = [];
  const stepsNeeded = [];
  for (const element of node.array) {
    if ("spread" in element) {
      if (computed.has(element.spread.name)) {
        result.push(...computed.get(element.spread.name));
      } else {
        stepsNeeded.push(element.spread.name);
      }
    } else {
      // if (computed.has(element.name)) {
      //   result.push(computed.get(element.name));
      // } else {
      //   stepsNeeded.push(element.name);
      // }
      result.push(element);
    }
  }
  if (stepsNeeded.length > 0) {
    return { stepsNeeded };
  } else {
    return { value: result };
  }
}

function tryEvalObject(node, computed) {
  const result = kpobject();
  const stepsNeeded = [];
  for (const element of node.object) {
    if ("spread" in element) {
      const spreadResult = demandValue(element.spread, computed);
      if (spreadResult === undefined) {
        stepsNeeded.push(element.spread.name);
      } else {
        for (const [key, value] of kpoEntries(spreadResult)) {
          result.set(key, value);
        }
      }
    } else {
      const [key, value] = element;
      let keyResult, valueResult;
      if (typeof key === "string") {
        keyResult = key;
      } else {
        keyResult = demandValue(key, computed);
        if (keyResult === undefined) {
          stepsNeeded.push(key.name);
        }
      }
      valueResult = demandValue(value, computed);
      if (valueResult === undefined) {
        stepsNeeded.push(value.name);
      }
      result.set(keyResult, valueResult);
    }
  }
  if (stepsNeeded.length > 0) {
    return { stepsNeeded };
  } else {
    return { value: result };
  }
}

function tryEvalGiven(node, computed, names) {
  return {
    value: kpobject(
      ["#given", paramSpecToKpValue(node.given)],
      ["result", deepToKpObject(node.result)]
    ),
  };
}

function tryEvalCalling(node, callId, computed) {
  const stepsNeeded = [];
  let f;
  if ("bound" in node.calling) {
    return tryEvalCallingBoundSelfInliningBuiltin(
      node.calling.bound,
      callId,
      computed
    );
  } else if ("literal" in node.calling) {
    f = node.calling.literal;
  } else if (computed.has(node.calling.name)) {
    f = computed.get(node.calling.name);
  } else {
    stepsNeeded.push(node.calling.name);
  }
  const rawArgs = node.args ?? [];
  const args = [];
  for (const arg of rawArgs) {
    if ("spread" in arg) {
      let spreadValue;
      if ("literal" in arg.spread) {
        spreadValue = arg.spread.literal;
      } else if (computed.has(arg.spread.name)) {
        spreadValue = computed.get(arg.spread.name);
      } else {
        stepsNeeded.push(arg.spread.name);
      }
      if (spreadValue) {
        for (const arg of spreadValue) {
          args.push(arg);
        }
      }
    } else {
      args.push(arg);
    }
  }
  const rawNamedArgs = node.namedArgs ?? [];
  const namedArgs = kpobject();
  for (const arg of rawNamedArgs) {
    if ("spread" in arg) {
      if ("literal" in arg.spread) {
        for (const [name, value] of kpoEntries(arg.spread.literal)) {
          namedArgs.set(name, literal(value));
        }
      } else if (computed.has(arg.spread.name)) {
        for (const [name, value] of kpoEntries(computed.get(arg.spread.name))) {
          namedArgs.set(name, literal(value));
        }
      } else {
        stepsNeeded.push(arg.spread.name);
      }
    } else {
      const [name, value] = arg;
      namedArgs.set(name, value);
    }
  }
  if (stepsNeeded.length > 0) {
    return { stepsNeeded };
  }
  if (isGiven(f)) {
    return tryEvalCallingGiven(f, callId, args, namedArgs);
  } else if (isBuiltin(f)) {
    if (f.isLazy) {
      return tryEvalCallingLazyBuiltin(f, args, namedArgs, computed);
    } else if (f.isSelfInlining) {
      return tryEvalCallingSelfInliningBuiltin(
        f,
        callId,
        args,
        namedArgs,
        computed
      );
    } else {
      return tryEvalCallingEagerBuiltin(f, args, namedArgs, computed);
    }
  } else {
    return { value: kpthrow("notCallable", ["value", f]) };
  }
}

function tryEvalCallingGiven(f, callId, args, namedArgs) {
  const jsf = {
    given: deepToJsObject(f.get("#given")),
    result: deepToJsObject(f.get("result")),
  };
  const { steps: bodySteps, result } = jsf.result;

  const { params: paramTemplates, namedParams: namedParamTemplates } =
    normalizeAllParams(jsf.given);
  const params = paramTemplates.map((param) =>
    injectCallIdIntoParam(param, callId)
  );
  const namedParams = namedParamTemplates.map((param) =>
    injectCallIdIntoParam(param, callId)
  );

  const paramSteps = [];
  let j = 0;
  for (let i = 0; i < params.length; i++) {
    if (params[i].rest) {
      const remainingArgs = [];
      const numRemainingArgs = args.length - params.length + 1;
      for (let k = j; k < j + numRemainingArgs; k++) {
        remainingArgs.push(args[k]);
      }
      paramSteps.push({
        find: params[i].rest.name,
        as: array(...remainingArgs),
      });
      j += numRemainingArgs;
    } else if (j < args.length) {
      paramSteps.push({ find: params[i].name, as: args[j] });
      j++;
    } else if (params[i].defaultValue) {
      paramSteps.push({ find: params[i].name, as: params[i].defaultValue });
    } else {
      return {
        value: kpthrow("missingArgument", ["name", simpleName(params[i].name)]),
      };
    }
  }
  for (const param of namedParams) {
    if (param.rest) {
      const remainingNamedArgs = [];
      for (const [name, arg] of kpoEntries(namedArgs)) {
        remainingNamedArgs.push([name, arg]);
      }
      paramSteps.push({
        find: param.rest.name,
        as: object(...remainingNamedArgs),
      });
    } else if (namedArgs.has(simpleName(param.name))) {
      paramSteps.push({
        find: param.name,
        as: namedArgs.get(simpleName(param.name)),
      });
    } else if (param.defaultValue) {
      paramSteps.push({ find: param.name, as: param.defaultValue });
    } else {
      return {
        value: kpthrow("missingArgument", ["name", simpleName(param.name)]),
      };
    }
  }

  const steps = [...paramSteps, ...bodySteps];
  return {
    expansion: {
      steps: steps.map((step) => injectCallIdIntoStep(step, callId)),
      result: injectCallIdIntoNode(result, callId),
    },
  };
}

function tryEvalCallingLazyBuiltin(f, args, namedArgs, computed) {
  const allParams = paramsFromBuiltin(f);
  const paramObjects = normalizeAllParams(allParams);
  const posArgsByName = kpobject();
  for (let i = 0; i < paramObjects.params.length; i++) {
    posArgsByName.set(paramObjects.params[i].name, args[i]);
  }
  const allArgs = kpoMerge(posArgsByName, namedArgs);

  const restParamIndex = paramObjects.params.findIndex(
    (param) => "rest" in param
  );
  const restArgs =
    restParamIndex >= 0
      ? args.slice(
          restParamIndex,
          restParamIndex + args.length - paramObjects.params.length + 1
        )
      : [];

  const argGetter = {
    arg(name) {
      const arg = allArgs.get(name);
      if ("literal" in arg) {
        return arg.literal;
      } else if (computed.has(arg.name)) {
        return computed.get(arg.name);
      } else {
        throw kpthrow("stepNeeded", ["name", arg.name]);
      }
    },
    numRestArgs: restArgs.length,
    restArg(index) {
      const arg = restArgs[index];
      if ("literal" in arg) {
        return arg.literal;
      } else if (computed.has(arg.name)) {
        return computed.get(arg.name);
      } else {
        throw kpthrow("stepNeeded", ["name", arg.name]);
      }
    },
  };
  try {
    return { value: f(argGetter) };
  } catch (error) {
    if (isThrown(error)) {
      if (error.get("#thrown") === "stepNeeded") {
        return { stepsNeeded: [error.get("name")] };
      } else {
        return error;
      }
    } else {
      throw error;
    }
  }
}

function tryEvalCallingSelfInliningBuiltin(
  f,
  callId,
  args,
  namedArgs,
  computed
) {
  const allParams = paramsFromBuiltin(f);
  const { params: paramTemplates, namedParams: namedParamTemplates } =
    normalizeAllParams(allParams);
  const params = paramTemplates.map((param) =>
    injectCallIdIntoParam(param, callId)
  );
  const namedParams = namedParamTemplates.map((param) =>
    injectCallIdIntoParam(param, callId)
  );
  const paramSteps = [];
  let j = 0;
  for (let i = 0; i < params.length; i++) {
    if (params[i].rest) {
      const remainingArgs = [];
      const numRemainingArgs = args.length - params.length + 1;
      for (let k = j; k < j + numRemainingArgs; k++) {
        remainingArgs.push(args[k]);
      }
      paramSteps.push({
        find: params[i].rest.name,
        as: array(...remainingArgs),
      });
      j += numRemainingArgs;
    } else if (j < args.length) {
      paramSteps.push({ find: params[i].name, as: args[j] });
      j++;
    } else if (params[i].defaultValue) {
      paramSteps.push({ find: params[i].name, as: params[i].defaultValue });
    } else {
      return {
        value: kpthrow("missingArgument", ["name", simpleName(params[i].name)]),
      };
    }
  }
  for (const param of namedParams) {
    if (param.rest) {
      const remainingNamedArgs = [];
      for (const [name, arg] of kpoEntries(namedArgs)) {
        remainingNamedArgs.push([name, arg]);
      }
      paramSteps.push({
        find: param.rest.name,
        as: object(...remainingNamedArgs),
      });
    } else if (namedArgs.has(simpleName(param.name))) {
      paramSteps.push({
        find: param.name,
        as: namedArgs.get(simpleName(param.name)),
      });
    } else if (param.defaultValue) {
      paramSteps.push({ find: param.name, as: param.defaultValue });
    } else {
      return {
        value: kpthrow("missingArgument", ["name", simpleName(param.name)]),
      };
    }
  }
  return {
    expansion: {
      steps: paramSteps.map((step) => injectCallIdIntoStep(step, callId)),
      result: { ...calling({ bound: f }), callId },
    },
  };
}

function tryEvalCallingBoundSelfInliningBuiltin(f, callId, computed) {
  const result = f((name) => injectCallId(name, callId), computed);
  if ("expansion" in result) {
    return {
      expansion: {
        steps: result.expansion.steps.map((step) =>
          injectCallIdIntoStep(step, callId)
        ),
        result: injectCallIdIntoNode(result.expansion.result, callId),
      },
    };
  } else {
    return result;
  }
}

function tryEvalCallingEagerBuiltin(f, args, namedArgs, computed) {
  const argValues = [];
  const namedArgValues = kpobject();
  const stepsNeeded = [];
  for (const arg of args) {
    const argResult = tryFindAll(arg, computed);
    if ("stepsNeeded" in argResult) {
      stepsNeeded.push(...argResult.stepsNeeded);
    } else {
      argValues.push(argResult.value);
    }
  }
  for (const [name, arg] of namedArgs) {
    if ("literal" in arg) {
      namedArgValues.set(name, arg.literal);
    } else if (computed.has(arg.name)) {
      namedArgValues.set(name, computed.get(arg.name));
    } else {
      stepsNeeded.push(arg.name);
    }
  }
  if (stepsNeeded.length > 0) {
    return { stepsNeeded };
  }
  for (const argValue of argValues) {
    if (isThrown(argValue)) {
      return { value: argValue };
    }
  }
  for (const [_, argValue] of kpoEntries(namedArgValues)) {
    if (isThrown(argValue)) {
      return { value: argValue };
    }
  }
  const allParams = paramsFromBuiltin(f);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = kpoMerge(
    eagerBind(argValues, schema[0]),
    eagerBind(namedArgValues, schema[1])
  );
  if (isThrown(bindings)) {
    return { value: argumentErrorGivenParamObjects(paramObjects, bindings) };
  }
  const boundArgs = [];
  for (const param of paramObjects.params) {
    if ("rest" in param) {
      boundArgs.push(...bindings.get(param.rest.name).map(force));
    } else {
      boundArgs.push(force(bindings.get(param.name)));
    }
  }
  const boundNamedArgs = kpobject();
  for (const param of paramObjects.namedParams) {
    if ("rest" in param) {
      for (const [name, value] of bindings.get(param.rest.name)) {
        boundNamedArgs.set(name, force(value));
      }
    } else {
      boundNamedArgs.set(param.name, force(bindings.get(param.name)));
    }
  }
  return { value: f(boundArgs, boundNamedArgs) };
}

function injectCallIdIntoParam(param, callId) {
  if (typeof param === "string") {
    return injectCallId(param, callId);
  } else if ("rest" in param) {
    return { rest: injectCallIdIntoParam(param.rest, callId) };
  } else {
    return { ...param, name: injectCallId(param.name, callId) };
  }
}

function injectCallIdIntoStep(step, callId) {
  return {
    find: injectCallId(step.find, callId),
    as: injectCallIdIntoNode(step.as, callId),
  };
}

function injectCallIdIntoNode(node, callId) {
  return transformTree(node, {
    handleName({ name }) {
      return { name: injectCallId(name, callId) };
    },
    handleGiven({ given, result }) {
      return {
        given: {
          params: (given.params ?? []).map((param) =>
            injectCallIdIntoParam(param, callId)
          ),
          namedParams: (given.namedParams ?? []).map((param) =>
            injectCallIdIntoParam(param, callId)
          ),
        },
        result: {
          steps: result.steps.map((step) => injectCallIdIntoStep(step, callId)),
          result: injectCallIdIntoNode(result.result, callId),
        },
      };
    },
  });
}

function injectCallId(name, callId) {
  if (typeof callId != "number") {
    throw new Error("Call ID must be a number");
  }
  return name.replace("{callId}", `#${callId}`);
}

function tryEvalCatching(node, computed) {
  if (computed.has(node.catching.name)) {
    return { value: catch_(computed.get(node.catching.name)) };
  } else {
    return { stepsNeeded: [node.catching.name] };
  }
}

function tryEvalFindAll(node, computed) {
  return tryFindAll(node.findAll, computed);
}

export function tryFindAll(node, computed) {
  let value;
  if (isNode(node)) {
    if ("literal" in node) {
      value = node.literal;
    } else if (computed.has(node.name)) {
      value = computed.get(node.name);
    } else {
      return { stepsNeeded: [node.name] };
    }
  } else {
    value = node;
  }
  if (isArray(value)) {
    const result = [];
    const stepsNeeded = [];
    for (const element of value) {
      const elementResult = tryFindAll(element, computed);
      if ("stepsNeeded" in elementResult) {
        stepsNeeded.push(...elementResult.stepsNeeded);
      } else {
        result.push(elementResult.value);
      }
    }
    if (stepsNeeded.length > 0) {
      return { stepsNeeded };
    } else {
      return { value: result };
    }
  } else if (isObject(value)) {
    const result = kpobject();
    const stepsNeeded = [];
    for (const [key, propertyValue] of kpoEntries(value)) {
      const propertyResult = tryFindAll(propertyValue, computed);
      if ("stepsNeeded" in propertyResult) {
        stepsNeeded.push(...propertyResult.stepsNeeded);
      } else {
        result.set(key, propertyResult.value);
      }
    }
    if (stepsNeeded.length > 0) {
      return { stepsNeeded };
    } else {
      return { value: result };
    }
  } else {
    return { value };
  }
}

function tryEvalIf(node, computed) {
  const [{ condition }, earlyReturn] = demandValues_NEW(
    { condition: node.if },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  if (condition) {
    return expansion(node.then);
  } else {
    return expansion(node.else);
  }
}

function tryEvalIfThrown(node, computed) {
  const [{ possibleError }, earlyReturn] = demandValuesWithoutShortCircuiting(
    { possibleError: node.ifThrown },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  if (isThrown(possibleError)) {
    return expansion(node.then);
  } else {
    return { value: possibleError };
  }
}

function tryEvalPassThrown(node, computed) {
  const [{ possibleError }, earlyReturn] = demandValuesWithoutShortCircuiting(
    { possibleError: node.passThrown },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  if (isThrown(possibleError)) {
    return { value: possibleError };
  } else {
    return expansion(node.otherwise);
  }
}

function tryEvalAt(node, computed) {
  const [{ collection, index }, earlyReturn] = demandValues_NEW(
    {
      collection: node.in,
      index: node.at,
    },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  if (isString(collection) || isArray(collection)) {
    const check = validateArgument(index, "number");
    if (isThrown(check)) {
      return { value: check };
    }
    if (index < 1 || index > collection.length) {
      return {
        value: kpthrow(
          "indexOutOfBounds",
          ["function", "at"],
          ["value", collection],
          ["length", collection.length],
          ["index", index]
        ),
      };
    }
    if (isString(collection)) {
      return { value: collection[index - 1] };
    } else {
      if (isNode(collection[index - 1])) {
        const [{ element }, earlyReturn] = demandValues_NEW(
          { element: collection[index - 1] },
          computed
        );
        if (earlyReturn) {
          return earlyReturn;
        }
        return { value: element };
      } else {
        return { value: collection[index - 1] };
      }
    }
  } else if (isObject(collection)) {
    const check = validateArgument(index, "string");
    if (isThrown(check)) {
      return { value: check };
    }
    if (!collection.has(index)) {
      return {
        value: kpthrow(
          "missingProperty",
          ["value", collection],
          ["key", index]
        ),
      };
    }
    return { value: collection.get(index) };
  } else {
    return {
      value: kpthrow(
        "wrongArgumentType",
        ["value", collection],
        ["expectedType", either("sequence", "object")]
      ),
    };
  }
}

function validateArgument(value, schema) {
  const check = eagerBind(value, schema);
  if (isThrown(check)) {
    return argumentError(check);
  }
  return null;
}

function tryEvalCheck(node, computed) {
  if ("type" in node) {
    return tryEvalTypeCheck(node, computed);
  } else {
    throw new Error(`Invalid check node ${node}`);
  }
}

function tryEvalAssert(stepName, node, computed) {
  const assertName = push(stepName, "$assert");
  return expansion(
    if_(
      name(push(assertName, "passed")),
      node.assert,
      name(push(assertName, "error"))
    ),
    [
      {
        find: push(assertName, "passed"),
        as: calling(node.satisfies, [node.assert]),
      },
      {
        find: push(assertName, "error"),
        as: object(
          ["#thrown", literal("badValue")],
          ["value", node.assert],
          ["condition", node.satisfies]
        ),
      },
    ]
  );
}

function tryEvalTypeCheck(node, computed) {
  const [{ value, expectedType }, earlyReturn] = demandValues_NEW(
    {
      value: node.check,
      expectedType: node.type,
    },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  if (typeOf(value) === expectedType) {
    return { value };
  } else if (expectedType === "any") {
    return { value };
  } else if (expectedType === "object" && isObject(value)) {
    return { value };
  } else if (expectedType === "function" && isFunction(value)) {
    return { value };
  } else if (expectedType === "sequence" && isSequence(value)) {
    return { value };
  } else {
    return { value: wrongType(value, expectedType) };
  }
}

function tryEvalBind(stepName, node) {
  return expansion(passThrown(node.bind, name(push(stepName, "binding"))), [
    {
      find: push(stepName, "binding"),
      as: bindValid(node.bind, node.to),
    },
  ]);
}

function tryEvalBindValid(stepName, node, computed) {
  const [{ schema: shallowSchema }, stepsNeeded] = demandValues(
    { schema: node.to },
    computed
  );
  if (stepsNeeded.length > 0) {
    return { stepsNeeded };
  }
  const schemaResult = tryFindAll(shallowSchema, computed);
  if ("stepsNeeded" in schemaResult) {
    return schemaResult;
  }
  const schema = schemaResult.value;

  const value = node.bindValid;
  if (isString(schema)) {
    return bindTypeSchema(stepName, value, schema);
  } else if (isArray(schema)) {
    return bindArraySchema(stepName, value, schema);
  } else if (isObject(schema)) {
    if (schema.has("#type")) {
      return bindTypeWithConditionsSchema(stepName, value, schema, computed);
    } else if (schema.has("#oneOf")) {
      return bindLiteralListSchema(value, schema, computed);
    } else if (schema.has("#either")) {
      return bindUnionSchema(stepName, value, schema);
    } else if (schema.has("#bind")) {
      return bindExplicit(stepName, value, schema);
    } else {
      return bindObjectSchema(stepName, value, schema);
    }
  } else {
    return { value: invalidSchema(schema) };
  }
}

function bindTypeSchema(stepName, value, schema) {
  return expansion(object(["all", name(push(stepName, "$bind", "all"))]), [
    {
      find: push(stepName, "$bind", "all"),
      as: checkType(value, literal(schema)),
    },
  ]);
}

function bindTypeWithConditionsSchema(stepName, value, schema, computed) {
  const bindName = push(stepName, "$bind");
  const steps = [
    {
      find: push(bindName, "typeChecked"),
      as: checkType(value, literal(schema.get("#type"))),
    },
  ];
  let axis = push(bindName, "typeChecked");
  if (schema.has("where")) {
    steps.push({
      find: push(bindName, "conditionChecked"),
      as: assert(name(axis), literal(schema.get("where"))),
    });
    axis = push(bindName, "conditionChecked");
  }
  const axisBeforeKeysAndValues = axis;
  if (schema.has("elements")) {
    const continuation = selfInliningBuiltin(
      push(bindName, "continuation"),
      {
        params: ["value", "index", "bindResult", "bindings"],
      },
      function (_scopeId, paramNames, computed) {
        const [{ value, index, bindResult, bindings }, earlyReturn] =
          demandParameterValues(
            ["value", "index", "bindResult", "bindings"],
            paramNames,
            computed
          );
        if (earlyReturn) {
          return earlyReturn;
        }
        if (isThrown(bindResult.get("all"))) {
          return { value: badElement(value, index) };
        }
        const newBindings = kpoMap(bindings, ([key, bindingArray]) => [
          key,
          [...bindingArray],
        ]);
        for (const [key, value] of bindResult) {
          if (!newBindings.has(key)) {
            newBindings.set(key, []);
          }
          newBindings.get(key)[index - 1] = value;
        }
        if (index < value.length) {
          return expansion(
            calling(literal(continuation), [
              literal(value),
              literal(index + 1),
              name(push(bindName, `$${index + 1}.bindResult`)),
              literal(newBindings),
            ]),
            [
              {
                find: push(bindName, `$${index + 1}.bindResult`),
                as: bind(
                  name(push(bindName, `$${index + 1}`)),
                  literal(schema.get("elements"))
                ),
              },
              {
                find: push(bindName, `$${index + 1}`),
                as: calling(name("at"), [literal(value), literal(index + 1)]),
              },
            ]
          );
        } else {
          return { value: newBindings };
        }
      }
    );
    const bindings = object(
      ...namesToBind(schema.get("elements")).map((bindingName) => [
        bindingName,
        name(push(bindName, "emptyArray")),
      ])
    );
    steps.push(
      {
        find: push(bindName, "elementsChecked"),
        as: if_(
          name(push(bindName, "empty")),
          name(push(bindName, "emptyResult")),
          name(push(bindName, "elementsCheckedNotEmpty"))
        ),
      },
      {
        find: push(bindName, "emptyResult"),
        as: object(spread(name(push(bindName, "emptyBindings"))), [
          "all",
          name(axis),
        ]),
      },
      {
        find: push(bindName, "emptyBindings"),
        as: bindings,
      },
      {
        find: push(bindName, "empty"),
        as: calling(name("equals"), [
          name(push(bindName, "length")),
          literal(0),
        ]),
      },
      {
        find: push(bindName, "length"),
        as: calling(name("length"), [name(axis)]),
      },
      {
        find: push(bindName, "elementsCheckedNotEmpty"),
        as: calling(literal(continuation), [
          name(axis),
          literal(1),
          name(push(bindName, `$1.bindResult`)),
          bindings,
        ]),
      },
      {
        find: push(bindName, `$1.bindResult`),
        as: bind(name(push(bindName, `$1`)), literal(schema.get("elements"))),
      },
      {
        find: push(bindName, `$1`),
        as: calling(name("at"), [name(axis), literal(1)]),
      },
      {
        find: push(bindName, "emptyArray"),
        as: array(),
      }
    );
    axis = push(bindName, "elementsChecked");
  } else {
    if (schema.has("keys")) {
      const continuation = selfInliningBuiltin(
        push(bindName, "continuation"),
        {
          params: ["value", "keys", "index", "bindResult"],
        },
        function (_scopeId, paramNames, computed) {
          const [{ value, keys, index, bindResult }, earlyReturn] =
            demandParameterValues(
              ["value", "keys", "index", "bindResult"],
              paramNames,
              computed
            );
          if (earlyReturn) {
            return earlyReturn;
          }
          if (isThrown(bindResult.get("all"))) {
            return { value: badKey(keys[index - 1], bindResult.get("all")) };
          } else {
            // TODO add to combined bindings.
          }
          if (index < keys.length) {
            return expansion(
              calling(literal(continuation), [
                literal(value),
                literal(keys),
                literal(index + 1),
                name(push(bindName, `$k${index + 1}.bindResult`)),
              ]),
              [
                {
                  find: push(bindName, `$k${index + 1}.bindResult`),
                  as: bind(
                    name(push(bindName, `$k${index + 1}`)),
                    literal(schema.get("keys"))
                  ),
                },
                {
                  find: push(bindName, `$k${index + 1}`),
                  as: calling(name("at"), [literal(keys), literal(index + 1)]),
                },
              ]
            );
          } else {
            return { value };
          }
        }
      );
      const bindings = object(
        ...namesToBind(schema.get("keys")).map((bindingName) => [
          bindingName,
          name(push(bindName, "emptyObject")),
        ])
      );
      steps.push(
        {
          find: push(bindName, "keysChecked"),
          as: if_(
            name(push(bindName, "keysEmpty")),
            name(push(bindName, "keysEmptyResult")),
            name(push(bindName, "keysCheckedNotEmpty"))
          ),
        },
        {
          find: push(bindName, "keysEmptyResult"),
          as: object(spread(name(push(bindName, "keysEmptyBindings"))), [
            "all",
            name(axis),
          ]),
        },
        {
          find: push(bindName, "keysEmptyBindings"),
          as: bindings,
        },
        {
          find: push(bindName, "keysEmpty"),
          as: calling(name("equals"), [
            name(push(bindName, "keysLength")),
            literal(0),
          ]),
        },
        {
          find: push(bindName, "keysLength"),
          as: calling(name("length"), [name(push(bindName, "keys"))]),
        },
        {
          find: push(bindName, "keysCheckedNotEmpty"),
          as: calling(literal(continuation), [
            name(axis),
            name(push(bindName, "keys")),
            literal(1),
            name(push(bindName, `$k1.bindResult`)),
          ]),
        },
        {
          find: push(bindName, `$k1.bindResult`),
          as: bind(name(push(bindName, `$k1`)), literal(schema.get("keys"))),
        },
        {
          find: push(bindName, `$k1`),
          as: calling(name("at"), [name(push(bindName, "keys")), literal(1)]),
        },
        {
          find: push(bindName, "keys"),
          as: calling(name("keys"), [name(axisBeforeKeysAndValues)]),
        },
        {
          find: push(bindName, "emptyObject"),
          as: object(),
        }
      );
      axis = push(bindName, "keysChecked");
    }
    if (schema.has("values")) {
      const continuation = selfInliningBuiltin(
        push(bindName, "continuation"),
        {
          params: ["value", "keys", "index", "bindResult"],
        },
        function (_scopeId, paramNames, computed) {
          const [{ value, keys, index, bindResult }, earlyReturn] =
            demandParameterValues(
              ["value", "keys", "index", "bindResult"],
              paramNames,
              computed
            );
          if (earlyReturn) {
            return earlyReturn;
          }
          if (isThrown(bindResult.get("all"))) {
            return {
              value: badProperty(value.get(keys[index - 1]), keys[index - 1]),
            };
          } else {
            // TODO add to combined bindings.
          }
          if (index < keys.length) {
            return expansion(
              calling(literal(continuation), [
                literal(value),
                literal(keys),
                literal(index + 1),
                name(push(bindName, `$v${index + 1}.bindResult`)),
              ]),
              [
                {
                  find: push(bindName, `$v${index + 1}.bindResult`),
                  as: bind(
                    name(push(bindName, `$v${index + 1}`)),
                    literal(schema.get("values"))
                  ),
                },
                {
                  find: push(bindName, `$v${index + 1}`),
                  as: calling(name("at"), [
                    literal(value),
                    name(push(bindName, `$v${index + 1}`, "key")),
                  ]),
                },
                {
                  find: push(bindName, `$v${index + 1}`, "key"),
                  as: calling(name("at"), [literal(keys), literal(index + 1)]),
                },
              ]
            );
          } else {
            return { value };
          }
        }
      );
      const bindings = object(
        ...namesToBind(schema.get("values")).map((bindingName) => [
          bindingName,
          name(push(bindName, "emptyObject")),
        ])
      );
      steps.push(
        {
          find: push(bindName, "valuesChecked"),
          as: if_(
            name(push(bindName, "valuesEmpty")),
            name(push(bindName, "valuesEmptyResult")),
            name(push(bindName, "valuesCheckedNotEmpty"))
          ),
        },
        {
          find: push(bindName, "valuesEmptyResult"),
          as: object(spread(name(push(bindName, "valuesEmptyBindings"))), [
            "all",
            name(axis),
          ]),
        },
        {
          find: push(bindName, "valuesEmptyBindings"),
          as: bindings,
        },
        {
          find: push(bindName, "valuesEmpty"),
          as: calling(name("equals"), [
            name(push(bindName, "valuesLength")),
            literal(0),
          ]),
        },
        {
          find: push(bindName, "valuesLength"),
          as: calling(name("length"), [name(push(bindName, "keys"))]),
        },
        {
          find: push(bindName, "valuesCheckedNotEmpty"),
          as: calling(literal(continuation), [
            name(axis),
            name(push(bindName, "keys")),
            literal(1),
            name(push(bindName, `$v1.bindResult`)),
          ]),
        },
        {
          find: push(bindName, `$v1.bindResult`),
          as: bind(name(push(bindName, `$v1`)), literal(schema.get("values"))),
        },
        {
          find: push(bindName, `$v1`),
          as: calling(name("at"), [
            name(axisBeforeKeysAndValues),
            name(push(bindName, "$v1", "key")),
          ]),
        },
        {
          find: push(bindName, "$v1", "key"),
          as: calling(name("at"), [name(push(bindName, "keys")), literal(1)]),
        },
        {
          find: push(bindName, "keys"),
          as: calling(name("keys"), [name(axisBeforeKeysAndValues)]),
        },
        {
          find: push(bindName, "emptyObject"),
          as: object(),
        }
      );
      axis = push(bindName, "valuesChecked");
    }
    steps.push({
      find: push(bindName, "wrapped"),
      as: object(["all", name(axis)]),
    });
    axis = push(bindName, "wrapped");
  }

  return expansion(name(axis), steps);
}

function bindArraySchema(stepName, value, schema) {
  const bindName = push(stepName, "$bind");
  const typeCheckStep = {
    find: push(bindName, "typeChecked"),
    as: checkType(value, literal("array")),
  };
  const elementCheckSteps = schema.map((element, i) =>
    isObject(element) && element.has("#rest")
      ? {
          find: push(bindName, "check", "#rest"),
          as: bindArrayRest(
            name(push(bindName, "typeChecked")),
            literal(schema)
          ),
        }
      : {
          find: push(bindName, "check", `$${i + 1}`),
          as: bindArrayElement(
            name(push(bindName, "typeChecked")),
            literal(i + 1),
            literal(schema)
          ),
        }
  );
  const allSteps = [typeCheckStep, ...elementCheckSteps];

  const continuation = selfInliningBuiltin(
    push(bindName, "continuation"),
    {
      params: ["value", { rest: "bindResults" }],
    },
    function (_scopeId, paramNames, computed) {
      const [{ value, bindResults }, earlyReturn] = demandParameterValues(
        ["value", "bindResults"],
        paramNames,
        computed
      );
      if (earlyReturn) {
        return earlyReturn;
      }
      const results = [];
      for (let i = 0; i < bindResults.length; i++) {
        if (isThrown(bindResults[i])) {
          return { value: bindResults[i] };
        } else if (isThrown(bindResults[i].get("all"))) {
          if (
            bindResults[i].get("all").get("#thrown") === "wrongType" &&
            !equals(bindResults[i].get("all").get("value"), value)
          ) {
            return {
              value: withReason(
                badElement(value, i + 1),
                bindResults[i].get("all")
              ),
            };
          }
          return { value: bindResults[i].get("all") };
        } else if (
          i === bindResults.length - 1 &&
          isObject(schema.at(-1)) &&
          schema.at(-1).has("#rest")
        ) {
          results.push(...bindResults[i].get("all"));
        } else if (i < value.length) {
          results.push(bindResults[i].get("all"));
        }
      }
      return { value: kpoMerge(...bindResults, kpobject(["all", results])) };
    }
  );
  return expansion(
    calling(literal(continuation), [
      value,
      ...elementCheckSteps.map((step) => name(step.find)),
    ]),
    allSteps
  );
}

function tryEvalBindElementOf(node, computed) {
  const [{ array, index, schema }, earlyReturn] = demandValues_NEW(
    {
      array: node.bindElementOf,
      index: node.index,
      schema: node.to,
    },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  if (index <= array.length) {
    const element = isNode(array[index - 1])
      ? array[index - 1]
      : literal(array[index - 1]);
    if (isObject(schema[index - 1]) && schema[index - 1].has("#default")) {
      return {
        expansion: {
          steps: [],
          result: bind(element, literal(schema[index - 1].get("for"))),
        },
      };
    } else {
      return {
        expansion: {
          steps: [],
          result: bind(element, literal(schema[index - 1])),
        },
      };
    }
  } else if (isObject(schema[index - 1]) && schema[index - 1].has("#default")) {
    return {
      expansion: {
        steps: [],
        result: bind(
          literal(schema[index - 1].get("#default")),
          literal(schema[index - 1].get("for"))
        ),
      },
    };
  } else {
    return { value: missingElement(array, index, schema) };
  }
}

function tryEvalBindArrayRest(node, computed) {
  const [{ array, schema }, earlyReturn] = demandValues_NEW(
    {
      array: node.bindArrayRest,
      schema: node.to,
    },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  return {
    expansion: {
      steps: [],
      result: bind(
        literal(array.slice(schema.length - 1)),
        literal(arrayOf(schema.at(-1).get("#rest")))
      ),
    },
  };
}

function bindObjectSchema(stepName, value, schema) {
  const bindName = push(stepName, "$bind");
  const typeCheckStep = {
    find: push(bindName, "typeChecked"),
    as: checkType(value, literal("object")),
  };
  const elementCheckSteps = kpoMap(schema, ([key, property]) => [
    key,
    isObject(property) && property.has("#rest")
      ? {
          find: push(bindName, "check", "#rest"),
          as: bindObjectRest(
            name(push(bindName, "typeChecked")),
            literal(schema)
          ),
        }
      : {
          find: push(bindName, "check", key),
          as: bindObjectEntry(
            name(push(bindName, "typeChecked")),
            literal(key),
            literal(schema)
          ),
        },
  ]);
  const allSteps = [typeCheckStep, ...kpoValues(elementCheckSteps)];

  const continuation = selfInliningBuiltin(
    push(bindName, "continuation"),
    {
      params: ["value"],
      namedParams: [{ rest: "bindResults" }],
    },
    function (_scopeId, paramNames, computed) {
      const [{ value, bindResults }, earlyReturn] = demandParameterValues(
        ["value", "bindResults"],
        paramNames,
        computed
      );
      if (earlyReturn) {
        return earlyReturn;
      }
      const results = kpobject();
      const bindings = kpobject();
      for (const [key, bindResult] of kpoEntries(bindResults)) {
        if (isThrown(bindResult.get("all"))) {
          if (
            bindResult.get("all").get("#thrown") === "wrongType" &&
            !equals(bindResult.get("all").get("value"), value)
          ) {
            return {
              value: withReason(badProperty(value, key), bindResult.get("all")),
            };
          }
          return { value: bindResult.get("all") };
        } else {
          bindings.set(key, bindResult.get("all"));
        }
      }
      for (const [key, propertyValue] of kpoEntries(value)) {
        if (bindings.has(key)) {
          results.set(key, bindResults.get(key).get("all"));
        } else {
          results.set(key, propertyValue);
        }
      }
      return { value: kpobject(["all", results], ...bindings) };
    }
  );
  return expansion(
    calling(
      literal(continuation),
      [name(push(bindName, "typeChecked"))],
      kpoEntries(elementCheckSteps).map(([key, value]) => [
        key,
        name(value.find),
      ])
    ),
    allSteps
  );
}

function tryEvalBindEntryOf(node, computed) {
  const [{ object, key, schema }, earlyReturn] = demandValues_NEW(
    {
      object: node.bindEntryOf,
      key: node.key,
      schema: node.to,
    },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  if (object.has(key)) {
    if (isObject(schema.get(key)) && schema.get(key).has("#default")) {
      return {
        expansion: {
          steps: [],
          result: bind(
            literal(object.get(key)),
            literal(schema.get(key).get("for"))
          ),
        },
      };
    } else {
      return {
        expansion: {
          steps: [],
          result: bind(literal(object.get(key)), literal(schema.get(key))),
        },
      };
    }
  } else if (isObject(schema.get(key)) && schema.get(key).has("#default")) {
    return {
      expansion: {
        steps: [],
        result: bind(
          literal(schema.get(key).get("#default")),
          literal(schema.get(key).get("for"))
        ),
      },
    };
  } else {
    return { value: kpobject(["all", missingProperty(object, key)]) };
  }
}

function tryEvalBindObjectRest(node, computed) {
  const [{ object, schema }, earlyReturn] = demandValues_NEW(
    {
      object: node.bindObjectRest,
      schema: node.to,
    },
    computed
  );
  if (earlyReturn) {
    return earlyReturn;
  }
  const keysNotInSchema = kpoKeys(object).filter((key) => !schema.has(key));
  return {
    expansion: {
      steps: [],
      result: bind(
        literal(
          kpobject(...keysNotInSchema.map((key) => [key, object.get(key)]))
        ),
        literal(
          objectOf(
            kpobject([
              "values",
              kpoValues(schema)
                .find((property) => isObject(property) && property.has("#rest"))
                .get("#rest"),
            ])
          )
        )
      ),
    },
  };
}

function bindLiteralListSchema(value, schema, computed) {
  const retrievedValue = demandValue(value, computed);
  if (retrievedValue === undefined) {
    return { stepsNeeded: [value.name] };
  }
  for (const option of schema.get("#oneOf")) {
    if (equals(retrievedValue, option)) {
      return { value: kpobject(["all", retrievedValue]) };
    }
  }
  return {
    value: kpobject([
      "all",
      badValue(retrievedValue, ["options", schema.get("#oneOf")]),
    ]),
  };
}

function bindUnionSchema(stepName, value, schema) {
  const bindName = push(stepName, "$bind");
  const options = schema.get("#either");
  const optionSteps = options.map((option, i) => ({
    find: push(bindName, `$alt${i + 1}`),
    as: bind(value, literal(option)),
  }));
  const continuation = selfInliningBuiltin(
    push(bindName, "continuation"),
    {
      params: ["value", { rest: "bindResults" }],
    },
    function (_scopeId, paramNames, computed) {
      const [{ value, bindResults }, earlyReturn] = demandParameterValues(
        ["value", "bindResults"],
        paramNames,
        computed
      );
      if (earlyReturn) {
        return earlyReturn;
      }

      const errors = [];
      for (const bindResult of bindResults) {
        if (isThrown(bindResult.get("all"))) {
          errors.push(bindResult.get("all"));
        } else {
          return { value: bindResult };
        }
      }
      return { value: kpobject(["all", combineUnionErrors(value, errors)]) };
    }
  );
  return expansion(
    calling(literal(continuation), [
      value,
      ...optionSteps.map((step) => name(step.find)),
    ]),
    optionSteps
  );
}

function bindExplicit(stepName, value, schema) {
  const bindName = push(stepName, "$bind");
  const checkStep = {
    find: push(bindName, "check"),
    as: bind(value, literal(schema.get("#bind"))),
  };
  const allStep = {
    find: push(bindName, "all"),
    as: calling(name("at"), [name(push(bindName, "check")), literal("all")]),
  };
  return {
    expansion: {
      steps: [checkStep, allStep],
      result: object(spread(name(push(bindName, "check"))), [
        literal(schema.get("as")),
        name(push(bindName, "all")),
      ]),
    },
  };
}

function namesToBind(schema) {
  if (isArray(schema)) {
    return mergeArrays(schema.map(namesToBind));
  } else if (isObject(schema)) {
    if (schema.has("#either")) {
      return mergeArrays(schema.get("#either").map(namesToBind));
    } else if (schema.has("#type")) {
      if (schema.has("elements")) {
        return namesToBind(schema.get("elements"));
      } else if (schema.has("values")) {
        return namesToBind(schema.get("values"));
      } else {
        return [];
      }
    } else if (schema.has("#bind")) {
      return [schema.get("as"), ...namesToBind(schema.get("#bind"))];
    } else if (schema.has("#default")) {
      return namesToBind(schema.get("for"));
    } else {
      return [
        ...kpoKeys(schema),
        ...mergeArrays(kpoValues(schema).map(namesToBind)),
      ];
    }
  } else {
    return [];
  }
}

function mergeArrays(arrays) {
  const result = [];
  for (const array of arrays) {
    for (const element of array) {
      if (!result.includes(element)) {
        result.push(element);
      }
    }
  }
  return result;
}

function combineUnionErrors(value, errors) {
  if (errors.every((err) => err.get("#thrown") === "wrongType")) {
    return wrongType(
      value,
      either(...errors.map((err) => err.get("expectedType")))
    );
  } else {
    return badValue(value, ["errors", errors]);
  }
}

function invalidSchema(schema) {
  return kpthrow("invalidSchema", ["schema", schema]);
}

export function wrongType(value, schema) {
  return kpthrow("wrongType", ["value", value], ["expectedType", schema]);
}

function badValue(value, ...details) {
  return kpthrow("badValue", ["value", value], ...details);
}

function missingElement(value, index, schema) {
  return kpthrow(
    "missingElement",
    ["value", value],
    ["index", index],
    ["schema", schema]
  );
}

function badElement(value, index) {
  return kpthrow("badElement", ["value", value], ["index", index]);
}

function missingProperty(value, key) {
  return kpthrow("missingProperty", ["value", value], ["key", key]);
}

function badKey(key, reason) {
  return kpthrow("badKey", ["key", key], ["reason", catch_(reason)]);
}

function badProperty(value, key) {
  return kpthrow("badProperty", ["value", value], ["key", key]);
}

function withReason(err, reason) {
  return kpoMerge(err, kpobject(["reason", catch_(reason)]));
}

function demandValues(nodes, computed) {
  const result = {};
  const stepsNeeded = [];
  for (const [name, node] of Object.entries(nodes)) {
    if ("literal" in node) {
      result[name] = node.literal;
    } else if (computed.has(node.name)) {
      result[name] = computed.get(node.name);
    } else {
      stepsNeeded.push(node.name);
    }
  }
  return [result, stepsNeeded];
}

function demandValues_NEW(nodes, computed) {
  const result = {};
  const stepsNeeded = [];
  for (const [name, node] of Object.entries(nodes)) {
    if ("literal" in node) {
      result[name] = node.literal;
    } else if (computed.has(node.name)) {
      result[name] = computed.get(node.name);
      if (isThrown(result[name])) {
        return [result, { value: result[name] }];
      }
    } else {
      stepsNeeded.push(node.name);
    }
  }
  if (stepsNeeded.length > 0) {
    return [result, { stepsNeeded }];
  } else {
    return [result, undefined];
  }
}

function demandValuesWithoutShortCircuiting(nodes, computed) {
  const result = {};
  const stepsNeeded = [];
  for (const [name, node] of Object.entries(nodes)) {
    if ("literal" in node) {
      result[name] = node.literal;
    } else if (computed.has(node.name)) {
      result[name] = computed.get(node.name);
    } else {
      stepsNeeded.push(node.name);
    }
  }
  if (stepsNeeded.length > 0) {
    return [result, { stepsNeeded }];
  } else {
    return [result, undefined];
  }
}

function demandValue(node, computed) {
  if ("literal" in node) {
    return node.literal;
  } else {
    return computed.get(node.name);
  }
}

function paramSpecToKpValue(paramSpec) {
  return kpobject(
    ["params", (paramSpec.params ?? []).map(paramToKpValue)],
    ["namedParams", (paramSpec.namedParams ?? []).map(paramToKpValue)]
  );
}

function paramToKpValue(param) {
  if (param instanceof Map) {
    return param;
  } else if (typeof param === "object") {
    return toKpobject(param);
  } else {
    return param;
  }
}

function captureContext(expression, names) {
  return { expression, context: names };
}

function argumentErrorGivenParamObjects(paramObjects, err) {
  return argumentError(
    err,
    paramObjects.params.map((param) => param.name)
  );
}

export function argumentError(err, argumentNames) {
  let updatedErr = err;
  if (updatedErr.get("#thrown") === "badElement") {
    updatedErr = rethrow(updatedErr.get("reason"));
  }
  if (updatedErr.get("#thrown") === "badElement") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(["#thrown", "badArgumentValue"])
    );
  } else if (updatedErr.get("#thrown") === "wrongType") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(["#thrown", "wrongArgumentType"])
    );
  } else if (updatedErr.get("#thrown") === "badValue") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(["#thrown", "badArgumentValue"])
    );
  } else if (updatedErr.get("#thrown") === "missingElement") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(
        ["#thrown", "missingArgument"],
        ["name", simpleName(argumentNames[updatedErr.get("index") - 1])]
      )
    );
  }
  return updatedErr;
}

function simpleName(name) {
  return name.split(".").at(-1);
}

export function paramsFromBuiltin(f) {
  return {
    params: f.params ?? [],
    namedParams: f.namedParams ?? [],
  };
}

export function normalizeAllParams(params) {
  return {
    params: (params.params ?? []).map(normalizeParam),
    namedParams: (params.namedParams ?? []).map(normalizeParam),
  };
}

export function normalizeParam(param) {
  if (typeof param === "string") {
    return { name: param };
  } else if (param instanceof Map) {
    return normalizeParam(toJsObject(param));
  } else if ("rest" in param) {
    return { rest: normalizeParam(param.rest) };
  } else {
    return param;
  }
}

function createParamSchema(paramObjects) {
  const paramSchema = paramObjects.params.map((param) => {
    if ("rest" in param) {
      return as(rest(param.rest.type ?? "any"), param.rest.name);
    } else {
      let schema = as(param.type ?? "any", param.name);
      if ("defaultValue" in param) {
        schema = default_(schema, captureContext(param.defaultValue));
      }
      return schema;
    }
  });
  const namedParamSchema = kpobject(
    ...paramObjects.namedParams.map((param) => {
      if ("rest" in param) {
        return [param.rest.name, rest(param.rest.type ?? "any")];
      } else {
        let valueSchema = param.type ?? "any";
        if ("defaultValue" in param) {
          valueSchema = default_(
            valueSchema,
            captureContext(param.defaultValue)
          );
        }
        return [param.name, valueSchema];
      }
    })
  );
  return [paramSchema, namedParamSchema];
}

export function catch_(expression) {
  if (isThrown(expression)) {
    return kpobject(
      ["#error", expression.get("#thrown")],
      ...kpoFilter(expression, ([name, _]) => name !== "#thrown")
    );
  } else {
    return expression;
  }
}

function deepCatch(expression) {
  if (isThrown(expression)) {
    return catch_(expression);
  } else if (isArray(expression)) {
    return expression.map(deepCatch);
  } else if (isObject(expression)) {
    return kpoMap(expression, ([key, value]) => [key, deepCatch(value)]);
  } else {
    return expression;
  }
}

export function rethrow(err) {
  return kpobject(
    ["#thrown", err.get("#error")],
    ...kpoFilter(err, ([name, _]) => name !== "#error")
  );
}

export function isNode(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !isArray(value) &&
    !isObject(value)
  );
}

function deepToKpObject(expression) {
  if (expression === null) {
    return expression;
  } else if (Array.isArray(expression)) {
    return expression.map(deepToKpObject);
  } else if (expression instanceof Map) {
    return expression;
  } else if (typeof expression === "object") {
    return kpoMap(toKpobject(expression), ([key, value]) => [
      key,
      deepToKpObject(value),
    ]);
  } else {
    return expression;
  }
}

export function deepToJsObject(expression) {
  if (expression === null) {
    return expression;
  } else if (Array.isArray(expression)) {
    return expression.map(deepToJsObject);
  } else if (expression instanceof Map) {
    return toJsObject(
      kpoMap(expression, ([key, value]) => [key, deepToJsObject(value)])
    );
  } else {
    return expression;
  }
}
