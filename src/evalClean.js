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
export function evalClean(expression, names) {
  if (expression === null || typeof expression !== "object") {
    throw kperror("notAnExpression", ["value", expression]);
  } else if ("type" in expression) {
    return evalThis[expression.type](expression, names);
  } else if ("literal" in expression) {
    return evalThis.literal(expression, names);
  } else if ("array" in expression) {
    return evalThis.array(expression, names);
  } else if ("object" in expression) {
    return evalThis.object(expression, names);
  } else if ("name" in expression) {
    return evalThis.name(expression, names);
  } else if ("defining" in expression) {
    return evalThis.defining(expression, names);
  } else if ("given" in expression) {
    return evalThis.given(expression, names);
  } else if ("calling" in expression) {
    return evalThis.calling(expression, names);
  } else if ("catching" in expression) {
    return evalThis.catching(expression, names);
  } else if ("quote" in expression) {
    return evalThis.quote(expression, names);
  } else if ("unquote" in expression) {
    return evalThis.unquote(expression, names);
  } else {
    throw kperror("notAnExpression", ["value", expression]);
  }
}

const evalThis = {
  literal(expression) {
    return expression.literal;
  },
  array(expression, names) {
    const result = [];
    for (const element of expression.array) {
      if ("spread" in element) {
        const values = evalClean(element.spread, names);
        if (isError(values)) {
          return values;
        }
        result.push(...values);
      } else {
        const value = evalClean(element, names);
        if (isError(value)) {
          return value;
        }
        result.push(value);
      }
    }
    return result;
  },
  object(expression, names) {
    const result = [];
    for (const element of expression.object) {
      if ("spread" in element) {
        const entries = evalClean(element.spread, names);
        if (isError(entries)) {
          return entries;
        }
        result.push(...kpoEntries(entries));
      } else {
        const [key, value] = element;
        const keyResult = typeof key === "string" ? key : evalClean(key, names);
        if (isError(keyResult)) {
          return keyResult;
        }
        const valueResult = evalClean(value, names);
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
  defining(expression, names) {
    const scope = defineNames(expression.defining, names);
    return evalClean(expression.result, scope);
  },
  given(expression, names) {
    return {
      given: evalDefaultValues(expression.given, names),
      result: expression.result,
      closure: names,
    };
  },
  calling(expression, names) {
    const f = evalClean(expression.calling, names);
    const args = expression.args ?? [];
    const namedArgs = expression.namedArgs ?? kpobject();
    return callOnExpressions(f, args, namedArgs, names);
  },
  catching(expression, names) {
    return catch_(() => evalClean(expression.catching, names));
  },
  quote(expression, names) {
    return quote(expression.quote, names);
  },
  unquote(expression, names) {
    return evalClean(
      deepToJsObject(evalClean(expression.unquote, names)),
      names
    );
  },
};

export function defineNames(definitions, names) {
  let declaredNames = [];
  for (const [pattern, _] of definitions) {
    declaredNames.push(...declareNames(pattern));
  }
  const evaluatedNames = kpoMap(declaredNames, (name) => [name, undefined]);
  const scope = new Scope(names, evaluatedNames);

  let assignedNames = kpobject();
  for (const definition of definitions) {
    assignedNames = kpoMerge(assignedNames, assignNames(definition, scope));
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

function assignNames(definition, names) {
  const [pattern, expression] = definition;
  const schema = createPatternSchema(pattern);
  const value = evalClean(expression, names);
  const bindings = bind(value, schema);
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

function evalDefaultValues(allParams, names) {
  function evalForOneParam(param) {
    if (typeof param === "object" && "defaultValue" in param) {
      return {
        ...param,
        defaultValue: evalClean(param.defaultValue, names),
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

function callOnExpressions(f, args, namedArgs, names) {
  return callOnValues(
    f,
    evalExpressionArgs(args, names),
    evalExpressionNamedArgs(namedArgs, names)
  );
}

function evalExpressionArgs(args, names) {
  const result = [];
  for (const element of args) {
    if ("spread" in element) {
      result.push(...evalClean(element.spread, names));
    } else {
      result.push(evalClean(element, names));
    }
  }
  return result;
}

function evalExpressionNamedArgs(namedArgs, names) {
  const result = [];
  for (const element of namedArgs) {
    if ("spread" in element) {
      result.push(...kpoEntries(evalClean(element.spread, names)));
    } else {
      const [name, value] = element;
      result.push([name, evalClean(value, names)]);
    }
  }
  return kpobject(...result);
}

export function callOnValues(f, args, namedArgs) {
  if (isGiven(f)) {
    return callGiven(f, args, namedArgs);
  } else if (isBuiltin(f)) {
    return callBuiltin(f, args, namedArgs);
  } else {
    throw kperror("notCallable", ["value", f]);
  }
}

function callGiven(f, args, namedArgs) {
  const allParams = paramsFromGiven(f);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = catch_(() =>
    kpoMerge(bind(args, schema[0]), bind(namedArgs, schema[1]))
  );
  if (isError(bindings)) {
    throw argumentErrorGivenParamObjects(paramObjects, bindings);
  }
  return evalClean(f.result, new Scope(f.closure ?? kpobject(), bindings));
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

function callBuiltin(f, args, namedArgs) {
  const allParams = paramsFromBuiltin(f);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = catch_(() =>
    kpoMerge(bind(args, schema[0]), bind(namedArgs, schema[1]))
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
  return f(argValues, namedArgValues);
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

function quote(expression, names) {
  if (typeof expression !== "object") {
    return expression;
  } else if ("unquote" in expression) {
    return deepToKpObject(evalClean(expression.unquote, names));
  } else if ("array" in expression) {
    return deepToKpObject(
      array(...expression.array.map((element) => quote(element, names)))
    );
  } else if ("object" in expression) {
    return deepToKpObject(
      object(
        ...expression.object.map(([key, value]) => [
          quote(key, names),
          quote(value, names),
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
