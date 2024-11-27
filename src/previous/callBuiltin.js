import { as, bind, default_, recordLike, rest, tupleLike } from "./bind.js";
import { errorType, kpcatch, withErrorType } from "./kperror.js";
import kpobject, { kpoMerge } from "./kpobject.js";
import { isError } from "./values.js";

export default function callBuiltin(f, args, namedArgs, kpcallback) {
  const allParams = paramsFromBuiltin(f);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = kpcatch(() =>
    kpoMerge(
      bind(args, schema[0], kpcallback),
      bind(namedArgs, schema[1], kpcallback)
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
  return f(argValues, namedArgValues, kpcallback);
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

export function argumentPatternError(err, argumentNames) {
  if (errorType(err) === "badElement") {
    return argumentError(err.details.get("reason"), argumentNames);
  } else {
    return argumentError(err, argumentNames);
  }
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
  if (typeof param === "string") {
    return { name: param };
  } else if ("rest" in param) {
    return { rest: normalizeParam(param.rest) };
  } else {
    return param;
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
