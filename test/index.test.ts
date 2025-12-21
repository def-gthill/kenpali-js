import test, { ExecutionContext } from "ava";
import * as tsdModule from "tsd";
import {
  arrayOf,
  errorClass,
  ExpressionNode,
  kpcatch,
  kpeval,
  kpmodule,
  KpObject,
  kpobject,
  kpparse,
  kptry,
  matches,
  numberClass,
  objectOf,
  oneOfValues,
  platformClass,
  platformFunction,
  recordLike,
  satisfying,
  Schema,
  stringClass,
  tupleLike,
  validate,
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
  const code = 'foo/bar("world")';
  const ast = kpparse(code);
  const fooModule = kpmodule([
    platformFunction<{ pos: [string] }>(
      "bar",
      { posParams: [{ name: "name", type: stringClass }] },
      ([name]) => `Hello, ${name}!`
    ),
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, "Hello, world!");
});

test("Can statically check the types of a platform function's parameters", (t) => {
  const code = "foo/bar(42)";
  const ast = kpparse(code);
  const fooModule = kpmodule([
    platformFunction<{ pos: [number] }>(
      "bar",
      { posParams: [{ name: "n", type: numberClass }] },
      ([n]) => n + 1
    ),
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, 43);
});

test("Can check types of positional rest parameters", (t) => {
  const code = "foo/bar(42, 73)";
  const ast = kpparse(code);
  const fooModule = kpmodule([
    platformFunction<{ posRest: number }>(
      "bar",
      { posParams: [{ rest: { name: "n", type: arrayOf(numberClass) } }] },
      ([args]) => args.length
    ),
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, 2);
});

test("Can define a platform function that takes an enum parameter", (t) => {
  const code = 'foo/bar("red")';
  const ast = kpparse(code);
  const fooModule = kpmodule([
    platformFunction<{ pos: ["red" | "green" | "blue"] }>(
      "bar",
      {
        posParams: [
          { name: "color", type: oneOfValues(["red", "green", "blue"]) },
        ],
      },
      ([color]) => `Hello, ${color}!`
    ),
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, "Hello, red!");
});

test("Can define a platform function that checks for uniform objects", (t) => {
  const code = "foo/bar({ red: 42, green: 97 })";
  const ast = kpparse(code);
  const fooModule = kpmodule([
    platformFunction<{ pos: [KpObject<"red" | "green" | "blue", number>] }>(
      "bar",
      {
        posParams: [
          {
            name: "obj",
            type: objectOf(oneOfValues(["red", "green", "blue"]), numberClass),
          },
        ],
      },
      ([obj]) =>
        (obj.get("red") ?? 0) + (obj.get("green") ?? 0) + (obj.get("blue") ?? 0)
    ),
  ]);
  const result = kpeval(ast, {
    modules: new Map([["foo", fooModule]]),
  });
  t.is(result, 139);
});

test("Can define a platform function that checks for record shapes", (t) => {
  const code = 'foo/bar({ name: "John", age: 30 })';
  const ast = kpparse(code);
  const fooModule = kpmodule([
    platformFunction<{ pos: [KpObject<"name" | "age", string | number>] }>(
      "bar",
      {
        posParams: [
          {
            name: "obj",
            type: recordLike(
              new Map<"name" | "age", Schema<string | number>>([
                ["name", stringClass],
                ["age", numberClass],
              ])
            ),
          },
        ],
      },
      ([obj]) => `${obj.get("name")} is ${obj.get("age")} years old`
    ),
  ]);
  const result = kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  t.is(result, "John is 30 years old");
});

test("Can define a platform function that checks an arbitrary condition", (t) => {
  const fooModule = kpmodule([
    platformFunction<{ pos: [number] }>(
      "bar",
      {
        posParams: [{ name: "n", type: satisfying(numberClass, (n) => n > 0) }],
      },
      ([n]) => n + 1
    ),
  ]);

  function evalWithFoo(ast: ExpressionNode): KpValue {
    return kpeval(ast, { modules: new Map([["foo", fooModule]]) });
  }
  t.is(evalWithFoo(kpparse("foo/bar(42)")), 43);
  assertThrows(
    t,
    () => evalWithFoo(kpparse("foo/bar(-42)")),
    "badArgumentValue"
  );
});

test("Can define a module containing a platform class", (t) => {
  const code = "foo/newFoo().bar()";
  const fooModule = kpmodule([
    platformClass("Foo", {
      constructors: {
        newFoo: {
          body: ([], { getMethod }) => ({
            internals: {},
            properties: { bar: getMethod("bar") },
          }),
        },
      },
      methods: {
        bar: {
          body: () => "Hello, bar!",
        },
      },
    }),
  ]);

  const result = kpeval(kpparse(code), {
    modules: new Map([["foo", fooModule]]),
  });
  t.is(result, "Hello, bar!");
});

test("Can try a Kenpali function", (t) => {
  const code = 'throw(newError("someError"))';
  const result = kptry(
    () => kpeval(kpparse(code)),
    (error) => error.properties.type
  );
  t.is(result, "someError");
});

test("Can catch errors thrown by Kenpali code", (t) => {
  const code = 'throw(newError("someError"))';
  const result = kpcatch(() => kpeval(kpparse(code)));
  if (result.status === "error") {
    t.assert(matches(result.error, errorClass));
  } else {
    t.fail("Result is not an error");
  }
});

test("Can validate a value against a schema", (t) => {
  const value = "foo";
  const schema = numberClass;
  kptry(
    () => validate(value, schema),
    (error) => {
      t.is(error.properties.type, "wrongType");
    },
    (value) => {
      const _: number = value;
      t.fail("Validation should have failed");
    }
  );
});

test("Can validate a value against a tuple schema", (t) => {
  const value = [1, 2];
  const schema = tupleLike([numberClass, stringClass]);
  kptry(
    () => validate(value, schema),
    (error) => {
      t.is(error.properties.type, "badElement");
    },
    (value) => {
      const _: [number, string] = value;
      t.fail("Validation should have failed");
    }
  );
});

test("Can validate a value against a condition schema", (t) => {
  const value = -42;
  const schema = satisfying(numberClass, (n) => n > 0);
  kptry(
    () => validate(value, schema),
    (error) => {
      t.is(error.properties.type, "badValue");
    },
    (value) => {
      const _: number = value;
      t.fail("Validation should have failed");
    }
  );
});

function assertThrows(
  t: ExecutionContext<unknown>,
  f: () => void,
  expectedErrorType: string
) {
  kptry(f, (error) => {
    t.is(error.properties.type, expectedErrorType);
  });
}
