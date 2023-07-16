import test from "ava";
import { bindNamedArgs } from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";
import assertIsError from "./assertIsError.js";

test("Binding no arguments to no parameters yields no bindings", (t) => {
  const args = kpobject();
  const params = [];

  const argBindings = bindNamedArgs(args, params);

  t.deepEqual(argBindings, kpobject());
});

test("Binding one argument to one parameter yields a single binding of that argument", (t) => {
  const args = kpobject(["x", 42]);
  const params = ["x"];

  const argBindings = bindNamedArgs(args, params);

  t.deepEqual(argBindings, kpobject(["x", 42]));
});

test("Binding no arguments to one parameter yields a missing argument error", (t) => {
  const args = kpobject();
  const params = ["x"];

  const argBindings = bindNamedArgs(args, params);

  assertIsError(t, argBindings, "missingArgument", { name: "x" });
});

test("Binding the wrong argument to one parameter yields a missing argument error", (t) => {
  const args = kpobject(["y", 42]);
  const params = ["x"];

  const argBindings = bindNamedArgs(args, params);

  assertIsError(t, argBindings, "missingArgument", { name: "x" });
});

test("Binding one argument to no parameters yields an unexpected argument error", (t) => {
  const args = kpobject(["x", 42]);
  const params = [];

  const argBindings = bindNamedArgs(args, params);

  assertIsError(t, argBindings, "unexpectedArgument", {
    name: "x",
    value: 42,
  });
});

test("Binding an argument to an optional parameter yields a single binding of that argument", (t) => {
  const args = kpobject(["x", 42]);
  const params = [["x", 73]];

  const argBindings = bindNamedArgs(args, params);

  t.deepEqual(argBindings, kpobject(["x", 42]));
});

test("Binding no arguments to an optional parameter yields a single binding of the default value", (t) => {
  const args = kpobject();
  const params = [["x", 73]];

  const argBindings = bindNamedArgs(args, params);

  t.deepEqual(argBindings, kpobject(["x", 73]));
});

test("Binding an optional argument to a parameter yields a single binding of that argument", (t) => {
  const args = kpobject(["x", kpobject(["#optional", 42])]);
  const params = ["x"];

  const argBindings = bindNamedArgs(args, params);

  t.deepEqual(argBindings, kpobject(["x", 42]));
});

test("Binding an optional argument to no parameters yields no bindings", (t) => {
  const args = kpobject(["x", kpobject(["#optional", 42])]);
  const params = [];

  const argBindings = bindNamedArgs(args, params);

  t.deepEqual(argBindings, kpobject());
});
