import test from "ava";
import { kpeval, platformFunction, stringClass } from "../index.js";

test("Can define a module containing a platform function", (t) => {
  const ast = {
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
      platformFunction(
        "bar",
        { posParams: [{ name: "name", type: stringClass }] },
        ([name]) => `Hello, ${name}!`
      ),
    ],
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, "Hello, world!");
});
