import test from "ava";
import * as tsdModule from "tsd";
import {
  kpeval,
  kpobject,
  numberClass,
  platformFunction,
  stringClass,
  type ExpressionNode,
  type KpValue,
} from "../index.js";

test("Negative TypeScript tests (from tsd)", async (t) => {
  const tsd = (tsdModule as any).default.default;
  const diagnostics = await tsd();
  t.deepEqual(diagnostics, []);
});

test("Can construct a Kenpali object", (t) => {
  const kenpaliObject = kpobject(["name", "John"], ["age", 30]);
  t.deepEqual(
    kenpaliObject,
    new Map<string, KpValue>([
      ["name", "John"],
      ["age", 30],
    ])
  );
});

test("Can define a module containing a platform function", (t) => {
  const ast: ExpressionNode = {
    type: "call",
    callee: {
      type: "name",
      name: "bar",
      from: "foo",
    },
    posArgs: [
      {
        type: "literal",
        value: "world",
      },
    ],
  };
  const fooModule = new Map([
    [
      "bar",
      platformFunction<{ pos: [string] }>(
        "bar",
        { params: [{ name: "name", type: stringClass }] },
        ([name]) => `Hello, ${name}!`
      ),
    ],
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, "Hello, world!");
});

test("Can statically check the types of the arguments to a platform function", (t) => {
  const ast: ExpressionNode = {
    type: "call",
    callee: {
      type: "name",
      name: "bar",
      from: "foo",
    },
    posArgs: [
      {
        type: "literal",
        value: 42,
      },
    ],
  };
  const fooModule = new Map([
    [
      "bar",
      platformFunction<{ pos: [number] }>(
        "bar",
        { params: [{ name: "n", type: numberClass }] },
        ([n]) => n + 1
      ),
    ],
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, 43);
});
