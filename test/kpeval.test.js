import test from "ava";
import { platformFunction } from "../src/builtins.js";
import { block, call, literal, name } from "../src/kpast.js";
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

test("Names in modules can be accessed", (t) => {
  const ast = call(name("bar", "foo"), [literal("world")]);
  const fooModule = kpobject([
    "bar",
    platformFunction(
      "bar",
      { posParams: [{ name: "name", type: stringClass }] },
      (name) => `Hello, ${name}!`
    ),
  ]);
  const result = kpeval(ast, { modules: kpobject(["foo", fooModule]) });
  t.is(result, "Hello, world!");
});

test("Local names don't shadow names in modules", (t) => {
  const ast = block(
    [name("bar"), name("bar", "foo")],
    call(name("bar"), [literal("world")])
  );
  const fooModule = kpobject([
    "bar",
    platformFunction(
      "bar",
      { posParams: [{ name: "name", type: stringClass }] },
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
      { posParams: [{ name: "name", type: stringClass }] },
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
