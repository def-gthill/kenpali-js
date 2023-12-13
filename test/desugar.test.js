import test from "ava";
import desugar from "../src/desugar.js";
import {
  array,
  arraySpread,
  calling,
  defining,
  errorPassing,
  given,
  literal,
  name,
  object,
  optional,
  pipeline,
  quote,
  unquote,
} from "../src/kpast.js";
import kpobject from "../src/kpobject.js";

test("A simple array desugars to itself", (t) => {
  const expression = array(literal(1), literal(2));
  const result = desugar(expression);
  t.deepEqual(result, expression);
});

test("An array containing spreads desugars to a flatten call", (t) => {
  const expression = array(literal(1), arraySpread(name("foo")), literal(3));
  const result = desugar(expression);
  t.deepEqual(
    result,
    calling(name("flatten"), [
      array(array(literal(1)), name("foo"), array(literal(3))),
    ])
  );
});

test("An array starting with a spread desugars to a flatten call", (t) => {
  const expression = array(arraySpread(name("foo")), literal(3));
  const result = desugar(expression);
  t.deepEqual(
    result,
    calling(name("flatten"), [array(name("foo"), array(literal(3)))])
  );
});

test("A forward pipe desugars to a function call", (t) => {
  const expression = pipeline(name("x"), ["PIPE", name("f")]);
  const result = desugar(expression);
  t.deepEqual(result, calling(name("f"), [name("x")]));
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
  t.deepEqual(
    result,
    calling(name("flatten"), [array(array(pipeDesugared), pipeDesugared)])
  );
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
    [pipeSugared, optional(pipeSugared), errorPassing(pipeSugared)],
    kpobject(
      ["foo", pipeSugared],
      ["bar", optional(pipeSugared)],
      ["baz", errorPassing(pipeSugared)]
    )
  );
  const result = desugar(expression);
  t.deepEqual(
    result,
    calling(
      pipeDesugared,
      [pipeDesugared, optional(pipeDesugared), errorPassing(pipeDesugared)],
      kpobject(
        ["foo", pipeDesugared],
        ["bar", optional(pipeDesugared)],
        ["baz", errorPassing(pipeDesugared)]
      )
    )
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

test("Desugaring propagates through quoting", (t) => {
  const expression = quote(pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, quote(pipeDesugared));
});

test("Desugaring propagates through unquoting", (t) => {
  const expression = unquote(pipeSugared);
  const result = desugar(expression);
  t.deepEqual(result, unquote(pipeDesugared));
});
