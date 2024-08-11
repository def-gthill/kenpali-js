import test from "ava";
import decompose from "../src/decompose.js";
import {
  array,
  calling,
  defining,
  literal,
  name,
  object,
} from "../src/kpast.js";
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

test("An object node decomposes into a step for each value", (t) => {
  const expression = object(["foo", literal(42)], ["bar", literal("baz")]);
  const result = decompose(expression);
  t.deepEqual(
    result.result,
    object(["foo", name("$obj.$v1")], ["bar", name("$obj.$v2")])
  );
  t.deepEqual(result.steps.sort(byFind), [
    { find: "$obj.$v1", as: literal(42) },
    { find: "$obj.$v2", as: literal("baz") },
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

test("A calling node decomposes into a step for each argument", (t) => {
  const expression = calling(
    name("foo"),
    [literal(42)],
    [["bar", literal("baz")]]
  );
  const result = decompose(expression, new Map([["foo", literal(42)]]));
  t.deepEqual(
    result.result,
    calling(name("foo"), [name("$call.$pa1")], [["bar", name("$call.$na1")]])
  );
  t.deepEqual(result.steps.sort(byFind), [
    { find: "$call.$na1", as: literal("baz") },
    { find: "$call.$pa1", as: literal(42) },
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
