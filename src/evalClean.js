import { as, bind, default_, recordLike, rest, tupleLike } from "./bind.js";
import { array, object } from "./kpast.js";
import kperror, { catch_, errorType, withErrorType } from "./kperror.js";
import kpobject, {
  kpoEntries,
  kpoMap,
  kpoMerge,
  toJsObject,
  toKpobject,
} from "./kpobject.js";
import { isBuiltin, isError, isGiven } from "./values.js";

// Evaluate an expression with *only* the specified names in scope,
// i.e. no loading of builtins.
export function evalClean(
  expression,
  names,
  // interpreter = new Interpreter()
  interpreter
) {
  interpreter.checkLimit();
  if (expression === null || typeof expression !== "object") {
    throw kperror("notAnExpression", ["value", expression]);
  } else if ("literal" in expression) {
    return evalThis.literal(expression, names);
  } else if ("array" in expression) {
    return evalThis.array(expression, names, interpreter);
  } else if ("object" in expression) {
    return evalThis.object(expression, names, interpreter);
  } else if ("name" in expression) {
    return evalThis.name(expression, names);
  } else if ("defining" in expression) {
    return evalThis.defining(expression, names, interpreter);
  } else if ("given" in expression) {
    return evalThis.given(expression, names, interpreter);
  } else if ("calling" in expression) {
    return evalThis.calling(expression, names, interpreter);
  } else if ("catching" in expression) {
    return evalThis.catching(expression, names, interpreter);
  } else if ("quote" in expression) {
    return evalThis.quote(expression, names, interpreter);
  } else if ("unquote" in expression) {
    return evalThis.unquote(expression, names, interpreter);
  } else {
    throw kperror("notAnExpression", ["value", expression]);
  }
}

export class Interpreter {
  timeLimitSeconds;
  startTime;

  constructor({ timeLimitSeconds = 0 } = {}) {
    this.timeLimitSeconds = timeLimitSeconds;
    this.startTime = Date.now();
  }

  checkLimit() {
    if (this.timeLimitSeconds > 0) {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - this.startTime) / 1000;
      if (elapsedTime > this.timeLimitSeconds) {
        throw kperror(
          "timeLimitExceeded",
          ["elapsedSeconds", elapsedTime],
          ["limitSeconds", this.timeLimitSeconds]
        );
      }
    }
  }
}

const evalThis = {
  literal(expression) {
    return expression.literal;
  },
  array(expression, names, interpreter) {
    const result = [];
    for (const element of expression.array) {
      if ("spread" in element) {
        const values = evalClean(element.spread, names, interpreter);
        if (isError(values)) {
          return values;
        }
        result.push(...values);
      } else {
        const value = evalClean(element, names, interpreter);
        if (isError(value)) {
          return value;
        }
        result.push(value);
      }
    }
    return result;
  },
  object(expression, names, interpreter) {
    const result = [];
    for (const element of expression.object) {
      if ("spread" in element) {
        const entries = evalClean(element.spread, names, interpreter);
        if (isError(entries)) {
          return entries;
        }
        result.push(...kpoEntries(entries));
      } else {
        const [key, value] = element;
        const keyResult =
          typeof key === "string" ? key : evalClean(key, names, interpreter);
        if (isError(keyResult)) {
          return keyResult;
        }
        const valueResult = evalClean(value, names, interpreter);
        if (isError(valueResult)) {
          return valueResult;
        }
        result.push([keyResult, valueResult]);
      }
    }
    return kpobject(...result);
  },
  name(expression, names) {
    if (!names.has(expression.name)) {
      throw kperror("nameNotDefined", ["name", expression.name]);
    }
    const binding = names.get(expression.name);
    if (binding === undefined) {
      throw kperror("nameUsedBeforeAssignment", ["name", expression.name]);
    } else {
      return binding;
    }
  },
  defining(expression, names, interpreter) {
    const scope = defineNames(expression.defining, names, interpreter);
    return evalClean(expression.result, scope, interpreter);
  },
  given(expression, names, interpreter) {
    return {
      given: evalDefaultValues(expression.given, names, interpreter),
      result: expression.result,
      closure: names,
    };
  },
  calling(expression, names, interpreter) {
    const f = evalClean(expression.calling, names, interpreter);
    const args = expression.args ?? [];
    const namedArgs = expression.namedArgs ?? kpobject();
    return callOnExpressions(f, args, namedArgs, names, interpreter);
  },
  catching(expression, names, interpreter) {
    return catch_(() => evalClean(expression.catching, names, interpreter));
  },
  quote(expression, names, interpreter) {
    return quote(expression.quote, names, interpreter);
  },
  unquote(expression, names, interpreter) {
    return evalClean(
      deepToJsObject(evalClean(expression.unquote, names, interpreter)),
      names,
      interpreter
    );
  },
};

