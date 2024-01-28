import test from "ava";
import {
  arrayOf,
  as,
  either,
  force,
  is,
  lazyBind,
  objectOf,
  oneOf,
  rest,
} from "../src/bind.js";
import { defining, literal, name, object, quote } from "../src/kpast.js";
import kpthrow from "../src/kperror.js";
import kpobject, { kpoKeys } from "../src/kpobject.js";
import { assertIsError, assertIsThrown } from "./assertIsError.js";

// For each type of structure:
// - Check that it returns the correct bindings or errors when given a value.
// - Check that it defers the correct bindings or errors when given an expression.
// - Check that it doesn't evaluate expressions that aren't retrieved.
// - Check that it transmits input errors unaltered.

// For complex structures, also:
// - Check that it combines value bindings from sub-schemas.
// - Check that it defers expression bindings from sub-schemas.
// - Check that it doesn't evaluate element expressions that aren't retrieved.

// Type schema

test("Binding a wrong-typed value to a type schema yields a wrongType error", (t) => {
  const value = "foo";
  const schema = "number";

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Binding an expression to a type schema doesn't evaluate it", (t) => {
  const value = expression(blowUp());
  const schema = "number";

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

test("Binding a thrown error to a type schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = "number";

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

// Explicit binding

test("Explicitly binding a value returns a binding", (t) => {
  const value = 42;
  const schema = as("number", "answer");

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["answer", 42]));
});

test("Explicit binding a value forwards any errors from the schema", (t) => {
  const value = "foo";
  const schema = as("number", "answer");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Explicitly binding an expression returns a deferred binding", (t) => {
  const value = expression(literal(42));
  const schema = as("number", "answer");

  const result = force(lazyBind(value, schema).get("answer"));

  t.is(result, 42);
});

test("Explicitly binding an expression forwards any errors from the schema", (t) => {
  const value = expression(literal("foo"));
  const schema = as("number", "answer");

  const result = force(lazyBind(value, schema).get("answer"));

  assertIsThrown(t, result, "wrongType");
});

test("Explicit binding an expression doesn't evaluate it if the name is never retrieved", (t) => {
  const value = expression(blowUp());
  const schema = as("number", "answer");

  const result = lazyBind(value, schema);

  t.true(result.has("answer"));
});

test("Explicitly binding a thrown error value passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = as("number", "answer");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

test("Explicitly binding a thrown error expression passes the error through", (t) => {
  const value = expression(quote(kpthrow("someError")));
  const schema = as("number", "answer");

  const result = force(lazyBind(value, schema).get("answer"));

  assertIsThrown(t, result, "someError");
});

test("Explicit binding forwards value bindings from the sub-schema", (t) => {
  const value = 42;
  const schema = as(as("number", "schmanswer"), "answer");

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["answer", 42], ["schmanswer", 42]));
});

test("Explicit binding forwards expression bindings from the sub-schema", (t) => {
  const value = expression(literal(42));
  const schema = as(as("number", "schmanswer"), "answer");

  const result = lazyBind(value, schema);

  t.is(force(result.get("answer")), 42);
  t.is(force(result.get("schmanswer")), 42);
});

test("Explicit binding an expression doesn't evaluate it if sub-schema names are never retrieved", (t) => {
  const value = expression(blowUp());
  const schema = as(as("number", "schmanswer"), "answer");

  const result = lazyBind(value, schema);

  t.true(result.has("answer"));
  t.true(result.has("schmanswer"));
});

// Array schema

test("Binding a simple value to an array schema yields a wrongType error", (t) => {
  const value = "foo";
  const schema = ["string", "number"];

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Binding a too-short array value to an array schema yields a missingElement error", (t) => {
  const value = ["foo"];
  const schema = ["string", "number"];

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "missingElement");
});

