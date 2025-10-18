import test from "ava";
import {
  args,
  array,
  arraySpread,
  at,
  bang,
  entry,
  group,
  literal,
  mixedArgList,
  name,
  object,
  objectSpread,
  pipe,
  pipeline,
} from "../src/kpast.js";
import { kpcatch } from "../src/kperror.js";
import { kpparseSugared } from "../src/kpparse.js";
import { assertIsError } from "./assertIsError.js";

test("Variables can have names starting with literal keywords", (t) => {
  const code = `trueValue`;
  const result = kpparseSugared(code);
  t.deepEqual(result, name("trueValue"));
});

test("Object key syntactic sugar parses to reflect the sugar", (t) => {
  const code = `{foo: 1, "bar": 2, (baz): 3}`;
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    object(
      entry(name("foo"), literal(1)),
      entry(literal("bar"), literal(2)),
      entry(group(name("baz")), literal(3))
    )
  );
});

test("An expression in parentheses parses to a group node", (t) => {
  const code = "(42)";
  const result = kpparseSugared(code);
  t.deepEqual(result, group(literal(42)));
});

test("A pipeline parses to a pipeline node", (t) => {
  const code = "a | b ! @ c !";
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    pipeline(name("a"), pipe(name("b")), bang(), at(name("c")), bang())
  );
});

test("An array spread operator in an array parses to an arraySpread node", (t) => {
  const code = "[1, *foo, 3]";
  const result = kpparseSugared(code);
  t.deepEqual(result, array(literal(1), arraySpread(name("foo")), literal(3)));
});

test("An array spread operator in an argument list parses to an arraySpread node", (t) => {
  const code = "foo(1, *bar, 3)";
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    pipeline(
      name("foo"),
      args(mixedArgList([literal(1), arraySpread(name("bar")), literal(3)]))
    )
  );
});

test("An object spread operator parses to an objectSpread node", (t) => {
  const code = "{question: 42, **foo}";
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    object(entry(name("question"), literal(42)), objectSpread(name("foo")))
  );
});

test("An object spread operator in an argument list parses to an objectSpread node", (t) => {
  const code = "foo(question: 42, **foo)";
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    pipeline(
      name("foo"),
      args(
        mixedArgList([
          entry(name("question"), literal(42)),
          objectSpread(name("foo")),
        ])
      )
    )
  );
});

test("The semicolon between the definitions and result is mandatory", (t) => {
  const code = "foo = 42 foo";
  const result = kpcatch(() => kpparseSugared(code));
  assertIsError(t, result, "missingStatementSeparator", {
    line: 1,
    column: 10,
  });
});

test("A failed parse reports the farthest position reached", (t) => {
  const code = "foo = [42, 97}";
  const result = kpcatch(() => kpparseSugared(code));
  assertIsError(t, result, "unclosedArray", { line: 1, column: 14 });
});

test("Missing semicolons inside functions produce helpful errors", (t) => {
  const code = "() => (foo = 42 foo)";
  const result = kpcatch(() => kpparseSugared(code));
  assertIsError(t, result, "unclosedParameters", { line: 1, column: 17 });
});
