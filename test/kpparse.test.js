import test from "ava";
import { array, literal, name, object } from "../src/kpast.js";
import kpparse from "../src/kpparse.js";

const r = String.raw;

test(`Parsing "true" produces a true literal`, (t) => {
  t.deepEqual(kpparse("true"), literal(true));
});

test(`Parsing "false" produces a false literal`, (t) => {
  t.deepEqual(kpparse("false"), literal(false));
});

test(`Parsing "0" produces a numeric literal`, (t) => {
  t.deepEqual(kpparse("0"), literal(0));
});

test(`Parsing "1" produces a numeric literal`, (t) => {
  t.deepEqual(kpparse("1"), literal(1));
});

test(`Parsing "-2.5" produces a numeric literal`, (t) => {
  t.deepEqual(kpparse("-2.5"), literal(-2.5));
});

test("Parsing text in quotes produces a string literal", (t) => {
  t.deepEqual(kpparse(`"foobar"`), literal("foobar"));
});

test("Parsing a string with escapes produces a string literal with special characters", (t) => {
  t.deepEqual(
    kpparse(r`"\"\\\/\b\f\n\r\t\u1234"`),
    literal(`"\\/\b\f\n\r\t\u1234`)
  );
});

test("Parsing array syntax yields an array", (t) => {
  t.deepEqual(kpparse("[1, 2, 3]"), array(literal(1), literal(2), literal(3)));
});

test("We can parse an empty array", (t) => {
  t.deepEqual(kpparse("[]"), array());
});

test("We can parse a single-element array", (t) => {
  t.deepEqual(kpparse("[1]"), array(literal(1)));
});

test("We can parse an array of various types", (t) => {
  t.deepEqual(
    kpparse(`[null, false, true, -2.5, "foobar", [1, 2, 3]]`),
    array(
      literal(null),
      literal(false),
      literal(true),
      literal(-2.5),
      literal("foobar"),
      array(literal(1), literal(2), literal(3))
    )
  );
});

test("Parsing object syntax yields an object", (t) => {
  t.deepEqual(
    kpparse(`{"foo": "bar", "spam": "eggs"}`),
    object([literal("foo"), literal("bar")], [literal("spam"), literal("eggs")])
  );
});

test("We can parse an object containing various types", (t) => {
  t.deepEqual(
    kpparse(
      `{"null": null, "false": false, "true": true, "number": -2.5, "string": "foobar",
      "array": [1, 2, 3], "object": {"foo": "bar", "spam": "eggs"}}`
    ),
    object(
      [literal("null"), literal(null)],
      [literal("false"), literal(false)],
      [literal("true"), literal(true)],
      [literal("number"), literal(-2.5)],
      [literal("string"), literal("foobar")],
      [literal("array"), array(literal(1), literal(2), literal(3))],
      [
        literal("object"),
        object(
          [literal("foo"), literal("bar")],
          [literal("spam"), literal("eggs")]
        ),
      ]
    )
  );
});

// TODO expressions as object keys

test("We can parse a name", (t) => {
  t.deepEqual(kpparse("foo"), name("foo"));
});

test("We can parse a one-character name", (t) => {
  t.deepEqual(kpparse("x"), name("x"));
});

test("A function call can cross lines", (t) => {
  t.deepEqual(kpparse("bar(\n1,\n2\n)"), kpparse("bar(1, 2)"));
});

// TODO calling a pipe expression as a function

test("We can call a property as a function", (t) => {
  t.deepEqual(kpparse("x.f(y)"), kpparse("(x.f)(y)"));
});

test("We can access a property on a function result", (t) => {
  t.deepEqual(kpparse("f(x).y"), kpparse(`f(x) @ "y"`));
});

test("We can access a property on an expression", (t) => {
  t.deepEqual(kpparse("(x | f).y"), kpparse(`f(x) @ "y"`));
});

test("We can chain property access", (t) => {
  t.deepEqual(kpparse("x.y.z"), kpparse(`(x @ "y") @ "z"`));
});

// TODO quote, unquote, and function definitions
