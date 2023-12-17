import test from "ava";
import { eagerBind, lazyBind } from "../src/builtins.js";
import { literal } from "../src/kpast.js";
import kpobject from "../src/kpobject.js";
import assertIsError from "./assertIsError.js";

test("Lazy binding validates anything that's already evaluated", (t) => {
  const value = "foo";
  const schema = "number";

  const result = lazyBind(value, schema);

  assertIsError(t, result, "wrongType");
});

test("Lazy binding doesn't evaluate anything if there are no names bound", (t) => {
  const value = expression(literal("foo"));
  const schema = "number";

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

test("Lazy binding validates names that the caller retrieves", (t) => {
  const value = kpobject(["foo", expression(literal("bar"))]);
  const schema = kpobject(["foo", "number"]);

  const bindings = lazyBind(value, schema);
  const foo = bindings.get("foo");

  assertIsError(t, foo, "badProperty");
});

test("Lazy binding ignores names that the caller doesn't retrieve", (t) => {
  const value = kpobject(
    ["foo", expression(literal("bar"))],
    ["spam", expression(literal("eggs"))]
  );
  const schema = kpobject(["foo", "string"], ["spam", "number"]);

  const bindings = lazyBind(value, schema);
  const foo = bindings.get("foo");

  t.is(foo, "bar");
});

test("Eager binding forces evaluation", (t) => {
  const value = expression(literal("foo"));
  const schema = "number";

  const result = eagerBind(value, schema);

  assertIsError(t, result, "wrongType");
});

function expression(expr) {
  return { expression: expr, context: new Map() };
}
