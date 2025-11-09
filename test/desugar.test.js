import test from "ava";
import desugar from "../src/desugar.js";
import {
  array,
  arraySpread,
  at,
  block,
  call,
  function_,
  group,
  index,
  literal,
  loosePipeline,
  name,
  object,
  pipe,
  pipelineCall,
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
    object(
      [literal("foo"), literal(1)],
      [literal("bar"), literal(2)],
      [name("baz"), literal(3)]
    )
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

test("A pipeline call desugars to an ordinary function call", (t) => {
  const expression = pipelineCall(name("x"), loosePipeline(pipe(name("f"))));
  const result = desugar(expression);
  t.deepEqual(result, call(name("f"), [name("x")]));
});

const pipeSugared = pipelineCall(name("x"), loosePipeline(pipe(name("f"))));
const pipeDesugared = call(name("f"), [name("x")]);

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
  const expression = function_(pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, function_(pipeDesugared));
});

test("Desugaring propagates through pipelines", (t) => {
  const expression = pipelineCall(
    pipeSugared,
    loosePipeline(pipe(pipeSugared), at(pipeSugared))
  );
  const result = desugar(expression);
  t.deepEqual(
    result,
    index(call(pipeDesugared, [pipeDesugared]), pipeDesugared)
  );
});
