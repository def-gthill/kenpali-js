import test from "ava";
import desugar from "../src/desugar.js";
import {
  access,
  array,
  arraySpread,
  calling,
  catching,
  defining,
  given,
  group,
  literal,
  name,
  object,
  pipeline,
  spread,
  unquote,
} from "../src/kpast.js";

test("Object key syntactic sugar desugars to standard object syntax", (t) => {
  const expression = object(
    [name("foo"), literal(1)],
    [literal("bar"), literal(2)],
    [unquote(name("baz")), literal(3)]
  );
  const result = desugar(expression);
  t.deepEqual(
    result,
    object(["foo", literal(1)], ["bar", literal(2)], [name("baz"), literal(3)])
  );
});

test("A group desugars to its contents", (t) => {
  const expression = group(literal(42));
  const result = desugar(expression);
  t.deepEqual(result, literal(42));
});

test("Property access desugars to an at call", (t) => {
  const expression = access(name("a"), literal("b"));
  const result = desugar(expression);
  t.deepEqual(result, calling(name("at"), [name("a"), literal("b")]));
});

test("Property access by name desugars to an at call with a string literal", (t) => {
  const expression = access(name("a"), name("b"));
  const result = desugar(expression);
  t.deepEqual(result, calling(name("at"), [name("a"), literal("b")]));
});

test("Property access by unquoted expression desugars to an at call with that expression", (t) => {
  const expression = access(name("a"), unquote(name("b")));
  const result = desugar(expression);
  t.deepEqual(result, calling(name("at"), [name("a"), name("b")]));
});

test("A simple array desugars to itself", (t) => {
  const expression = array(literal(1), literal(2));
  const result = desugar(expression);
  t.deepEqual(result, expression);
});

test("A forward pipe desugars to a function call", (t) => {
  const expression = pipeline(name("x"), ["PIPE", name("f")]);
  const result = desugar(expression);
  t.deepEqual(result, calling(name("f"), [name("x")]));
});

test("A bang operator desugars to a catching node", (t) => {
  const expression = pipeline(name("x"), "BANG");
  const result = desugar(expression);
  t.deepEqual(result, catching(name("x")));
});

const pipeSugared = pipeline(name("x"), ["PIPE", name("f")]);
const pipeDesugared = calling(name("f"), [name("x")]);

test("Desugaring propagates through arrays", (t) => {
  const expression = array(pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, array(pipeDesugared));
});

test("Desugaring propagates through arrays with spread operators", (t) => {
  const expression = array(pipeSugared, arraySpread(pipeSugared));
  const result = desugar(expression);
  t.deepEqual(result, array(pipeDesugared, spread(pipeDesugared)));
});

test("Desugaring propagates through objects", (t) => {
  const expression = object([pipeSugared, pipeSugared]);
  const result = desugar(expression);
  t.deepEqual(result, object([pipeDesugared, pipeDesugared]));
});

test("Desugaring propagates through scopes", (t) => {
  const expression = defining(["foo", pipeSugared], pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, defining(["foo", pipeDesugared], pipeDesugared));
});

test("Desugaring propagates through function definitions", (t) => {
  const expression = given({}, pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, given({}, pipeDesugared));
});

test("Desugaring propagates through function calls", (t) => {
  const expression = calling(
    pipeSugared,
    [pipeSugared],
    [["foo", pipeSugared]]
  );
  const result = desugar(expression);
  t.deepEqual(
    result,
    calling(pipeDesugared, [pipeDesugared], [["foo", pipeDesugared]])
  );
});

test("Desugaring propagates through pipelines", (t) => {
  const expression = pipeline(
    pipeSugared,
    ["PIPE", pipeSugared],
    ["AT", pipeSugared]
  );
  const result = desugar(expression);
  t.deepEqual(
    result,
    calling(name("at"), [
      calling(pipeDesugared, [pipeDesugared]),
      pipeDesugared,
    ])
  );
});

test("Desugaring propagates through unquoting", (t) => {
  const expression = unquote(pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, unquote(pipeDesugared));
});