export function defineNames(definitions, names, interpreter) {
  let declaredNames = [];
  for (const [pattern, _] of definitions) {
    declaredNames.push(...declareNames(pattern));
  }
  const evaluatedNames = kpoMap(declaredNames, (name) => [name, undefined]);
  const scope = new Scope(names, evaluatedNames);

  let assignedNames = kpobject();
  for (const definition of definitions) {
    assignedNames = kpoMerge(
      assignedNames,
      assignNames(definition, scope, interpreter)
    );
  }
  return scope;
}

function declareNames(pattern) {
  const namesToDeclare = [];
  if (typeof pattern === "string") {
    namesToDeclare.push(pattern);
  } else if ("arrayPattern" in pattern) {
    for (const element of pattern.arrayPattern) {
      namesToDeclare.push(...declareNames(element));
    }
  } else if ("objectPattern" in pattern) {
    for (const element of pattern.objectPattern) {
      namesToDeclare.push(...declareNames(element));
    }
  } else {
    throw kperror("invalidPattern", ["pattern", pattern]);
  }
  return namesToDeclare;
}

function assignNames(definition, names, interpreter) {
  const [pattern, expression] = definition;
  const schema = createPatternSchema(pattern);
  const value = evalClean(expression, names, interpreter);
  const bindings = bind(value, schema, interpreter);
  for (const [key, boundValue] of bindings) {
    names.set(key, boundValue);
  }
  return bindings;
}

function createPatternSchema(pattern) {
  if (typeof pattern === "string") {
    return as("any", pattern);
  } else if ("arrayPattern" in pattern) {
    return tupleLike(pattern.arrayPattern.map(createPatternSchema));
  } else if ("objectPattern" in pattern) {
    return recordLike(
      kpobject(...pattern.objectPattern.map((element) => [element, "any"]))
    );
  }
}

function evalDefaultValues(allParams, names, interpreter) {
  function evalForOneParam(param) {
    if (typeof param === "object" && "defaultValue" in param) {
      return {
        ...param,
        defaultValue: evalClean(param.defaultValue, names, interpreter),
      };
    } else {
      return param;
    }
  }

  const result = {};
  if ("params" in allParams) {
    result.params = allParams.params.map(evalForOneParam);
  }
  if ("namedParams" in allParams) {
    result.namedParams = allParams.namedParams.map(evalForOneParam);
  }
  return result;
}

function callOnExpressions(f, args, namedArgs, names, interpreter) {
  return callOnValues(
    f,
    evalExpressionArgs(args, names, interpreter),
    evalExpressionNamedArgs(namedArgs, names, interpreter),
    interpreter
  );
}

function evalExpressionArgs(args, names, interpreter) {
  const result = [];
  for (const element of args) {
    if ("spread" in element) {
      result.push(...evalClean(element.spread, names, interpreter));
    } else {
      result.push(evalClean(element, names, interpreter));
    }
  }
  return result;
}

function evalExpressionNamedArgs(namedArgs, names, interpreter) {
  const result = [];
  for (const element of namedArgs) {
    if ("spread" in element) {
      result.push(...kpoEntries(evalClean(element.spread, names, interpreter)));
    } else {
      const [name, value] = element;
      result.push([name, evalClean(value, names, interpreter)]);
    }
  }
  return kpobject(...result);
}

export function callOnValues(f, args, namedArgs, interpreter) {
  if (isGiven(f)) {
    return callGiven(f, args, namedArgs, interpreter);
  } else if (isBuiltin(f)) {
    return callBuiltin(f, args, namedArgs, interpreter);
  } else {
    throw kperror("notCallable", ["value", f]);
  }
}

function callGiven(f, args, namedArgs, interpreter) {
  const allParams = paramsFromGiven(f);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = catch_(() =>
    kpoMerge(
      bind(args, schema[0], interpreter),
      bind(namedArgs, schema[1], interpreter)
    )
  );
  if (isError(bindings)) {
    throw argumentErrorGivenParamObjects(paramObjects, bindings);
  }
  return evalClean(
    f.result,
    new Scope(f.closure ?? kpobject(), bindings),
    interpreter
  );
}

export function paramsFromGiven(f) {
  return {
    params: f.given.params ?? [],
    namedParams: f.given.namedParams ?? [],
  };
}

export class Scope {
  constructor(enclosingScope, localNames) {
    if (!enclosingScope) {
      throw new Error(`Invalid enclosing scope: ${enclosingScope}`);
    }
    if (!localNames) {
      throw new Error(`Invalid local names: ${localNames}`);
    }
    this.enclosingScope = enclosingScope;
    this.localNames = localNames;
  }

  *names() {
    for (const name of this.localNames.keys()) {
      yield name;
    }
    if (this.enclosingScope instanceof Scope) {
      for (const name of this.enclosingScope.names()) {
        yield name;
      }
    } else {
      for (const name of this.enclosingScope.keys()) {
        yield name;
      }
    }
  }

  has(key) {
    return this.localNames.has(key) || this.enclosingScope.has(key);
  }

