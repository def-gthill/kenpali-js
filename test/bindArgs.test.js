import test from "ava";
// import kperror from "../src/kperror.js";
import { literal } from "../src/kpast.js";
import {
  bindArgs,
  normalizeAllArgs,
  normalizeAllParams,
} from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";
import assertIsError from "./assertIsError.js";

test("Binding no arguments to no parameters yields no bindings", (t) => {
  const args = argObjects();
  const params = paramObjects();

  const argBindings = bindArgs(args, params);

  t.deepEqual(argBindings, bindings());
});

test("Binding one argument to one parameter yields one binding", (t) => {
  const args = argObjects({ args: [literal(42)] });
  const params = paramObjects({ params: ["x"] });

  const argBindings = bindArgs(args, params);

  t.deepEqual(argBindings, bindings(["x", literal(42)]));
});

test("Binding no arguments to one parameter yields a missing argument error", (t) => {
  const args = argObjects();
  const params = paramObjects({ params: ["x"] });

  const argBindings = bindArgs(args, params);

  assertIsError(t, argBindings, "missingArgument", { name: "x" });
});

// test("Binding one argument to no parameters yields an unexpected argument error", (t) => {
//   const args = [42];
//   const params = [];

//   const argBindings = bindArgs(args, params);

//   assertIsError(t, argBindings, "unexpectedArgument", {
//     position: 1,
//     value: 42,
//   });
// });

// test("Binding an argument to a typed parameter yields an array of that argument", (t) => {
//   const args = [42];
//   const params = [toKpobject({ name: "x", type: "number" })];

//   const argBindings = bindArgs(args, params);

//   t.deepEqual(argBindings, [42]);
// });

// test("Binding an argument of the wrong type yields a wrong argument type error", (t) => {
//   const args = [42];
//   const params = [toKpobject({ name: "x", type: "string" })];

//   const argBindings = bindArgs(args, params);

//   assertIsError(t, argBindings, "wrongArgumentType", {
//     parameter: "x",
//     value: 42,
//     expectedType: "string",
//   });
// });

// test("Binding an argument to an optional parameter yields an array of that argument", (t) => {
//   const args = [42];
//   const params = [toKpobject({ name: "x", defaultValue: 73 })];

//   const argBindings = bindArgs(args, params);

//   t.deepEqual(argBindings, [42]);
// });

// test("Binding no arguments to an optional parameter yields an array of the default value", (t) => {
//   const args = [];
//   const params = [toKpobject({ name: "x", defaultValue: 73 })];

//   const argBindings = bindArgs(args, params);

//   t.deepEqual(argBindings, [73]);
// });

// test("Binding an optional argument to a parameter yields an array of that argument", (t) => {
//   const args = [kpobject(["#optional", 42])];
//   const params = ["x"];

//   const argBindings = bindArgs(args, params);

//   t.deepEqual(argBindings, [42]);
// });

// test("Binding an optional argument to no parameters yields an empty array", (t) => {
//   const args = [kpobject(["#optional", 42])];
//   const params = [];

//   const argBindings = bindArgs(args, params);

//   t.deepEqual(argBindings, []);
// });

// test("Binding an error value to a parameter short-circuits the binding", (t) => {
//   const args = [kperror("somethingBroke")];
//   const params = ["x"];

//   const argBindings = bindArgs(args, params);

//   assertIsError(t, argBindings, "somethingBroke");
// });

// test("Binding an error value marked as error-passing to a parameter yields an array containing the error value", (t) => {
//   const args = [kpobject(["#errorPassing", kperror("somethingBroke")])];
//   const params = ["x"];

//   const argBindings = bindArgs(args, params);

//   t.assert(Array.isArray(argBindings), `${argBindings} isn't an array`);
//   t.is(argBindings.length, 1);
//   assertIsError(t, argBindings[0], "somethingBroke");
// });

// test("Binding an optional error value to a parameter short-circuits the binding", (t) => {
//   const args = [kpobject(["#optional", kperror("somethingBroke")])];
//   const params = ["x"];

//   const argBindings = bindArgs(args, params);

