import test from "ava";
import {
  kpeval,
  kpmodule,
  kpobject,
  kpparse,
  platformFunction,
  stringClass,
} from "../index.js";
import { kpparseModule } from "../src/kpparse.js";

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

test("We can create a module containing a natural function", (t) => {
  const code = `foo/bar("world")`;
  const module = kpmodule(
    kpparseModule(`bar = (name) => ["Hello, ", name, "!"] | join;`)
  );

  const result = kpeval(kpparse(code), { modules: kpobject(["foo", module]) });
  t.is(result, "Hello, world!");
});

test("Natural functions in a module can call platform functions in the same module", (t) => {
  const code = `foo/bar("world")`;
  const module = kpmodule([
    platformFunction(
      "baz",
      { posParams: [{ name: "name", type: stringClass }] },
      (name) => `Hello, ${name}`
    ),
    ...kpparseModule(`bar = (name) => [baz(name), "!"] | join;`),
  ]);

  const result = kpeval(kpparse(code), { modules: kpobject(["foo", module]) });
  t.is(result, "Hello, world!");
});

test("Natural functions in a module can call other natural functions in the same module", (t) => {
  const code = `foo/bar("world")`;
  const module = kpmodule(
    kpparseModule(
      `baz = (name) => ["Hello, ", name] | join; bar = () => [baz("world"), "!"] | join;`
    )
  );

  const result = kpeval(kpparse(code), { modules: kpobject(["foo", module]) });
  t.is(result, "Hello, world!");
});
