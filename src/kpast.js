export function literal(value) {
  return { type: "literal", value };
}

export function array(...elements) {
  return { type: "array", elements };
}

export function arrayPattern(...names) {
  return { type: "arrayPattern", names };
}

export function object(...entries) {
  return { type: "object", entries };
}

export function objectPattern(...entries) {
  return { type: "objectPattern", entries };
}

export function checked(name, schema) {
  return { type: "checked", name, schema };
}

export function optional(name, defaultValue) {
  if (name === undefined) {
    throw new Error("WTF?");
  }
  return { type: "optional", name, defaultValue };
}

export function spread(value) {
  return { type: "spread", value };
}

export function rest(name) {
  return { type: "rest", name };
}

export function name(name, moduleName) {
  const result = { type: "name", name };
  if (moduleName) {
    result.from = moduleName;
  }
  return result;
}

export function block(...args) {
  const defs = args.slice(0, -1);
  const result = args.at(-1);
  return { type: "block", defs, result };
}

export function function_(body, posParams = [], namedParams = []) {
  const result = { type: "function", body };
  if (posParams.length > 0) {
    result.posParams = posParams;
  }
  if (namedParams.length > 0) {
    result.namedParams = namedParams;
  }
  return result;
}

export function call(f, posArgs = [], namedArgs = []) {
  const result = { type: "call", callee: f };
  if (posArgs.length > 0) {
    result.posArgs = posArgs;
  }
  if (namedArgs.length > 0) {
    result.namedArgs = namedArgs;
  }
  return result;
}

export function index(collection, index) {
  return { type: "index", collection, index };
}

export function catch_(expression) {
  return { type: "catch", expression };
}

//#region Syntactic sugar

export function group(expression) {
  return { type: "group", expression };
}

export function rawFunction(params, body) {
  return { type: "rawFunction", params, body };
}

export function rawParamList(params) {
  return { type: "rawParamList", params };
}

export function paramList(posParams, namedParams) {
  return { type: "paramList", posParams, namedParams };
}

export function pipeline(start, ...steps) {
  return { type: "pipeline", start, steps };
}

export function rawArgList(args) {
  return { type: "rawArgList", args };
}

export function argList(posArgs, namedArgs) {
  return { type: "argList", posArgs, namedArgs };
}

export function args(args) {
  return { type: "args", args };
}

export function pipeArgs(callee, args) {
  return { type: "pipeArgs", callee, args };
}

export function pipeDot(index) {
  return { type: "pipeDot", index };
}

export function pipe(callee) {
  return { type: "pipe", callee };
}

export function at(index) {
  return { type: "at", index };
}

export function bang() {
  return { type: "bang" };
}

export function keyName(key) {
  return { type: "keyName", key };
}

export function entry(key, value) {
  return { type: "entry", key, value };
}

export function arraySpread(value) {
  return { type: "arraySpread", value };
}

export function objectSpread(value) {
  return { type: "objectSpread", value };
}

export function arrayRest(name) {
  return { type: "arrayRest", name };
}

export function objectRest(name) {
  return { type: "objectRest", name };
}

//#endregion

export class TreeTransformer {
  transformExpression(expression) {
    if (
      expression === null ||
      typeof expression !== "object" ||
      !("type" in expression)
    ) {
      return this.transformOtherExpression(expression);
    }
    switch (expression.type) {
      case "literal":
        return this.transformLiteral(expression);
      case "array":
        return this.transformArray(expression);
      case "object":
        return this.transformObject(expression);
      case "name":
        return this.transformName(expression);
      case "block":
        return this.transformBlock(expression);
      case "function":
        return this.transformFunction(expression);
      case "call":
        return this.transformCall(expression);
      case "index":
        return this.transformIndex(expression);
      case "catch":
        return this.transformCatch(expression);
      default:
        return this.transformOtherExpression(expression);
    }
  }

  transformLiteral(expression) {
    return expression;
  }

  transformArray(expression) {
    return array(
      ...expression.elements.map((element) =>
        this.transformArrayElement(element)
      )
    );
  }

  transformArrayElement(element) {
    if (element.type === "spread") {
      return this.transformSpreadArrayElement(element);
    } else {
      return this.transformOtherArrayElement(element);
    }
  }

  transformSpreadArrayElement(element) {
    return spread(this.transformExpression(element.value));
  }

