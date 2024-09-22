import {
  arrayOf,
  as,
  default_,
  either,
  is,
  objectOf,
  oneOf,
  optional,
  rest,
} from "./bind.js";
import { push } from "./decompose.js";
import {
  and,
  array,
  at,
  bind,
  calling,
  ifThrown,
  if_,
  literal,
  name,
  or,
  passThrown,
  rest as restNode,
  spread,
  throwing,
} from "./kpast.js";
import kpthrow from "./kperror.js";
import { expansion, tryFindAll } from "./kpeval.js";
import kpobject, { kpoEntries } from "./kpobject.js";

const rawBuiltins = [
  builtin(
    "plus",
    { params: [{ rest: { name: "rest", type: "number" } }] },
    function (args) {
      return args.reduce((acc, value) => acc + value, 0);
    }
  ),
  builtin(
    "minus",
    {
      params: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
    },
    function ([a, b]) {
      return a - b;
    }
  ),
  builtin(
    "negative",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return -x;
    }
  ),
  builtin(
    "increment",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return x + 1;
    }
  ),
  builtin(
    "decrement",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return x - 1;
    }
  ),
  builtin(
    "times",
    { params: [{ rest: { name: "rest", type: "number" } }] },
    function (args) {
      return args.reduce((acc, value) => acc * value, 1);
    }
  ),
  builtin(
    "dividedBy",
    {
      params: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
    },
    function ([a, b]) {
      return a / b;
    }
  ),
  builtin(
    "oneOver",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return 1 / x;
    }
  ),
  builtin(
    "divideWithRemainder",
    {
      params: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
    },
    function ([a, b]) {
      return kpobject(
        ["quotient", Math.floor(a / b)],
        ["remainder", ((a % b) + b) % b]
      );
    }
  ),
  builtin(
    "join",
    {
      params: [{ name: "strings", type: arrayOf("string") }],
      namedParams: [
        {
          name: "with",
          type: "string",
          defaultValue: literal(""),
        },
      ],
    },
    function ([strings], namedArgs) {
      return strings.join(namedArgs.get("with"));
    }
  ),
  builtin(
    "toCodePoints",
    {
      params: [{ name: "string", type: "string" }],
    },
    function ([string]) {
      return [...string].map((char) => char.codePointAt(0));
    }
  ),
  builtin(
    "fromCodePoints",
    {
      params: [{ name: "codePoints", type: arrayOf("number") }],
    },
    function ([codePoints]) {
      return String.fromCodePoint(...codePoints);
    }
  ),
  builtin("equals", { params: ["a", "b"] }, function ([a, b]) {
    return equals(a, b);
  }),
  builtin(
    "isLessThan",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      if (typeOf(b) !== typeOf(a)) {
        return kpthrow(
          "wrongArgumentType",
          ["value", b],
          ["expectedType", typeOf(a)]
        );
      }
      const compareResult = compare(a, b);
      if (isThrown(compareResult)) {
        return compareResult;
      }
      return compareResult < 0;
    }
  ),
  builtin(
    "isAtMost",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      if (typeOf(b) !== typeOf(a)) {
        return kpthrow(
          "wrongArgumentType",
          ["value", b],
          ["expectedType", typeOf(a)]
        );
      }
      const compareResult = compare(a, b);
      if (isThrown(compareResult)) {
        return compareResult;
      }
      return compareResult <= 0;
    }
  ),
  builtin(
    "isMoreThan",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      if (typeOf(b) !== typeOf(a)) {
        return kpthrow(
          "wrongArgumentType",
          ["value", b],
          ["expectedType", typeOf(a)]
        );
      }
      const compareResult = compare(a, b);
      if (isThrown(compareResult)) {
        return compareResult;
      }
      return compareResult > 0;
    }
  ),
  builtin(
    "isAtLeast",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      if (typeOf(b) !== typeOf(a)) {
        return kpthrow(
          "wrongArgumentType",
          ["value", b],
          ["expectedType", typeOf(a)]
        );
      }
      const compareResult = compare(a, b);
      if (isThrown(compareResult)) {
        return compareResult;
      }
      return compareResult >= 0;
    }
  ),
  selfInliningBuiltin(
    "and",
    { params: [{ rest: { name: "rest", type: "boolean" } }] },
    function (scopeId, paramNames, computed) {
      const [{ rest }, earlyReturn] = demandParameterValues(
        ["rest"],
        paramNames,
        computed
      );
      if (earlyReturn) {
        return earlyReturn;
      }
      if (rest.length === 0) {
        return { value: true };
      }
      let axis = rest[0];
      const steps = [];
      for (let i = 1; i < rest.length; i++) {
        steps.push({ find: push(scopeId, "$and", `$${i}`), as: axis });
        axis = and(axis, rest[i]);
      }
      return expansion(axis, steps);
    }
  ),
  selfInliningBuiltin(
    "or",
    { params: [{ rest: { name: "rest", type: "boolean" } }] },
    function (scopeId, paramNames, computed) {
      const [{ rest }, earlyReturn] = demandParameterValues(
        ["rest"],
        paramNames,
        computed
      );
      if (earlyReturn) {
        return earlyReturn;
      }
      if (rest.length === 0) {
        return { value: true };
      }
      let axis = rest[0];
      const steps = [];
      for (let i = 1; i < rest.length; i++) {
        steps.push({ find: push(scopeId, "$or", `$${i}`), as: axis });
        axis = or(axis, rest[i]);
      }
      return expansion(axis, steps);
    }
  ),
  builtin("not", { params: [{ name: "x", type: "boolean" }] }, function ([x]) {
    return !x;
  }),
  builtin("typeOf", { params: ["value"] }, function ([value]) {
    return typeOf(value);
  }),
  builtin("isNull", { params: ["value"] }, function ([value]) {
    return value === null;
  }),
  builtin("isBoolean", { params: ["value"] }, function ([value]) {
    return isBoolean(value);
  }),
  builtin("isNumber", { params: ["value"] }, function ([value]) {
    return isNumber(value);
  }),
  builtin(
    "toNumber",
    { params: [{ name: "value", type: either("string", "number") }] },
    function ([value]) {
      if (isNumber(value)) {
        return value;
      }
      if (!/^-?(0|[1-9](\d*))(.\d+)?([Ee][+-]?\d+)?$/.test(value)) {
        return kpthrow("notNumeric", ["value", value]);
      }
      return parseFloat(value);
    }
  ),
  builtin("isString", { params: ["value"] }, function ([value]) {
    return isString(value);
  }),
  builtin("toString", { params: ["value"] }, function ([value]) {
    return toString(value);
  }),
  builtin("isArray", { params: ["value"] }, function ([value]) {
    return isArray(value);
  }),
  builtin("isRecord", { params: ["value"] }, function ([value]) {
    return isRecord(value);
  }),
  builtin("isBuiltin", { params: ["value"] }, function ([value]) {
    return isBuiltin(value);
  }),
  builtin("isGiven", { params: ["value"] }, function ([value]) {
    return isGiven(value);
  }),
  builtin("isError", { params: ["value"] }, function ([value]) {
    return isError(value);
  }),
  builtin("isObject", { params: ["value"] }, function ([value]) {
    return isObject(value);
  }),
  builtin("isFunction", { params: ["value"] }, function ([value]) {
    return isFunction(value);
  }),
  builtin("toFunction", { params: ["value"] }, function ([value]) {
    return toFunction(value);
  }),
  builtin("isSequence", { params: ["value"] }, function ([value]) {
    return isSequence(value);
  }),
  selfInliningBuiltin(
    "if",
    {
      params: [{ name: "condition", type: "boolean" }],
      namedParams: ["then", "else"],
    },
    function (_scopeId, paramNames) {
      return {
        expansion: {
          steps: [],
          result: if_(
            name(paramNames.get("condition")),
            name(paramNames.get("then")),
            name(paramNames.get("else"))
          ),
        },
      };
    }
  ),
  // TODO Remove this abomination once iteration mechanisms based on streams are implemented
  selfInliningBuiltin(
    "repeat",
    {
      params: ["start", { name: "step", type: "function" }],
    },
    function (scopeId, paramNames, computed) {
      const functionName = "repeat";
      const stepsNeeded = [];
      let start, step;
      if (computed.has(paramNames.get("start"))) {
        start = computed.get(paramNames.get("start"));
      } else {
        stepsNeeded.push(paramNames.get("start"));
      }
      if (computed.has(paramNames.get("step"))) {
        step = computed.get(paramNames.get("step"));
      } else {
        stepsNeeded.push(paramNames.get("step"));
      }
      if (stepsNeeded.length > 0) {
        return { stepsNeeded };
      }
      const stepCall = calling(literal(step), [literal(start)]);
      const continuation = selfInliningBuiltin(
        "repeat.continuation",
        {
          params: ["stepResult"],
        },
        function (scopeId, paramNames, computed) {
          if (!computed.has(paramNames.get("stepResult"))) {
            return {
              stepsNeeded: [paramNames.get("stepResult")],
            };
          }
          const stepResult = computed.get(paramNames.get("stepResult"));
          const whileCondition = stepResult.has("while")
            ? stepResult.get("while")
            : true;
          if (!isBoolean(whileCondition)) {
            if (isThrown(whileCondition)) {
              return { value: whileCondition };
            }
            return {
              value: kpthrow(
                "wrongElementType",
                ["function", functionName],
                ["object", stepResult],
                ["key", "while"],
                ["value", whileCondition],
                ["expectedType", "boolean"]
              ),
            };
          }
          if (!whileCondition) {
            return { value: start };
          }
          const continueIf = stepResult.has("continueIf")
            ? stepResult.get("continueIf")
            : true;
          if (!isBoolean(continueIf)) {
            if (isThrown(continueIf)) {
              return { value: continueIf };
            }
            return {
              value: kpthrow(
                "wrongElementType",
                ["function", functionName],
                ["object", stepResult],
                ["key", "continueIf"],
                ["value", continueIf],
                ["expectedType", "boolean"]
              ),
            };
          }
          if (!stepResult.has("next")) {
            return {
              value: kpthrow(
                "requiredKeyMissing",
                ["function", functionName],
                ["object", stepResult],
                ["key", "next"]
              ),
            };
          }
          const next = stepResult.get("next");
          if (isThrown(next)) {
            return {
              value: kpthrow(
                "errorInIteration",
                ["function", functionName],
                ["currentValue", current],
                ["error", next]
              ),
            };
          }
          if (!continueIf) {
            return { value: next };
          }
          return {
            expansion: {
              steps: [],
              result: calling(name(functionName), [
                literal(next),
                literal(step),
              ]),
            },
          };
        }
      );
      return {
        expansion: {
          steps: [{ find: push(scopeId, "stepResult"), as: stepCall }],
          result: calling(literal(continuation), [
            name(push(scopeId, "stepResult")),
          ]),
        },
      };
    }
  ),
  // builtin(
  //   "at",
  //   {
  //     params: [
  //       { name: "collection", type: either("sequence", "object") },
  //       "index",
  //     ],
  //   },
  //   function ([collection, index]) {
  //     if (isString(collection) || isArray(collection)) {
  //       const check = validateArgument(index, "number");
  //       if (isThrown(check)) {
  //         return check;
  //       }
  //       if (index < 1 || index > collection.length) {
  //         return kpthrow(
  //           "indexOutOfBounds",
  //           ["function", "at"],
  //           ["value", collection],
  //           ["length", collection.length],
  //           ["index", index]
  //         );
  //       }
  //       return collection[index - 1];
  //     } else if (isObject(collection)) {
  //       const check = validateArgument(index, "string");
  //       if (isThrown(check)) {
  //         return check;
  //       }
  //       if (collection.has(index)) {
  //         return collection.get(index);
  //       } else {
  //         return kpthrow(
  //           "missingProperty",
  //           ["value", collection],
  //           ["key", index]
  //         );
  //       }
  //     }
  //   }
  // ),
  selfInliningBuiltin(
    "at",
    {
      params: [
        { name: "collection", type: either("sequence", "object") },
        "index",
      ],
    },
    function (_scopeId, paramNames) {
      return {
        expansion: {
          steps: [],
          result: at(
            name(paramNames.get("collection")),
            name(paramNames.get("index"))
          ),
        },
      };
    }
  ),
  builtin(
    "length",
    { params: [{ name: "sequence", type: "sequence" }] },
    function ([sequence]) {
      return sequence.length;
    }
  ),
  // TODO Remove this abomination once iteration mechanisms based on streams are implemented
  selfInliningBuiltin(
    "build",
    {
      params: [
        "start",
        { name: "step", type: "function" },
        { name: "acc", type: "array", defaultValue: array() },
      ],
    },
    function (scopeId, paramNames, computed) {
      const functionName = "build";
      const stepsNeeded = [];
      let start, step, acc;
      if (computed.has(paramNames.get("start"))) {
        start = computed.get(paramNames.get("start"));
      } else {
        stepsNeeded.push(paramNames.get("start"));
      }
      if (computed.has(paramNames.get("step"))) {
        step = computed.get(paramNames.get("step"));
      } else {
        stepsNeeded.push(paramNames.get("step"));
      }
      if (computed.has(paramNames.get("acc"))) {
        acc = computed.get(paramNames.get("acc"));
      } else {
        stepsNeeded.push(paramNames.get("acc"));
      }
      if (stepsNeeded.length > 0) {
        return { stepsNeeded };
      }
      const stepCall = calling(literal(step), [literal(start)]);
      const continuation = selfInliningBuiltin(
        "repeat.continuation",
        {
          params: ["stepResult"],
        },
        function (scopeId, paramNames, computed) {
          if (!computed.has(paramNames.get("stepResult"))) {
            return {
              stepsNeeded: [paramNames.get("stepResult")],
            };
          }
          const stepResult = computed.get(paramNames.get("stepResult"));
          const whileCondition = stepResult.has("while")
            ? stepResult.get("while")
            : true;
          if (!isBoolean(whileCondition)) {
            if (isThrown(whileCondition)) {
              return { value: whileCondition };
            }
            return {
              value: kpthrow(
                "wrongElementType",
                ["function", functionName],
                ["object", stepResult],
                ["key", "while"],
                ["value", whileCondition],
                ["expectedType", "boolean"]
              ),
            };
          }
          if (!whileCondition) {
            return { value: acc };
          }
          const continueIf = stepResult.has("continueIf")
            ? stepResult.get("continueIf")
            : true;
          if (!isBoolean(continueIf)) {
            if (isThrown(continueIf)) {
              return { value: continueIf };
            }
            return {
              value: kpthrow(
                "wrongElementType",
                ["function", functionName],
                ["object", stepResult],
                ["key", "continueIf"],
                ["value", continueIf],
                ["expectedType", "boolean"]
              ),
            };
          }
          if (!stepResult.has("next")) {
            return {
              value: kpthrow(
                "requiredKeyMissing",
                ["function", functionName],
                ["object", stepResult],
                ["key", "next"]
              ),
            };
          }
          const next = stepResult.get("next");
          if (isThrown(next)) {
            return {
              value: kpthrow(
                "errorInIteration",
                ["function", functionName],
                ["currentValue", start],
                ["error", next]
              ),
            };
          }
          const nextAcc = [
            ...acc,
            ...(stepResult.has("out") ? stepResult.get("out") : [next]),
          ];
          if (!continueIf) {
            return { value: nextAcc };
          }
          return {
            expansion: {
              steps: [],
              result: calling(name(functionName), [
                literal(next),
                literal(step),
                literal(nextAcc),
              ]),
            },
          };
        }
      );
      return {
        expansion: {
          steps: [{ find: push(scopeId, "stepResult"), as: stepCall }],
          result: calling(literal(continuation), [
            name(push(scopeId, "stepResult")),
          ]),
        },
      };
    }
  ),
  builtin(
    "keys",
    { params: [{ name: "object", type: "object" }] },
    function ([object]) {
      return [...object.keys()];
    }
  ),
  builtin(
    "toObject",
    { params: [{ name: "properties", type: arrayOf(["string", "any"]) }] },
    function ([properties]) {
      return kpobject(...properties);
    }
  ),
  selfInliningBuiltin(
    "bind",
    { params: ["value", "schema"] },
    function (_scopeId, paramNames) {
      return expansion(
        bind(name(paramNames.get("value")), name(paramNames.get("schema")))
      );
    }
  ),
  selfInliningBuiltin(
    "matches",
    { params: ["value", "schema"] },
    function (scopeId, paramNames) {
      return expansion(
        ifThrown(name(push(scopeId, "trueIfNotError")), literal(false)),
        [
          {
            find: push(scopeId, "trueIfNotError"),
            as: passThrown(name(push(scopeId, "all")), literal(true)),
          },
          {
            find: push(scopeId, "all"),
            as: calling(name("at"), [
              name(push(scopeId, "binding")),
              literal("all"),
            ]),
          },
          {
            find: push(scopeId, "binding"),
            as: bind(
              name(paramNames.get("value")),
              name(paramNames.get("schema"))
            ),
          },
        ]
      );
    }
  ),
  selfInliningBuiltin(
    "switch",
    {
      params: ["value", { rest: { name: "cases", type: ["any", "any"] } }],
    },
    function (scopeId, paramNames, computed) {
      const [{ cases }, earlyReturn] = demandFullParameterValues(
        ["cases"],
        paramNames,
        computed
      );
      if (earlyReturn) {
        return earlyReturn;
      }
      const steps = [];
      let axis = push(scopeId, "noMatch");
      steps.push({
        find: axis,
        as: throwing(literal("noCasesMatched"), [
          [literal("value"), name(paramNames.get("value"))],
        ]),
      });
      for (let i = cases.length - 1; i >= 0; i--) {
        const [schema, f] = cases[i];
        steps.push({
          find: push(scopeId, `case${i + 1}`, "binding"),
          as: bind(name(paramNames.get("value")), literal(schema)),
        });
        steps.push({
          find: push(scopeId, `case${i + 1}`, "all"),
          as: at(
            name(push(scopeId, `case${i + 1}`, "binding")),
            literal("all")
          ),
        });
        if (isFunction(f)) {
          steps.push({
            find: push(scopeId, `case${i + 1}`, "call"),
            as: calling(
              literal(f),
              [name(push(scopeId, `case${i + 1}`, "all"))],
              [spread(name(push(scopeId, `case${i + 1}`, "binding")))]
            ),
          });
        } else {
          steps.push({
            find: push(scopeId, `case${i + 1}`, "call"),
            as: literal(f),
          });
        }
        steps.push({
          find: push(scopeId, `case${i + 1}`, "tryMatch"),
          as: passThrown(
            name(push(scopeId, `case${i + 1}`, "all")),
            name(push(scopeId, `case${i + 1}`, "call"))
          ),
        });
        steps.push({
          find: push(scopeId, `case${i + 1}`, "tryNext"),
          as: ifThrown(
            name(push(scopeId, `case${i + 1}`, "tryMatch")),
            name(axis)
          ),
        });
        axis = push(scopeId, `case${i + 1}`, "tryNext");
      }
      return expansion(name(axis), steps);
    }
  ),
  builtin(
    "is",
    {
      params: [{ name: "type", type: "string" }],
      namedParams: [
        {
          name: "where",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([type], namedArgs) {
      return is(type, namedArgs);
    }
  ),
  builtin(
    "oneOf",
    {
      params: [{ rest: "values" }],
    },
    function (values) {
      return oneOf(values);
    }
  ),
  builtin(
    "arrayOf",
    {
      params: ["elementSchema"],
      namedParams: [
        {
          name: "where",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([type], namedArgs) {
      return arrayOf(type, namedArgs);
    }
  ),
  builtin(
    "objectOf",
    {
      namedParams: [
        { name: "keys", defaultValue: literal("string") },
        "values",
        {
          name: "where",
          type: either("function", null),
          defaultValue: literal(null),
        },
      ],
    },
    function ([], namedArgs) {
      return objectOf(namedArgs);
    }
  ),
  builtin(
    "optional",
    {
      params: ["schema"],
    },
    function ([schema]) {
      return optional(schema);
    }
  ),
  builtin(
    "either",
    {
      params: [{ rest: "schemas" }],
    },
    function (schemas) {
      return either(...schemas);
    }
  ),
  builtin(
    "as",
    {
      params: ["schema", { name: "name", type: "string" }],
    },
    function ([schema, name]) {
      return as(schema, name);
    }
  ),
  builtin(
    "default",
    {
      params: ["schema", "defaultValue"],
    },
    function ([schema, defaultValue]) {
      return default_(schema, defaultValue);
    }
  ),
  builtin(
    "rest",
    {
      params: ["schema"],
    },
    function ([schema]) {
      return rest(schema);
    }
  ),
];

export function builtin(name, paramSpec, f) {
  f.builtinName = name;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

export function selfInliningBuiltin(name, paramSpec, f) {
  const scopeId = push("$builtins", name, "{callId}");
  const paramNames = new Map();
  const scopedParams = [];
  for (const param of paramSpec.params ?? []) {
    const { simpleName, scopedName, scopedParam } = scopeParam(param, scopeId);
    paramNames.set(simpleName, scopedName);
    scopedParams.push(scopedParam);
  }
  const scopedNamedParams = [];
  for (const param of paramSpec.namedParams ?? []) {
    const { simpleName, scopedName, scopedParam } = scopeParam(param, scopeId);
    paramNames.set(simpleName, scopedName);
    scopedNamedParams.push(scopedParam);
  }
  let wrapper = (injectCallId, ...args) =>
    f(
      scopeId,
      new Map(
        [...paramNames].map(([localName, globalName]) => [
          localName,
          injectCallId(globalName),
        ])
      ),
      ...args
    );
  wrapper = builtin(
    name,
    { params: scopedParams, namedParams: scopedNamedParams },
    wrapper
  );
  wrapper.isSelfInlining = true;
  wrapper.paramNames = paramNames;
  return wrapper;
}

export function demandFullParameterValues(params, paramNames, computed) {
  const result = {};
  const stepsNeeded = [];
  for (const param of params) {
    const paramResult = tryFindAll(name(paramNames.get(param)), computed);
    if ("stepsNeeded" in paramResult) {
      stepsNeeded.push(...paramResult.stepsNeeded);
    } else if (isThrown(paramResult.value)) {
      return [result, { value: paramResult.value }];
    } else {
      result[param] = paramResult.value;
    }
  }
  if (stepsNeeded.length > 0) {
    return [result, { stepsNeeded }];
  } else {
    return [result, undefined];
  }
}

export function demandParameterValues(params, paramNames, computed) {
  const result = {};
  const stepsNeeded = [];
  for (const param of params) {
    const name = paramNames.get(param);
    if (computed.has(name)) {
      result[param] = computed.get(name);
      if (isThrown(result[param])) {
        return [result, { value: result[param] }];
      }
    } else {
      stepsNeeded.push(name);
    }
  }
  if (stepsNeeded.length > 0) {
    return [result, { stepsNeeded }];
  } else {
    return [result, undefined];
  }
}

function scopeParam(param, scopeId) {
  if (typeof param === "string") {
    return {
      simpleName: param,
      scopedName: push(scopeId, "$param", param),
      scopedParam: push(scopeId, "$param", param),
    };
  } else if ("name" in param) {
    return {
      simpleName: param.name,
      scopedName: push(scopeId, "$param", param.name),
      scopedParam: { ...param, name: push(scopeId, "$param", param.name) },
    };
  } else if ("rest" in param) {
    const restResult = scopeParam(param.rest, scopeId);
    return { ...restResult, scopedParam: restNode(restResult.scopedParam) };
  }
}

export function equals(a, b) {
  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.map((a_i, i) => equals(a_i, b[i])).every((x) => x);
  } else if (isObject(a) && isObject(b)) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!equals(value, b.get(key))) {
        return false;
      }
    }
    return true;
  } else {
    return a === b;
  }
}

function compare(a, b) {
  if (isArray(a)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) {
        return -1;
      }
      if (i >= b.length) {
        return 1;
      }
      if (!["number", "string", "boolean", "array"].includes(typeOf(a[i]))) {
        return kpthrow(
          "wrongArgumentType",
          ["value", a[i]],
          ["expectedType", either("number", "string", "boolean", "array")]
        );
      }
      if (!["number", "string", "boolean", "array"].includes(typeOf(b[i]))) {
        return kpthrow(
          "wrongArgumentType",
          ["value", b[i]],
          ["expectedType", either("number", "string", "boolean", "array")]
        );
      }
      if (typeOf(b[i]) !== typeOf(a[i])) {
        return kpthrow(
          "wrongArgumentType",
          ["value", b[i]],
          ["expectedType", typeOf(a[i])]
        );
      }
      const elementCompare = compare(a[i], b[i]);
      if (elementCompare !== 0) {
        return elementCompare;
      }
    }
    return 0;
  } else {
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  }
}

