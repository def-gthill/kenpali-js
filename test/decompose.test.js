import test from "ava";
import decompose from "../src/decompose.js";
import { array, defining, literal, name } from "../src/kpast.js";
import { assertIsError } from "./assertIsError.js";

test("A literal node doesn't decompose any further", (t) => {
  const expression = literal(42);
  const result = decompose(expression);
  t.deepEqual(result, { steps: [], result: expression });
});

test("An array node decomposes into a step for each element", (t) => {
  const expression = array(literal("foo"), literal(42));
  const result = decompose(expression);
  t.deepEqual(result.result, array(name("$arr.$1"), name("$arr.$2")));
  t.deepEqual(result.steps.sort(byFind), [
    { find: "$arr.$1", as: literal("foo") },
    { find: "$arr.$2", as: literal(42) },
  ]);
});

test("A name node doesn't decompose any further", (t) => {
  const expression = name("foo");
  const result = decompose(expression, new Map([["foo", literal(42)]]));
  t.deepEqual(result, { steps: [], result: expression });
});

test("A reference to an undefined name errors when decomposed", (t) => {
  const expression = name("foo");
  const result = decompose(expression);
  assertIsError(t, result, "nameNotDefined", { name: "foo" });
});

test("A defining node decomposes into a step for each defined name", (t) => {
  const expression = defining(
    ["foo", name("bar")],
    ["bar", literal(42)],
    name("foo")
  );
  const result = decompose(expression);
  t.deepEqual(result.result, name("$def.foo"));
  t.deepEqual(result.steps.sort(byFind), [
    { find: "$def.bar", as: literal(42) },
    { find: "$def.foo", as: name("$def.bar") },
  ]);
});

function byFind(a, b) {
  if (a.find < b.find) {
    return -1;
  } else if (a.find > b.find) {
    return 1;
  } else {
    return 0;
  }
}
