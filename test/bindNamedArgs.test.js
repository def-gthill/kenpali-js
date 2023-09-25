import test from "ava";

test("Placeholder", (t) => {
  t.is(1, 1);
});

// import kperror from "../src/kperror.js";
// import { bindNamedArgs } from "../src/kpeval.js";
// import kpobject, { toKpobject } from "../src/kpobject.js";
// import assertIsError from "./assertIsError.js";

// test("Binding no arguments to no parameters yields no bindings", (t) => {
//   const args = kpobject();
//   const params = [];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject());
// });

// test("Binding one argument to one parameter yields a single binding of that argument", (t) => {
//   const args = kpobject(["x", 42]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject(["x", 42]));
// });

// test("Binding no arguments to one parameter yields a missing argument error", (t) => {
//   const args = kpobject();
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   assertIsError(t, argBindings, "missingArgument", { name: "x" });
// });

// test("Binding the wrong argument to one parameter yields a missing argument error", (t) => {
//   const args = kpobject(["y", 42]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   assertIsError(t, argBindings, "missingArgument", { name: "x" });
// });

// test("Binding one argument to no parameters yields an unexpected argument error", (t) => {
//   const args = kpobject(["x", 42]);
//   const params = [];

//   const argBindings = bindNamedArgs(args, params);

//   assertIsError(t, argBindings, "unexpectedArgument", {
//     name: "x",
//     value: 42,
//   });
// });

// test("Binding an argument to a typed parameter yields a binding of that argument", (t) => {
//   const args = kpobject(["x", 42]);
//   const params = [toKpobject({ name: "x", type: "number" })];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject(["x", 42]));
// });

// test("Binding an argument of the wrong type yields a wrong argument type error", (t) => {
//   const args = kpobject(["x", 42]);
//   const params = [toKpobject({ name: "x", type: "string" })];

//   const argBindings = bindNamedArgs(args, params);

//   assertIsError(t, argBindings, "wrongArgumentType", {
//     parameter: "x",
//     value: 42,
//     expectedType: "string",
//   });
// });

// test("Binding an argument to an optional parameter yields a single binding of that argument", (t) => {
//   const args = kpobject(["x", 42]);
//   const params = [toKpobject({ name: "x", defaultValue: 73 })];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject(["x", 42]));
// });

// test("Binding no arguments to an optional parameter yields a single binding of the default value", (t) => {
//   const args = kpobject();
//   const params = [toKpobject({ name: "x", defaultValue: 73 })];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject(["x", 73]));
// });

// test("Binding an optional argument to a parameter yields a single binding of that argument", (t) => {
//   const args = kpobject(["x", kpobject(["#optional", 42])]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject(["x", 42]));
// });

// test("Binding an optional argument to no parameters yields no bindings", (t) => {
//   const args = kpobject(["x", kpobject(["#optional", 42])]);
//   const params = [];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject());
// });

// test("Binding the wrong optional argument to one parameter yields a missing argument error", (t) => {
//   const args = kpobject(["y", kpobject(["#optional", 42])]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   assertIsError(t, argBindings, "missingArgument", { name: "x" });
// });

// test("Binding an error value to a parameter short-circuits the binding", (t) => {
//   const args = kpobject(["x", kperror("somethingBroke")]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   assertIsError(t, argBindings, "somethingBroke");
// });

// test("Binding an error value marked as error-passing to a parameter yields a binding of the error value", (t) => {
//   const args = kpobject([
//     "x",
//     kpobject(["#errorPassing", kperror("somethingBroke")]),
//   ]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   t.assert(argBindings instanceof Map, `${argBindings} isn't a map`);
//   t.is(argBindings.size, 1);
//   assertIsError(t, argBindings.get("x"), "somethingBroke");
// });

// test("Binding an optional error value to a parameter short-circuits the binding", (t) => {
//   const args = kpobject([
//     "x",
//     kpobject(["#optional", kperror("somethingBroke")]),
//   ]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   assertIsError(t, argBindings, "somethingBroke");
// });

// test("Binding an optional error value to no parameters yields no bindings", (t) => {
//   const args = kpobject([
//     "x",
//     kpobject(["#optional", kperror("somethingBroke")]),
//   ]);
//   const params = [];

//   const argBindings = bindNamedArgs(args, params);

//   t.deepEqual(argBindings, kpobject());
// });

// test("Binding an optional error value marked as error-passing yields a binding of the error value", (t) => {
//   const args = kpobject([
//     "x",
//     kpobject([
//       "#optional",
//       kpobject(["#errorPassing", kperror("somethingBroke")]),
//     ]),
//   ]);
//   const params = ["x"];

//   const argBindings = bindNamedArgs(args, params);

//   t.assert(argBindings instanceof Map, `${argBindings} isn't a map`);
//   t.is(argBindings.size, 1);
//   assertIsError(t, argBindings.get("x"), "somethingBroke");
// });

// test("Binding no arguments to a rest parameter yields no bindings", (t) => {
//   const args = kpobject();
//   const params = [];
//   const restParam = "rest";

//   const argBindings = bindNamedArgs(args, params, restParam);

//   t.deepEqual(argBindings, kpobject());
// });

// test("Binding one argument to a rest parameter yields a single binding for that argument", (t) => {
//   const args = kpobject(["x", 42]);
//   const params = [];
//   const restParam = "rest";

//   const argBindings = bindNamedArgs(args, params, restParam);

//   t.deepEqual(argBindings, kpobject(["x", 42]));
// });

// test("Binding two arguments to a rest parameter yields bindings for both arguments", (t) => {
//   const args = kpobject(["x", 42], ["y", 73]);
//   const params = [];
//   const restParam = "rest";

//   const argBindings = bindNamedArgs(args, params, restParam);

//   t.deepEqual(argBindings, kpobject(["x", 42], ["y", 73]));
// });

// test("Binding two arguments to a typed rest parameter yields bindings for both arguments", (t) => {
//   const args = kpobject(["x", 42], ["y", 73]);
//   const params = [];
//   const restParam = toKpobject({ name: "rest", type: "number" });

//   const argBindings = bindNamedArgs(args, params, restParam);

//   t.deepEqual(argBindings, kpobject(["x", 42], ["y", 73]));
// });

// test("Binding an argument of the wrong type to a rest parameter yields a wrong argument type error", (t) => {
//   const args = kpobject(["x", 42], ["y", "foo"]);
//   const params = [];
//   const restParam = toKpobject({ name: "rest", type: "number" });

//   const argBindings = bindNamedArgs(args, params, restParam);

//   assertIsError(t, argBindings, "wrongArgumentType", {
//     parameter: "rest",
//     value: "foo",
//     expectedType: "number",
//   });
// });