  get(key) {
    if (this.localNames.has(key)) {
      return this.localNames.get(key);
    } else {
      return this.enclosingScope.get(key);
    }
  }

  set(key, value) {
    if (this.localNames.has(key)) {
      this.localNames.set(key, value);
    } else {
      this.enclosingScope.set(key, value);
    }
  }
}

function callBuiltin(f, args, namedArgs, interpreter) {
  const allParams = paramsFromBuiltin(f);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = catch_(() =>
    kpoMerge(
      bind(args, schema[0], interpreter),
      bind(namedArgs, schema[1], interpreter)
    )
  );
  if (isError(bindings)) {
    throw argumentErrorGivenParamObjects(paramObjects, bindings);
  }
  const argValues = paramObjects.params.map((param) =>
    bindings.get(param.name)
  );
  if (paramObjects.restParam) {
    argValues.push(...bindings.get(paramObjects.restParam.name));
  }
  const namedArgValues = kpobject(
    ...paramObjects.namedParams.map((param) => [
      param.name,
      bindings.get(param.name),
    ])
  );
  if (paramObjects.namedRestParam) {
    for (const [name, param] of bindings.get(
      paramObjects.namedRestParam.name
    )) {
      namedArgValues.set(name, param);
    }
  }
  return f(argValues, namedArgValues, interpreter);
}

function argumentErrorGivenParamObjects(paramObjects, err) {
  return argumentError(
    err,
    paramObjects.params.map((param) => param.name)
  );
}

export function argumentError(err, argumentNames) {
  let updatedErr = err;
  if (errorType(updatedErr) === "badElement") {
    updatedErr = updatedErr.details.get("reason");
  }
  if (errorType(updatedErr) === "badElement") {
    updatedErr = withErrorType(updatedErr, "badArgumentValue");
  } else if (errorType(updatedErr) === "wrongType") {
    updatedErr = withErrorType(updatedErr, "wrongArgumentType");
  } else if (errorType(updatedErr) === "badValue") {
    updatedErr = withErrorType(updatedErr, "badArgumentValue");
  } else if (errorType(updatedErr) === "missingElement") {
    updatedErr = withErrorType(updatedErr, "missingArgument", [
      "name",
      argumentNames[updatedErr.details.get("index") - 1],
    ]);
  }
  return updatedErr;
}

export function paramsFromBuiltin(f) {
  return {
    params: f.params ?? [],
    namedParams: f.namedParams ?? [],
  };
}

export function normalizeAllParams(params) {
  const normalizedParams = params.params.map(normalizeParam);
  const normalizedNamedParams = params.namedParams.map(normalizeParam);
  return {
    params: normalizedParams.filter((param) => !("rest" in param)),
    restParam: normalizedParams.find((param) => "rest" in param)?.rest,
    namedParams: normalizedNamedParams.filter((param) => !("rest" in param)),
    namedRestParam: normalizedNamedParams.find((param) => "rest" in param)
      ?.rest,
  };
}

export function normalizeParam(param) {
  const jsParam = deepToJsObject(param);
  if (typeof jsParam === "string") {
    return { name: jsParam };
  } else if ("rest" in jsParam) {
    return { rest: normalizeParam(jsParam.rest) };
  } else {
    return jsParam;
  }
}

function createParamSchema(paramObjects) {
  const paramShape = paramObjects.params.map((param) => {
    let schema = as(param.type ?? "any", param.name);
    if ("defaultValue" in param) {
      schema = default_(schema, param.defaultValue);
    }
    return schema;
  });
  if (paramObjects.restParam) {
    paramShape.push(
      as(
        rest(paramObjects.restParam.type ?? "any"),
        paramObjects.restParam.name
      )
    );
  }
  const paramSchema = tupleLike(paramShape);
  const namedParamShape = kpobject(
    ...paramObjects.namedParams.map((param) => {
      let valueSchema = param.type ?? "any";
      if ("defaultValue" in param) {
        valueSchema = default_(valueSchema, param.defaultValue);
      }
      return [param.name, valueSchema];
    })
  );
  if (paramObjects.namedRestParam) {
    namedParamShape.set(
      paramObjects.namedRestParam.name,
      rest(paramObjects.namedRestParam.type ?? "any")
    );
  }
  const namedParamSchema = recordLike(namedParamShape);
  return [paramSchema, namedParamSchema];
}

function quote(expression, names, interpreter) {
  if (typeof expression !== "object") {
    return expression;
  } else if ("unquote" in expression) {
    return deepToKpObject(evalClean(expression.unquote, names, interpreter));
  } else if ("array" in expression) {
    return deepToKpObject(
      array(
        ...expression.array.map((element) => quote(element, names, interpreter))
      )
    );
  } else if ("object" in expression) {
    return deepToKpObject(
      object(
        ...expression.object.map(([key, value]) => [
          quote(key, names, interpreter),
          quote(value, names, interpreter),
        ])
      )
    );
  } else {
    return deepToKpObject(expression);
  }
}

export function deepToKpObject(expression) {
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
