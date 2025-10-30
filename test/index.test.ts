import test from "ava";
import * as tsdModule from "tsd";
import {
  arrayOf,
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
        { posParams: [{ name: "name", type: stringClass }] },
        ([name]) => `Hello, ${name}!`
      ),
    ],
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, "Hello, world!");
});

test("Can statically check the types of a platform function's parameters", (t) => {
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
        { posParams: [{ name: "n", type: numberClass }] },
        ([n]) => n + 1
      ),
    ],
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, 43);
});

test("Can check types of positional rest parameters", (t) => {
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
      {
        type: "literal",
        value: 73,
      },
    ],
  };
  const fooModule = new Map([
    [
      "bar",
      platformFunction<{ posRest: number }>(
        "bar",
        { posParams: [{ rest: { name: "n", type: arrayOf(numberClass) } }] },
        ([args]) => args.length
      ),
    ],
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, 2);
});
