import test from "ava";
import { kpcall, toKpFunction } from "../src/interop.js";
import {
  calling,
  defining,
  given,
  indexing,
  literal,
  name,
} from "../src/kpast.js";
import kperror, { kpcatch } from "../src/kperror.js";
import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import { assertIsError } from "./assertIsError.js";

test("We can call a Kenpali function from JavaScript using kpcall", (t) => {
  const kpf = kpeval(given({}, literal(42)));

  const result = kpcall(kpf, [], {});

  t.is(result, 42);
});

test("Positional arguments are sent to the Kenpali function", (t) => {
  const kpf = kpeval(
    given(
      { params: ["x", "y"] },
      calling(name("times"), [name("x"), calling(name("up"), [name("y")])])
    )
  );

  const result = kpcall(kpf, [3, 4], {});

  t.is(result, 15);
});

test("Positional arguments are bound to rest parameters on the Kenpali function", (t) => {
  const kpf = kpeval(
    given(
      { params: [{ rest: "rest" }] },
      calling(name("length"), [name("rest")])
    )
  );

  const result = kpcall(kpf, [1, "a", [], null], {});

  t.is(result, 4);
});

test("Named arguments are sent to the Kenpali function", (t) => {
  const kpf = kpeval(
    given(
      { params: ["base"], namedParams: ["multiplier", "bonus"] },
      calling(name("plus"), [
        calling(name("times"), [name("base"), name("multiplier")]),
        name("bonus"),
      ])
    )
  );

  const result = kpcall(kpf, [3], { bonus: 4, multiplier: 5 });

  t.is(result, 19);
});

test("Kenpali parameter defaults can reference names from the context", (t) => {
  const kpf = kpeval(
    defining(
      ["a", literal(5)],
      given(
        { params: ["x", { name: "y", defaultValue: name("a") }] },
        calling(name("times"), [name("x"), name("y")])
      )
    )
  );

  const result = kpcall(kpf, [3], {});

  t.is(result, 15);
});

test("Errors thrown in Kenpali are thrown from kpcall", (t) => {
  const kpf = kpeval(
    given({ params: ["i"] }, indexing(literal("foo"), name("i")))
  );

  const result = kpcatch(() => kpcall(kpf, ["bar"], {}));

  assertIsError(t, result, "wrongType");
});

test("A time limit can be set on a kpcall", (t) => {
  const code = "() => 1 | build(| up) | toArray";
  const kpf = kpeval(kpparse(code));

  const result = kpcatch(() => kpcall(kpf, [], {}, { timeLimitSeconds: 0.1 }));

  assertIsError(t, result, "timeLimitExceeded");
});

test("We can pass a JavaScript callback to a Kenpali function using kpcall", (t) => {
  const kpf = kpeval(
    given({ params: ["callback"] }, calling(name("callback")))
  );
  const callback = toKpFunction(() => 42);

  const result = kpcall(kpf, [callback], {});

  t.is(result, 42);
});

test("A JavaScript callback can accept positional arguments", (t) => {
  const kpf = kpeval(
    given(
      { params: ["callback"] },
      calling(name("callback"), [literal(3), literal(4)])
    )
  );
  const callback = toKpFunction(([x, y]) => x * (y + 1));

  const result = kpcall(kpf, [callback], {});

  t.is(result, 15);
});

test("A JavaScript callback can accept named arguments", (t) => {
  const kpf = kpeval(
    given(
      { params: ["callback"] },
      calling(
        name("callback"),
        [literal(3)],
        [
          ["bonus", literal(4)],
          ["multiplier", literal(5)],
        ]
      )
    )
  );
  const callback = toKpFunction(
    ([base], { multiplier, bonus }) => base * multiplier + bonus
  );

  const result = kpcall(kpf, [callback], {});

  t.is(result, 19);
});

test("An error thrown by a JavaScript callback throws in Kenpali", (t) => {
  const kpf = kpeval(
    given(
      { params: ["callback"] },
      calling(name("plus"), [calling(name("callback")), literal(42)])
    )
  );
  const callback = toKpFunction(() => {
    throw kperror("someError");
  });

  const result = kpcatch(() => kpcall(kpf, [callback], {}));

  assertIsError(t, result, "someError");
});

test("A JavaScript callback can call a Kenpali callback using kpcallback", (t) => {
  const code = "(callback) => callback(() => 42)";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(([callback], _, kpcallback) =>
    kpcallback(callback, [], {})
  );

  const result = kpcall(kpf, [callback], {});

  t.is(result, 42);
});

test("A time kpcall time limit is enforced through nested callbacks", (t) => {
  const code = "(callback) => callback(() => 1 | build(| up) | toArray)";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(([callback], _, kpcallback) =>
    kpcallback(callback, [], {})
  );

  const result = kpcatch(() =>
    kpcall(kpf, [callback], {}, { timeLimitSeconds: 0.1 })
  );

  assertIsError(t, result, "timeLimitExceeded");
});
