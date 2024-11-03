import test from "ava";
import { arrayLike, as, bind, objectLike } from "../src/bind.js";
import { literal } from "../src/kpast.js";
import { catch_ } from "../src/kperror.js";
import kpobject from "../src/kpobject.js";
import { assertIsError } from "./assertIsError.js";

test("Eager binding forces evaluation", (t) => {
  const value = expression(literal("foo"));
  const schema = "number";

  const result = catch_(() => bind(value, schema));

  assertIsError(t, result, "wrongType");
});

test("Eager binding can bind expressions inside arrays", (t) => {
  const value = [expression(literal("foo"))];
  const schema = arrayLike([as("string", "word")]);

  const bindings = bind(value, schema);
  const word = bindings.get("word");

  t.is(word, "foo");
});

test("The reason given for a bad object property is an error object", (t) => {
  const value = kpobject(["foo", "bar"]);
  const schema = objectLike(kpobject(["foo", "number"]));

  const result = catch_(() => bind(value, schema));

  assertIsError(t, result, "badProperty");
  assertIsError(t, result.details.get("reason"), "wrongType");
});

function expression(expr) {
  return { expression: expr, context: new Map() };
}
