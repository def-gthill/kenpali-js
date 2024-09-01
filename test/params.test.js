import test from "ava";
import { builtin } from "../src/builtins.js";
import { given, literal } from "../src/kpast.js";
import kpeval, {
  deepToJsObject,
  normalizeAllParams,
  normalizeParam,
  paramsFromBuiltin,
  paramsFromGiven,
} from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";

test("A given with an empty param spec has no params", (t) => {
  const f = kpeval(given({}, literal(null)));

  const params = paramsFromGiven(f);

  t.deepEqual(deepToJsObject(params), {
    params: [],
    namedParams: [],
  });
});

// test("All param types can be extracted from a given", (t) => {
//   const f = kpeval(
//     given(
//       {
//         params: ["a", { rest: "b" }],
//         namedParams: ["c", { rest: "d" }],
//       },
//       literal(null)
//     )
//   );

//   const params = paramsFromGiven(f);

//   t.deepEqual(deepToJsObject(params), {
//     params: ["a", { rest: "b" }],
//     namedParams: ["c", { rest: "d" }],
//   });
// });

test("A builtin with an empty param spec has no params", (t) => {
  const f = builtin("foo", {}, () => null);

  const params = paramsFromBuiltin(f);

  t.deepEqual(params, {
    params: [],
    namedParams: [],
  });
});

test("All param types can be extracted from a builtin", (t) => {
  const f = builtin(
    "foo",
    {
      params: ["a", { rest: "b" }],
      namedParams: ["c", { rest: "d" }],
    },
    literal(null)
  );

  const params = paramsFromBuiltin(f);

  t.deepEqual(params, {
    params: ["a", { rest: "b" }],
    namedParams: ["c", { rest: "d" }],
  });
});

test("Normalizing a string param yields a param object with only a name", (t) => {
  const param = "foo";
  const normalized = normalizeParam(param);
  t.deepEqual(normalized, { name: "foo" });
});

test("Normalizing a JS object param yields the same object", (t) => {
  const param = { name: "foo", type: "string" };
  const normalized = normalizeParam(param);
  t.deepEqual(normalized, param);
});

test("Normalizing a Kenpali object param yields an equivalent JS object", (t) => {
  const param = kpobject(["name", "foo"], ["type", "string"]);
  const normalized = normalizeParam(param);
  t.deepEqual(normalized, { name: "foo", type: "string" });
});

test("We can normalize all params", (t) => {
  const params = {
    params: ["a", { rest: { name: "b", type: "string" } }],
    namedParams: [
      kpobject(["name", "c"], ["type", "string"]),
      kpobject(["rest", "d"]),
    ],
  };

  const normalized = normalizeAllParams(params);

  t.deepEqual(normalized, {
    params: [{ name: "a" }, { rest: { name: "b", type: "string" } }],
    namedParams: [{ name: "c", type: "string" }, { rest: { name: "d" } }],
  });
});
