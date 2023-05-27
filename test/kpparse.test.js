import test from "ava";
import { array, literal } from "../src/kpast.js";
import kpparse from "../src/kpparse.js";

const r = String.raw;

test(`Parsing "null" produces a null literal`, (t) => {
  t.deepEqual(kpparse("null"), literal(null));
});

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

test("Parsing array syntax yields an array of literals", (t) => {
  t.deepEqual(kpparse("[1, 2, 3]"), array(literal(1), literal(2), literal(3)));
});

test("We can parse an empty array", (t) => {
  t.deepEqual(kpparse("[]"), array());
});

test("We can parse a single-element array", (t) => {
  t.deepEqual(kpparse("[1]"), array(literal(1)));
});