test("Binding an expression to an array schema doesn't evaluate it", (t) => {
  const value = expression(blowUp());
  const schema = ["string", "number"];

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

test("Binding a thrown error to an array schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = ["string", "number"];

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

test("Binding an array schema forwards value bindings from the element schemas", (t) => {
  const value = ["John", 42];
  const schema = [as("string", "name"), as("number", "age")];

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["name", "John"], ["age", 42]));
});

test("Binding an array schema defers expression bindings from the element schemas", (t) => {
  const value = [expression(literal("John")), expression(literal(42))];
  const schema = [as("string", "name"), as("number", "age")];

  const result = lazyBind(value, schema);

  t.is(force(result.get("name")), "John");
  t.is(force(result.get("age")), 42);
});

test("Binding an array schema propagates errors from element schemas", (t) => {
  const value = ["John", "Jane"];
  const schema = [as("string", "name"), as("number", "age")];

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badElement");
  assertIsError(t, result.get("reason"), "wrongType");
});

test("Binding an array schema doesn't evaluate expressions that aren't retrieved", (t) => {
  const value = [expression(literal("John")), expression(blowUp())];
  const schema = [as("string", "name"), as("number", "age")];

  const result = lazyBind(value, schema);

  t.is(force(result.get("name")), "John");
});

// Array schema with rest

test("Binding to an array schema with a rest element binds the excess elements to the rest name", (t) => {
  const value = ["John", 42, "foo", "bar"];
  const schema = ["string", "number", rest(as("string", "words"))];

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["words", ["foo", "bar"]]));
});

test("Binding an array with no excess elements to an array schema with a rest element binds an empty array to the rest name", (t) => {
  const value = ["John", 42];
  const schema = ["string", "number", rest(as("string", "words"))];

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["words", []]));
});

test("Binding to an array with a rest element propagates errors from the rest schema", (t) => {
  const value = ["John", 42, "foo", 97];
  const schema = ["string", "number", rest(as("string", "words"))];

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badElement", { index: 4 });
  assertIsError(t, result.get("reason"), "wrongType");
});

// Uniform array schema

test("Binding a simple value to a uniform array schema yields a wrongType error", (t) => {
  const value = "foo";
  const schema = arrayOf("number");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Binding an expression to a uniform array schema doesn't evaluate it", (t) => {
  const value = expression(blowUp());
  const schema = arrayOf("number");

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

test("Binding a thrown error to a uniform array schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = arrayOf("number");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

test("Binding a uniform array schema accumulates value bindings from the element schemas", (t) => {
  const value = [42, 97, 216];
  const schema = arrayOf(as("number", "answer"));

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["answer", [42, 97, 216]]));
});

test("Binding a uniform array with inconsistent bindings leaves errors for missing bindings", (t) => {
  const value = [42, "foo", 216];
  const schema = arrayOf(either(as("number", "answer"), "string"));

  const result = lazyBind(value, schema);
  const answer = result.get("answer");

  t.is(answer[0], 42);
  assertIsThrown(t, answer[1], "wrongType");
  t.is(answer[2], 216);
});

test("Binding a uniform array schema accumulates expression bindings from the element schemas", (t) => {
  const value = [
    expression(literal(42)),
    expression(literal(97)),
    expression(literal(216)),
  ];
  const schema = arrayOf(as("number", "answer"));

  const result = lazyBind(value, schema);
  const answer = result.get("answer");

  t.is(force(answer[0]), 42);
  t.is(force(answer[1]), 97);
  t.is(force(answer[2]), 216);
});

test("Binding a uniform array schema propagates errors from the element schema", (t) => {
  const value = [42, "foo", 216];
  const schema = arrayOf(as("number", "answer"));

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badElement");
  assertIsError(t, result.get("reason"), "wrongType");
});

test("Binding a uniform array schema doesn't evaluate expressions that aren't retrieved", (t) => {
  const value = [
    expression(literal(42)),
    expression(blowUp()),
    expression(literal(216)),
  ];
  const schema = arrayOf(as("number", "answer"));

  const result = lazyBind(value, schema);
  const answer = result.get("answer");

  t.is(force(answer[0]), 42);
  t.is(force(answer[2]), 216);
});

// Object schema

test("Binding a correct object value to an object schema binds its keys", (t) => {
  const value = kpobject(["name", "John"], ["age", 42]);
  const schema = kpobject(["name", "string"], ["age", "number"]);

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["name", "John"], ["age", 42]));
});

test("Binding a simple value to an object schema yields a wrongType error", (t) => {
  const value = "foo";
  const schema = kpobject(["name", "string"], ["age", "number"]);

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Binding an object value without all the required properties to an object schema yields a missingProperty error", (t) => {
  const value = kpobject(["name", "John"]);
  const schema = kpobject(["name", "string"], ["age", "number"]);

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "missingProperty");
});

test("Binding a correct object expression to an object schema binds its keys immediately", (t) => {
  const value = expression(
    object(["name", literal("John")], ["age", literal(42)])
  );
  const schema = kpobject(["name", "string"], ["age", "number"]);

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["name", "John"], ["age", 42]));
});

