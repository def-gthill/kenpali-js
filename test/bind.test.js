import test from "ava";
import {
  arrayOf,
  as,
  deepForce,
  eagerBind,
  either,
  force,
  lazyBind,
  objectOf,
  rest,
} from "../src/builtins.js";
import { defining, literal, name } from "../src/kpast.js";
import kpobject from "../src/kpobject.js";
import assertIsThrown from "./assertIsError.js";

test("Lazy binding validates anything that's already evaluated", (t) => {
  const value = "foo";
  const schema = "number";

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Lazy binding doesn't evaluate anything if there are no names bound", (t) => {
  const value = expression(blowUp());
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

test("Lazy binding ignores unused names from fixed objects", (t) => {
  const value = kpobject(
    ["foo", expression(literal("bar"))],
    ["spam", expression(blowUp())]
  );
  const schema = kpobject(["foo", "string"], ["spam", "number"]);

  const bindings = lazyBind(value, schema);
  const foo = force(bindings.get("foo"));

  t.is(foo, "bar");
});

test("Lazy binding ignores unused names from fixed arrays", (t) => {
  const value = [expression(literal("bar")), expression(blowUp())];
  const schema = [as("string", "foo"), as("number", "spam")];

  const bindings = lazyBind(value, schema);
  const foo = force(bindings.get("foo"));

  t.is(foo, "bar");
});

test("Lazy binding ignores unused elements of uniform arrays", (t) => {
  const value = [expression(literal("bar")), expression(blowUp())];
  const schema = as(arrayOf("string"), "foo");

  const bindings = lazyBind(value, schema);
  const foo1 = force(force(bindings.get("foo"))[0]);

  t.is(foo1, "bar");
});

test("Lazy binding ignores unused properties of uniform objects", (t) => {
  const value = kpobject(
    ["foo", expression(literal("bar"))],
    ["spam", expression(blowUp())]
  );
  const schema = as(objectOf(kpobject(["values", "string"])), "obj");

  const bindings = lazyBind(value, schema);
  const foo = force(force(bindings.get("obj")).get("foo"));

  t.is(foo, "bar");
});

test("Lazy binding ignores unused union schemas", (t) => {
  const value = kpobject(
    ["foo", expression(literal("bar"))],
    ["spam", expression(blowUp())]
  );
  const schema = as(
    objectOf(kpobject(["values", either("string", "number")])),
    "obj"
  );

  const bindings = lazyBind(value, schema);
  const foo = force(force(bindings.get("obj")).get("foo"));

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
  const answers = deepForce(bindings.get("answers"));

  t.deepEqual(answers, [42]);
});

test("Lazy binding can bind expressions inside uniform arrays", (t) => {
  const value = [expression(literal(42))];
  const schema = arrayOf(as("number", "answer"));

  const bindings = lazyBind(value, schema);
  const answer = deepForce(bindings.get("answer"));

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

function blowUp() {
  return defining(["foo", name("foo")], name("foo"));
}
