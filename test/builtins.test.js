import test from "ava";
import { rawBuiltins } from "../src/builtins.js";
import { array, calling, literal, name, object } from "../src/kpast.js";
import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";

test("The built-in plus function adds numbers", (t) => {
  t.is(kpeval(calling(name("plus"), [literal(1), literal(2)])), 3);
});

test("The built-in negative function negates numbers", (t) => {
  t.is(kpeval(calling(name("negative"), [literal(42)])), -42);
});

test("The built-in times function multiplies numbers", (t) => {
  t.is(kpeval(calling(name("times"), [literal(2), literal(3)])), 6);
});

test("The built-in oneOver function reciprocates numbers", (t) => {
  t.is(kpeval(calling(name("oneOver"), [literal(2)])), 0.5);
});

test("The built-in divideWithRemainder function does Euclidean division", (t) => {
  t.deepEqual(
    kpeval(calling(name("divideWithRemainder"), [literal(10), literal(3)])),
    kpobject(["quotient", 3], ["remainder", 1])
  );
});

test("The built-in equals function returns true for equal numbers", (t) => {
  t.true(kpeval(calling(name("equals"), [literal(42), literal(42)])));
});

test("The built-in equals function returns false for unequal numbers", (t) => {
  t.false(kpeval(calling(name("equals"), [literal(42), literal(43)])));
});

test("The built-in equals function returns true for equivalent arrays", (t) => {
  t.true(
    kpeval(
      calling(name("equals"), [
        array(literal("foo"), literal("bar")),
        array(literal("foo"), literal("bar")),
      ])
    )
  );
});

test("The built-in equals function returns true for equivalent objects", (t) => {
  t.true(
    kpeval(
      calling(name("equals"), [
        object(
          [literal("foo"), literal("bar")],
          [literal("spam"), literal("eggs")]
        ),
        object(
          [literal("spam"), literal("eggs")],
          [literal("foo"), literal("bar")]
        ),
      ])
    )
  );
});

test("The built-in isLessThan function returns true if a < b", (t) => {
  t.true(kpeval(calling(name("isLessThan"), [literal(42), literal(43)])));
});

test("The built-in isLessThan function returns false if a = b", (t) => {
  t.false(kpeval(calling(name("isLessThan"), [literal(42), literal(42)])));
});

test("The built-in isLessThan function returns false if a > b", (t) => {
  t.false(kpeval(calling(name("isLessThan"), [literal(43), literal(42)])));
});

test(`The built-in typeOf function says that null is a "null"`, (t) => {
  t.is(rawBuiltins.typeOf([null]), "null");
});

test(`The built-in typeOf function says that true is a "boolean"`, (t) => {
  t.is(rawBuiltins.typeOf([true]), "boolean");
});

test(`The built-in typeOf function says that false is a "boolean"`, (t) => {
  t.is(rawBuiltins.typeOf([false]), "boolean");
});

test(`The built-in typeOf function says that a number is a "number"`, (t) => {
  t.is(rawBuiltins.typeOf([1]), "number");
});

test(`The built-in typeOf function says that a string is a "string"`, (t) => {
  t.is(rawBuiltins.typeOf(["foo"]), "string");
});

test(`The built-in typeOf function says that an array is an "array"`, (t) => {
  t.is(rawBuiltins.typeOf([[1, 2, 3]]), "array");
});

test(`The built-in typeOf function says that an object is an "object"`, (t) => {
  t.is(rawBuiltins.typeOf([kpobject(["foo", "bar"])]), "object");
});
