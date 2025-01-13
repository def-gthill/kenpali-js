import test from "ava";
import { kpcatch } from "../src/kperror.js";
import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";
import kpparse from "../src/kpparse.js";
import { assertIsError } from "./assertIsError.js";

test("A function can be called with spread positional arguments", (t) => {
  const code = "arr = [1, 2, 3]; plus(*arr)";
  const result = kpeval(kpparse(code));
  t.is(result, 6);
});

test("A function can be defined with a rest parameter", (t) => {
  const code = "foo = (*args) => length(args); foo(42, 97)";
  const result = kpeval(kpparse(code));
  t.is(result, 2);
});

test("Returning the named rest parameter returns the arguments bundled into an array", (t) => {
  const code = "foo = (*args) => args; foo(42, 97)";
  const result = kpeval(kpparse(code));
  t.deepEqual(result, [42, 97]);
});

test("The object spread operator merges objects", (t) => {
  const code = "o1 = {foo: 1, bar: 2}; o2 = {bar: 3, baz: 4}; {**o1, **o2}";
  const result = kpeval(kpparse(code));
  t.deepEqual(result, kpobject(["foo", 1], ["bar", 3], ["baz", 4]));
});

test("A function can be called with spread named arguments", (t) => {
  const code =
    "options = {then: () => 1, else: () => 2}; [if(true, **options), if(false, **options)]";
  const result = kpeval(kpparse(code));
  t.deepEqual(result, [1, 2]);
});

test("A function can be defined with a named rest parameter", (t) => {
  const code = "foo = (**namedArgs) => namedArgs @ bar:; foo(bar: 42)";
  const result = kpeval(kpparse(code));
  t.is(result, 42);
});

test("A wrong argument type error doesn't have a rest detail", (t) => {
  const code = `1 | plus("two")`;
  const result = kpcatch(() => kpeval(kpparse(code)));
  assertIsError(t, result, "wrongArgumentType");
  t.false(result.details.has("rest"));
});

test("Errors short-circuit through the @ operator", (t) => {
  const code = `1 | plus("two") @ "three"`;
  const result = kpcatch(() => kpeval(kpparse(code)));
  assertIsError(t, result, "wrongArgumentType");
});

test("Using a name before it's assigned throws an error", (t) => {
  const code = `foo = bar; bar = 42; foo | plus(3)`;
  const result = kpcatch(() => kpeval(kpparse(code)));
  assertIsError(t, result, "nameUsedBeforeAssignment");
});

test("Destructuring can reference other names in the same scope", (t) => {
  const code = `foo = [42, 97]; [bar, baz] = foo; bar | plus(baz)`;
  const result = kpeval(kpparse(code));
  t.is(result, 139);
});

test("A time limit can be set on execution", (t) => {
  const code = `1 | build(| increment) | toArray`;
  const result = kpcatch(() =>
    kpeval(kpparse(code), { timeLimitSeconds: 0.1 })
  );
  assertIsError(t, result, "timeLimitExceeded");
});

test("The time limit can't be subverted just by catching the error", (t) => {
  const code = `1 | build(| increment !) | toArray`;
  const result = kpcatch(() =>
    kpeval(kpparse(code), { timeLimitSeconds: 0.1 })
  );
  assertIsError(t, result, "timeLimitExceeded");
});

test("Debug logging can be configured", (t) => {
  const code = `1 | build(| times(2)) | while(| debug | isLessThan(100)) | toArray`;
  const debugLog = [];
  const result = kpeval(kpparse(code), { debugLog: (s) => debugLog.push(s) });
  t.deepEqual(result, [1, 2, 4, 8, 16, 32, 64]);
  t.deepEqual(debugLog, ["1", "2", "4", "8", "16", "32", "64", "128"]);
});
