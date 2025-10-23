import test from "ava";
import { platformFunction } from "../src/builtins.js";
import { block, call, function_, literal, name } from "../src/kpast.js";
import kpcompile from "../src/kpcompile.js";
import { kpcatch } from "../src/kperror.js";
import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";
import { stringClass } from "../src/values.js";
import { assertIsError } from "./assertIsError.js";

test("Evaluating null returns an error", (t) => {
  const expression = null;

  const result = kpcatch(() => kpcompile(expression));

  assertIsError(t, result, "notAnExpression");
});

test("We can define and call a two-argument function", (t) => {
  t.is(
    kpeval(
      block(
        [
          "funkyTimes",
          function_(
            call(name("times"), [
              call(name("plus"), [name("a"), literal(2)]),
              call(name("plus"), [name("b"), literal(3)]),
            ]),
            ["a", "b"]
          ),
        ],
        call(name("funkyTimes"), [literal(5), literal(3)])
      )
    ),
    42
  );
});

test("Function arguments can reference names", (t) => {
  t.is(
    kpeval(
      block(
        ["add3", function_(call(name("plus"), [name("x"), literal(3)]), ["x"])],
        block(["meaning", literal(42)], call(name("add3"), [name("meaning")]))
      )
    ),
    45
  );
});

test("Names in modules can be accessed", (t) => {
  const ast = call(name("bar", "foo"), [literal("world")]);
  const fooModule = kpobject([
    "bar",
    platformFunction(
      "bar",
      { params: [{ name: "name", type: stringClass }] },
      (name) => `Hello, ${name}!`
    ),
  ]);
  const result = kpeval(ast, { modules: kpobject(["foo", fooModule]) });
  t.is(result, "Hello, world!");
});

test("Local names don't shadow names in modules", (t) => {
  const ast = block(
    ["bar", name("bar", "foo")],
    call(name("bar"), [literal("world")])
  );
  const fooModule = kpobject([
    "bar",
    platformFunction(
      "bar",
      { params: [{ name: "name", type: stringClass }] },
      (name) => `Hello, ${name}!`
    ),
  ]);
  const result = kpeval(ast, { modules: kpobject(["foo", fooModule]) });
  t.is(result, "Hello, world!");
});

test("Functions in modules have type checking applied", (t) => {
  const ast = call(name("bar", "foo"), [literal(42)]);
  const fooModule = kpobject([
    "bar",
    platformFunction(
      "bar",
      { params: [{ name: "name", type: stringClass }] },
      (name) => `Hello, ${name}!`
    ),
  ]);
  const result = kpcatch(() =>
    kpeval(ast, { modules: kpobject(["foo", fooModule]) })
  );
  assertIsError(t, result, "wrongArgumentType", {
    value: 42,
    expectedType: "String",
  });
});