  transformOtherArrayElement(element) {
    return this.transformExpression(element);
  }

  transformObject(expression) {
    return object(
      ...expression.entries.map((entry) => this.transformObjectElement(entry))
    );
  }

  transformObjectElement(element) {
    if (element.type === "spread") {
      return this.transformSpreadObjectElement(element);
    } else if (Array.isArray(element)) {
      return this.transformEntryObjectElement(element);
    } else {
      return this.transformOtherObjectElement(element);
    }
  }

  transformSpreadObjectElement(element) {
    return spread(this.transformExpression(element.value));
  }

  transformEntryObjectElement(element) {
    return [
      this.transformExpression(element[0]),
      this.transformExpression(element[1]),
    ];
  }

  transformOtherObjectElement(element) {
    return this.transformExpression(element);
  }

  transformName(expression) {
    return expression;
  }

  transformBlock(expression) {
    return block(
      ...expression.defs.map((def) => this.transformDef(def)),
      this.transformExpression(expression.result)
    );
  }

  transformDef(def) {
    const [name, value] = def;
    if (name === null) {
      return [null, this.transformExpression(value)];
    } else {
      return [this.transformNamePattern(name), this.transformExpression(value)];
    }
  }

  transformNamePattern(name) {
    if (typeof name === "string") {
      return this.transformStringPattern(name);
    }
    switch (name.type) {
      case "arrayPattern":
        return this.transformArrayPattern(name);
      case "objectPattern":
        return this.transformObjectPattern(name);
      case "checked":
        return this.transformChecked(name);
      case "optional":
        return this.transformOptional(name);
      default:
        return this.transformOtherNamePattern(name);
    }
  }

  transformStringPattern(name) {
    return name;
  }

  transformArrayPattern(pattern) {
    return arrayPattern(
      ...pattern.names.map((name) => this.transformArrayPatternElement(name))
    );
  }

  transformArrayPatternElement(element) {
    if (element.type === "rest") {
      return this.transformRestArrayPatternElement(element);
    } else {
      return this.transformOtherArrayPatternElement(element);
    }
  }

  transformRestArrayPatternElement(element) {
    return rest(this.transformNamePattern(element.name));
  }

  transformOtherArrayPatternElement(element) {
    return this.transformNamePattern(element);
  }

  transformObjectPattern(pattern) {
    return objectPattern(
      ...pattern.entries.map((entry) =>
        this.transformObjectPatternElement(entry)
      )
    );
  }

  transformObjectPatternElement(element) {
    if (element.type === "rest") {
      return this.transformRestObjectPatternElement(element);
    } else if (Array.isArray(element)) {
      return this.transformEntryObjectPatternElement(element);
    } else {
      return this.transformOtherObjectPatternElement(element);
    }
  }

  transformRestObjectPatternElement(element) {
    return rest(this.transformNamePattern(element.name));
  }

  transformEntryObjectPatternElement([key, pattern]) {
    return [this.transformExpression(key), this.transformNamePattern(pattern)];
  }

  transformOtherObjectPatternElement(element) {
    return element;
  }

  transformChecked(element) {
    return checked(this.transformNamePattern(element.name), element.schema);
  }

  transformOptional(element) {
    return optional(
      this.transformNamePattern(element.name),
      this.transformExpression(element.defaultValue)
    );
  }

  transformOtherNamePattern(element) {
    return element;
  }

  transformFunction(expression) {
    return function_(
      this.transformExpression(expression.body),
      (expression.posParams ?? []).map((param) =>
        this.transformArrayPatternElement(param)
      ),
      (expression.namedParams ?? []).map((param) =>
        this.transformObjectPatternElement(param)
      )
    );
  }

  transformCall(expression) {
    return call(
      this.transformExpression(expression.callee),
      (expression.posArgs ?? []).map((arg) => this.transformArrayElement(arg)),
      (expression.namedArgs ?? []).map((arg) =>
        this.transformObjectElement(arg)
      )
    );
  }

  transformIndex(expression) {
    return index(
      this.transformExpression(expression.collection),
      this.transformExpression(expression.index)
    );
  }

  transformCatch(expression) {
    return catch_(this.transformExpression(expression.expression));
  }

  transformOtherExpression(expression) {
    return expression;
  }
}