//   assertIsError(t, argBindings, "somethingBroke");
// });

// test("Binding an optional error value to no parameters yields an empty array", (t) => {
//   const args = [kpobject(["#optional", kperror("somethingBroke")])];
//   const params = [];

//   const argBindings = bindArgs(args, params);

//   t.deepEqual(argBindings, []);
// });

// test("Binding an optional error value marked as error-passing yields an array containing the error value", (t) => {
//   const args = [
//     kpobject([
//       "#optional",
//       kpobject(["#errorPassing", kperror("somethingBroke")]),
//     ]),
//   ];
//   const params = ["x"];

//   const argBindings = bindArgs(args, params);

//   t.assert(Array.isArray(argBindings), `${argBindings} isn't an array`);
//   t.is(argBindings.length, 1);
//   assertIsError(t, argBindings[0], "somethingBroke");
// });

test("Binding no arguments to a rest parameter yields a binding to an empty array", (t) => {
  const args = argObjects();
  const params = paramObjects({ restParam: "rest" });

  const argBindings = bindArgs(args, params);

  t.deepEqual(argBindings, bindings(["rest", []]));
});

test("Binding one argument to a rest parameter yields a binding to an array containing that argument", (t) => {
  const args = argObjects({ args: [literal(42)] });
  const params = paramObjects({ restParam: "rest" });

  const argBindings = bindArgs(args, params);

  t.deepEqual(argBindings, bindings(["rest", [literal(42)]]));
});

// test("Binding two arguments to a rest parameter yields an array of those arguments", (t) => {
//   const args = [42, 73];
//   const params = [];
//   const restParam = "rest";

//   const argBindings = bindArgs(args, params, restParam);

//   t.deepEqual(argBindings, [42, 73]);
// });

// test("Binding two arguments to a typed rest parameter yields an array of those arguments", (t) => {
//   const args = [42, 73];
//   const params = [];
//   const restParam = toKpobject({ name: "rest", type: "number" });

//   const argBindings = bindArgs(args, params, restParam);

//   t.deepEqual(argBindings, [42, 73]);
// });

// test("Binding an argument of the wrong type to a rest parameter yields a wrong argument type error", (t) => {
//   const args = [42, "foo"];
//   const params = [];
//   const restParam = toKpobject({ name: "rest", type: "number" });

//   const argBindings = bindArgs(args, params, restParam);

//   assertIsError(t, argBindings, "wrongArgumentType", {
//     parameter: "rest",
//     value: "foo",
//     expectedType: "number",
//   });
// });

test("Binding one named argument to one named parameter yields one binding", (t) => {
  const args = argObjects({ namedArgs: kpobject(["x", literal(42)]) });
  const params = paramObjects({ namedParams: ["x"] });

  const argBindings = bindArgs(args, params);

  t.deepEqual(argBindings, bindings(["x", literal(42)]));
});

test("Binding no arguments to a named rest parameter yields a binding to an empty object", (t) => {
  const args = argObjects();
  const params = paramObjects({ namedRestParam: "rest" });

  const argBindings = bindArgs(args, params);

  t.deepEqual(argBindings, bindings(["rest", kpobject()]));
});

test("Binding one argument to a named rest parameter yields a binding to an object containing that argument", (t) => {
  const args = argObjects({ namedArgs: kpobject(["x", literal(42)]) });
  const params = paramObjects({ namedRestParam: "rest" });

  const argBindings = bindArgs(args, params);

  t.deepEqual(argBindings, bindings(["rest", kpobject(["x", literal(42)])]));
});

function argObjects({ args, namedArgs } = {}) {
  const allArgs = { args: args ?? [], namedArgs: namedArgs ?? kpobject() };
  return normalizeAllArgs(allArgs);
}

function paramObjects({ params, restParam, namedParams, namedRestParam } = {}) {
  const allParams = {
    params: params ?? [],
    restParam: restParam ?? null,
    namedParams: namedParams ?? [],
    namedRestParam: namedRestParam ?? null,
  };
  return normalizeAllParams(allParams);
}

function bindings(...entries) {
  return kpobject(...entries);
}
