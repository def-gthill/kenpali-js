import test from "ava";
import desugar from "../src/desugar.js";
import {
  array,
  arraySpread,
  block,
  calling,
  catching,
  given,
  group,
  indexing,
  literal,
  name,
  object,
  pipeline,
  spread,
} from "../src/kpast.js";

test("Object key syntactic sugar desugars to standard object syntax", (t) => {
  const expression = object(
    [name("foo"), literal(1)],
    [literal("bar"), literal(2)],
    [group(name("baz")), literal(3)]
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
  const expression = pipeline(name("x"), ["BANG"]);
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
  const expression = block(["foo", pipeSugared], pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, block(["foo", pipeDesugared], pipeDesugared));
});

test("Desugaring propagates through function definitions", (t) => {
  const expression = given({}, pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, given({}, pipeDesugared));
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
    indexing(calling(pipeDesugared, [pipeDesugared]), pipeDesugared)
  );
});
