import test from "ava";
import { as, eagerBind } from "../src/bind.js";
import { literal } from "../src/kpast.js";
import kpobject from "../src/kpobject.js";
import { assertIsThrown } from "./assertIsError.js";

test("Eager binding forces evaluation", (t) => {
  const value = expression(literal("foo"));
  const schema = "number";

  const result = eagerBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Eager binding can bind expressions inside arrays", (t) => {
  const value = [expression(literal("foo"))];
  const schema = [as("string", "word")];

  const bindings = eagerBind(value, schema);
  const word = bindings.get("word");

  t.is(word, "foo");
});

test("The reason given for a bad object property is an #error object", (t) => {
  const value = kpobject(["foo", "bar"]);
  const schema = kpobject(["foo", "number"]);

  const result = eagerBind(value, schema);

  assertIsThrown(t, result, "badProperty");
  t.is(result.get("reason").get("#error"), "wrongType");
});

function expression(expr) {
  return { expression: expr, context: new Map() };
}
