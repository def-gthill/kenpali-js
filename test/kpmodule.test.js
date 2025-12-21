import test from "ava";
import {
  kpeval,
  kpmodule,
  kpobject,
  kpparse,
  platformFunction,
  stringClass,
} from "../index.js";

test("We can create a module", (t) => {
  const code = `foo/bar("world")`;
  const module = kpmodule([
    platformFunction(
      "bar",
      { posParams: [{ name: "name", type: stringClass }] },
      (name) => `Hello, ${name}!`
    ),
  ]);

  const result = kpeval(kpparse(code), { modules: kpobject(["foo", module]) });
  t.is(result, "Hello, world!");
});