export function typeOf(value) {
  if (value === null) {
    return "null";
  } else if (isArray(value)) {
    return "array";
  } else if (isRecord(value)) {
    return "record";
  } else if (isBuiltin(value)) {
    return "builtin";
  } else if (isGiven(value)) {
    return "given";
  } else if (isError(value)) {
    return "error";
  } else {
    return typeof value;
  }
}

export function isBoolean(value) {
  return typeof value === "boolean";
}

export function isNumber(value) {
  return typeof value === "number";
}

export function isString(value) {
  return typeof value === "string";
}

export function isArray(value) {
  return Array.isArray(value);
}

export function isRecord(value) {
  return isObject(value) && !isGiven(value) && !isError(value);
}

export function isBuiltin(value) {
  return typeof value === "function";
}

export function isGiven(value) {
  return isObject(value) && value.has("#given");
}

export function isError(value) {
  return isObject(value) && value.has("#error");
}

export function isThrown(value) {
  return isObject(value) && value.has("#thrown");
}

export function isObject(value) {
  return value instanceof Map;
}

export function isFunction(value) {
  return isBuiltin(value) || isGiven(value);
}

export function isSequence(value) {
  return isString(value) || isArray(value);
}

export function toString(value) {
  if (isArray(value)) {
    return "[" + value.map(toString).join(", ") + "]";
  } else if (isObject(value)) {
    return (
      "{" +
      kpoEntries(value)
        .map(([k, v]) => `${isValidName(k) ? k : `"${k}"`}: ${toString(v)}`)
        .join(", ") +
      "}"
    );
  } else if (isBuiltin(value)) {
    return `function ${value.builtinName}`;
  } else {
    return JSON.stringify(value);
  }
}

export function toFunction(value) {
  if (isFunction(value)) {
    return value;
  } else {
    return builtin("constant", {}, () => value);
  }
}

function isValidName(string) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(string);
}

export function loadBuiltins(modules = kpobject()) {
  const import_ = builtin(
    "import",
    {
      params: ["module"],
    },
    function ([module]) {
      return modules.get(module) ?? kpthrow("missingModule", ["name", module]);
    }
  );
  return kpobject(...[import_, ...rawBuiltins].map((f) => [f.builtinName, f]));
}