test("Binding a thrown error to an object schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = kpobject(["name", "string"], ["age", "number"]);

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

test("Binding an object with values to an object schema merges properties from the property schemas", (t) => {
  const value = kpobject(["name", "John"], ["age", 42]);
  const schema = kpobject(
    ["name", as("string", "king")],
    ["age", as("number", "answer")]
  );

  const result = lazyBind(value, schema);

  t.deepEqual(
    result,
    kpobject(["name", "John"], ["age", 42], ["king", "John"], ["answer", 42])
  );
});

test("Binding an object with expressions to an object schema defers properties from the property schemas", (t) => {
  const value = kpobject(
    ["name", expression(literal("John"))],
    ["age", expression(literal(42))]
  );
  const schema = kpobject(
    ["name", as("string", "king")],
    ["age", as("number", "answer")]
  );

  const result = lazyBind(value, schema);

  t.is(force(result.get("name")), "John");
  t.is(force(result.get("age")), 42);
  t.is(force(result.get("king")), "John");
  t.is(force(result.get("answer")), 42);
});

test("Binding an object schema propagates errors from property schemas", (t) => {
  const value = kpobject(["name", "John"], ["age", "foo"]);
  const schema = kpobject(["name", "string"], ["age", "number"]);

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badProperty");
  assertIsError(t, result.get("reason"), "wrongType");
});

test("Binding an object schema doesn't evaluate expressions that aren't retrieved", (t) => {
  const value = kpobject(
    ["name", expression(literal("John"))],
    ["age", expression(blowUp())]
  );
  const schema = kpobject(["name", "string"], ["age", "number"]);

  const result = lazyBind(value, schema);

  t.is(force(result.get("name")), "John");
});

// Object schema with rest

test("Binding to an object schema with a rest property binds the excess properties to the rest name", (t) => {
  const value = kpobject(["name", "John"], ["age", 42], ["hobby", "coding"]);
  const schema = kpobject(
    ["name", "string"],
    ["age", "number"],
    ["notes", rest("string")]
  );

  const result = lazyBind(value, schema);

  t.deepEqual(
    result,
    kpobject(
      ["name", "John"],
      ["age", 42],
      ["notes", kpobject(["hobby", "coding"])]
    )
  );
});

test("Binding an object with no excess properties to an object schema with a rest property binds an empty object to the rest name", (t) => {
  const value = kpobject(["name", "John"], ["age", 42]);
  const schema = kpobject(
    ["name", "string"],
    ["age", "number"],
    ["notes", rest("string")]
  );

  const result = lazyBind(value, schema);

  t.deepEqual(
    result,
    kpobject(["name", "John"], ["age", 42], ["notes", kpobject()])
  );
});

// Uniform object schema

test("Binding a simple value to a uniform object schema yields a wrongType error", (t) => {
  const value = "foo";
  const schema = objectOf(kpobject(["values", "number"]));

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Binding an expression to a uniform object schema doesn't evaluate it", (t) => {
  const value = expression(blowUp());
  const schema = objectOf(kpobject(["values", "number"]));

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

test("Binding a thrown error to a uniform object schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = objectOf(kpobject(["values", "number"]));

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

test("Binding a uniform object schema accumulates value bindings from the values schema", (t) => {
  const value = kpobject(["answer", 42], ["prime", 97]);
  const schema = objectOf(kpobject(["values", as("number", "n")]));

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject(["n", kpobject(["answer", 42], ["prime", 97])]));
});

test("Binding a uniform object with inconsistent bindings leaves errors for missing bindings", (t) => {
  const value = kpobject(["answer", "yes"], ["prime", 97]);
  const schema = objectOf(
    kpobject(["values", either(as("number", "n"), "string")])
  );

  const result = lazyBind(value, schema);
  const n = result.get("n");

  assertIsThrown(t, n.get("answer"), "wrongType");
  t.is(n.get("prime"), 97);
});

test("Binding a uniform object schema accumulates expression bindings from the values schema", (t) => {
  const value = kpobject(
    ["answer", expression(literal(42))],
    ["prime", expression(literal(97))]
  );
  const schema = objectOf(kpobject(["values", as("number", "n")]));

  const result = lazyBind(value, schema);
  const n = result.get("n");

  t.is(force(n.get("answer")), 42);
  t.is(force(n.get("prime")), 97);
});

test("Binding a uniform object schema propagates errors from the values schema", (t) => {
  const value = kpobject(["answer", "yes"], ["prime", 97]);
  const schema = objectOf(kpobject(["values", as("number", "n")]));

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badProperty");
  assertIsError(t, result.get("reason"), "wrongType");
});

test("Binding a uniform object schema propagates errors from the keys schema", (t) => {
  const value = kpobject(["answer", 42], ["", 97]);
  const schema = objectOf(
    kpobject([
      "keys",
      is("string", kpobject(["where", (key) => key.length > 0])),
    ])
  );

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badKey");
  assertIsError(t, result.get("reason"), "badValue");
});

test("Binding a uniform object schema doesn't evaluate expressions that aren't retrieved", (t) => {
  const value = kpobject(
    ["answer", expression(blowUp())],
    ["prime", expression(literal(97))]
  );
  const schema = objectOf(kpobject(["values", as("number", "n")]));

  const result = lazyBind(value, schema);
  const n = result.get("n");

  t.is(force(n.get("prime")), 97);
});

// Condition schema

test("Binding a wrong-typed value to a condition schema yields a wrongType error", (t) => {
  const value = "foo";
  const schema = is("number", kpobject(["where", (n) => n > 100]));

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Binding a condition-failing value to a condition schema yields a badValue error", (t) => {
  const value = 42;
  const schema = is("number", kpobject(["where", (n) => n > 100]));

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badValue");
});

test("Binding an expression to a condition schema doesn't evaluate it", (t) => {
  const value = expression(blowUp());
  const schema = is("number", kpobject(["where", (n) => n > 100]));

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

test("Binding a thrown error to a condition schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = is("number", kpobject(["where", (n) => n > 100]));

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

// Union schema

test("Binding a thrown error to a union schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = either("number", "string");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

test("Binding a value to a union schema forwards bindings from the matching subschema", (t) => {
  const value = "foo";
  const schema = either(as("number", "answer"), as("string", "question"));

  const result = lazyBind(value, schema);

  t.deepEqual(kpoKeys(result), ["answer", "question"]);
  assertIsThrown(t, result.get("answer"), "wrongType");
  t.is(result.get("question"), "foo");
});

test("Binding an expression to a union schema defers bindings from the matching subschema", (t) => {
  const value1 = expression(literal(42));
  const value2 = expression(literal("foo"));
  const schema = either(as("number", "answer"), as("string", "question"));

  const result1 = lazyBind(value1, schema);
  const result2 = lazyBind(value2, schema);

  t.deepEqual(kpoKeys(result1), ["answer", "question"]);
  t.deepEqual(kpoKeys(result2), ["answer", "question"]);
  t.is(force(result1.get("answer")), 42);
  assertIsThrown(t, force(result2.get("answer")), "wrongType");
  assertIsThrown(t, force(result1.get("question")), "wrongType");
  t.is(force(result2.get("question")), "foo");
});

test("Binding an expression to a union schema can bind the same name in either option", (t) => {
  const value1 = expression(literal(42));
  const value2 = expression(literal("foo"));
  const schema = either(as("number", "answer"), as("string", "answer"));

  const result1 = lazyBind(value1, schema);
  const result2 = lazyBind(value2, schema);

  t.is(force(result1.get("answer")), 42);
  t.is(force(result2.get("answer")), "foo");
});

test("Binding a value whose type is wrong for every option yields a wrongType error", (t) => {
  const value = [];
  const schema = either("number", "string");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "wrongType");
});

test("Binding a value that doesn't match any option yields a badValue error", (t) => {
  const value = 42;
  const schema = either(
    is("number", kpobject(["where", (n) => n > 100])),
    "string"
  );

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badValue");
});

test("Binding an expression to a union schema doesn't evaluate it if neither option binds anything", (t) => {
  const value = expression(blowUp());
  const schema = either("number", "string");

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

// Literal list schema

test("Binding a value that isn't in the list to a literal list schema yields a badValue error", (t) => {
  const value = "foo";
  const schema = oneOf("yes", "no");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "badValue");
});

test("Binding an expression to a literal list schema doesn't evaluate it", (t) => {
  const value = expression(blowUp());
  const schema = oneOf("yes", "no");

  const result = lazyBind(value, schema);

  t.deepEqual(result, kpobject());
});

test("Binding a thrown error to a literal list schema passes the error through", (t) => {
  const value = kpthrow("someError");
  const schema = oneOf("yes", "no");

  const result = lazyBind(value, schema);

  assertIsThrown(t, result, "someError");
});

function expression(expr) {
  return { expression: expr, context: new Map() };
}

function blowUp() {
  return defining(["foo", name("foo")], name("foo"));
}
