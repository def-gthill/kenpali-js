import test from "ava";
import {
  array,
  arraySpread,
  calling,
  group,
  literal,
  name,
  object,
  objectSpread,
  pipeline,
  unquote,
} from "../src/kpast.js";
import { kpparseSugared } from "../src/kpparse.js";

test("Variables can have names starting with literal keywords", (t) => {
  const code = `trueValue`;
  const result = kpparseSugared(code);
  t.deepEqual(result, name("trueValue"));
});

test("Object key syntactic sugar parses to reflect the sugar", (t) => {
  const code = `{foo: 1, "bar": 2, <<baz>>: 3}`;
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    object(
      [name("foo"), literal(1)],
      [literal("bar"), literal(2)],
      [unquote(name("baz")), literal(3)]
    )
  );
});

test("An expression in parentheses parses to a group node", (t) => {
  const code = "(42)";
  const result = kpparseSugared(code);
  t.deepEqual(result, group(literal(42)));
});

test("Module access parses to a module-scoped name node", (t) => {
  const code = "a.b";
  const result = kpparseSugared(code);
  t.deepEqual(result, name("b", "a"));
});

test("A pipeline parses to a pipeline node", (t) => {
  const code = "a | b ! @ c !";
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    pipeline(name("a"), ["PIPE", name("b")], "BANG", ["AT", name("c")], "BANG")
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
    calling(name("foo"), [literal(1), arraySpread(name("bar")), literal(3)])
  );
});

test("An object spread operator parses to an objectSpread node", (t) => {
  const code = "{question: 42, **foo}";
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    object([name("question"), literal(42)], objectSpread(name("foo")))
  );
});

test("An object spread operator in an argument list parses to an objectSpread node", (t) => {
  const code = "foo(question: 42, **foo)";
  const result = kpparseSugared(code);
  t.deepEqual(
    result,
    calling(
      name("foo"),
      [],
      [["question", literal(42)], objectSpread(name("foo"))]
    )
  );
});
