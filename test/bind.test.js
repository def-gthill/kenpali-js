import test from "ava";
import {
  arrayOf,
  as,
  eagerBind,
  force,
  lazyBind,
  rest,
} from "../src/builtins.js";
import { literal } from "../src/kpast.js";
import kpobject from "../src/kpobject.js";
import assertIsThrown from "./assertIsError.js";

test("Lazy binding validates anything that's already evaluated", (t) => {
  const value = "foo";
  const schema = "number";

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
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
  const foo = force(bindings.get("foo"));

  assertIsThrown(t, foo, "badProperty");
});

test("Lazy binding ignores names that the caller doesn't retrieve", (t) => {
  const value = kpobject(
    ["foo", expression(literal("bar"))],
    ["spam", expression(literal("eggs"))]
  );
  const schema = kpobject(["foo", "string"], ["spam", "number"]);

  const bindings = lazyBind(value, schema);
  const foo = force(bindings.get("foo"));

  t.is(foo, "bar");
});

test("Lazy binding can bind expressions inside fixed arrays", (t) => {
  const value = [expression(literal(42))];
  const schema = [as("number", "answer")];

  const bindings = lazyBind(value, schema);
  const answer = force(bindings.get("answer"));

  t.is(answer, 42);
});

test("Lazy binding can bind expressions to rest elements in arrays", (t) => {
  const value = [expression(literal(42))];
  const schema = [rest(as("number", "answers"))];

  const bindings = lazyBind(value, schema);
  const answers = force(bindings.get("answers"));

  t.deepEqual(answers, [42]);
});

test("Lazy binding can bind expressions inside uniform arrays", (t) => {
  const value = [expression(literal(42))];
  const schema = arrayOf(as("number", "answer"));

  const bindings = lazyBind(value, schema);
  const answer = force(bindings.get("answer"));

  t.deepEqual(answer, [42]);
});

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

function expression(expr) {
  return { expression: expr, context: new Map() };
}
