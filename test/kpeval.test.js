import test from "ava";
import { builtin } from "../src/builtins.js";
import { calling, defining, given, literal, name } from "../src/kpast.js";
import kpcompile from "../src/kpcompile.js";
import { kpcatch } from "../src/kperror.js";
import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";
import { assertIsError } from "./assertIsError.js";

test("Evaluating null returns an error", (t) => {
  const expression = null;

  const result = kpcatch(() => kpcompile(expression));

  assertIsError(t, result, "notAnExpression");
});

test("We can define and call a two-argument function", (t) => {
  t.is(
    kpeval(
      defining(
        [
          "funkyTimes",
          given(
            { params: ["a", "b"] },
            calling(name("times"), [
              calling(name("plus"), [name("a"), literal(2)]),
              calling(name("plus"), [name("b"), literal(3)]),
            ])
          ),
        ],
        calling(name("funkyTimes"), [literal(5), literal(3)])
      )
    ),
    42
  );
});

test("Function arguments can reference names", (t) => {
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
        defining(
          ["meaning", literal(42)],
          calling(name("add3"), [name("meaning")])
        )
      )
    ),
    45
  );
});

test("Names in modules can be accessed", (t) => {
  const ast = calling(name("bar", "foo"), [literal("world")]);
  const fooModule = kpobject([
    "bar",
    builtin(
      "bar",
      { params: [{ name: "name", type: "string" }] },
      (name) => `Hello, ${name}!`
    ),
  ]);
  const result = kpeval(ast, { modules: kpobject(["foo", fooModule]) });
  t.is(result, "Hello, world!");
});

test("Names in modules don't shadow local names", (t) => {
  const ast = defining(
    ["bar", name("bar", "foo")],
    calling(name("bar"), [literal("world")])
  );
  const fooModule = kpobject([
    "bar",
    builtin(
      "bar",
      { params: [{ name: "name", type: "string" }] },
      (name) => `Hello, ${name}!`
    ),
  ]);
  const result = kpeval(ast, { modules: kpobject(["foo", fooModule]) });
  t.is(result, "Hello, world!");
});
