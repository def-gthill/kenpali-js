import test from "ava";
import {
  array,
  calling,
  defining,
  given,
  literal,
  name,
  object,
  quote,
  unquote,
} from "../src/kpast.js";
import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";

test("A null literal evaluates to null", (t) => {
  t.is(kpeval(literal(null)), null);
});

test("A true literal evaluates to true", (t) => {
  t.is(kpeval(literal(true)), true);
});

test("A false literal evaluates to false", (t) => {
  t.is(kpeval(literal(false)), false);
});

test("A number literal evaluates to a number", (t) => {
  t.is(kpeval(literal(1)), 1);
});

test("A string literal evaluates to a string", (t) => {
  t.is(kpeval(literal("foobar")), "foobar");
});

test("An array expression evaluates to an array", (t) => {
  t.deepEqual(kpeval(array(literal(1), literal(2), literal(3))), [1, 2, 3]);
});

test("An object expression evaluates to a Kenpali object", (t) => {
  t.deepEqual(
    kpeval(
      object(
        [literal("foo"), literal("bar")],
        [literal("spam"), literal("eggs")]
      )
    ),
    kpobject(["foo", "bar"], ["spam", "eggs"])
  );
});

// TODO Expressions that evaluate to non-strings can't be keys.

test("A name reference returns the bound value", (t) => {
  t.is(kpeval(defining(["foo", literal(42)], name("foo"))), 42);
});

test("A name can reference another name", (t) => {
  t.is(
    kpeval(
      defining(
        ["foo", name("baz")],
        ["bar", literal(42)],
        ["baz", name("bar")],
        name("foo")
      )
    ),
    42
  );
});

test("A name isn't accessible outside its scope", (t) => {
  const result = kpeval(
    defining(
      ["foo", defining(["bar", literal(42)], literal(null))],
      name("bar")
    )
  );
  t.is(result.get("!!error"), "nameNotDefined");
  t.is(result.get("name"), "bar");
});

test("A name from an enclosing scope is accessible", (t) => {
  t.is(
    kpeval(
      defining(
        ["foo", literal(42)],
        defining(["bar", literal(73)], name("foo"))
      )
    ),
    42
  );
});

test("A name in an inner scope shadows the same name in an outer scope", (t) => {
  t.is(
    kpeval(
      defining(
        ["foo", literal(42)],
        defining(["foo", literal(73)], name("foo"))
      )
    ),
    73
  );
});

test("An array expression can reference names", (t) => {
  t.deepEqual(kpeval(defining(["foo", literal(42)], array(name("foo")))), [42]);
});

test("An object expression can reference names", (t) => {
  t.deepEqual(
    kpeval(
      defining(["foo", literal(42)], object([literal("foo"), name("foo")]))
    ),
    kpobject(["foo", 42])
  );
});

test("Quoting blocks evaluation of an expression", (t) => {
  t.deepEqual(kpeval(quote(literal(1))), kpobject(["literal", 1]));
});

test("Unquoting evaluates part of a quoted expression before quoting kicks in", (t) => {
  t.deepEqual(
    kpeval(
      quote(array(unquote(calling(name("plus"), [literal(1), literal(1)]))))
    ),
    kpobject(["array", [kpobject(["literal", 2])]])
  );
});

test("We can define a function and then call it", (t) => {
  t.is(
    kpeval(
      defining(
        [
          "add3",
          given(
            { params: ["x"] },
            calling(name("plus"), [name("x"), literal(3)])
          ),
        ],
        calling(name("add3"), [literal(42)])
      )
    ),
    45
  );
});
