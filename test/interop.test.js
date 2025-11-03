import test from "ava";
import { display, kpcall, toKpFunction } from "../src/interop.js";
import kperror from "../src/kperror.js";
import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import { assertThrows } from "./assertThrows.js";

test("We can call a Kenpali function from JavaScript using kpcall", (t) => {
  const code = "$ 42";
  const kpf = kpeval(kpparse(code));

  const result = kpcall(kpf, [], {});

  t.is(result, 42);
});

test("Positional arguments are sent to the Kenpali function", (t) => {
  const code = "(x, y) => x | times(y | up)";
  const kpf = kpeval(kpparse(code));

  const result = kpcall(kpf, [3, 4], {});

  t.is(result, 15);
});

test("Positional arguments are bound to rest parameters on the Kenpali function", (t) => {
  const code = "(*rest) => length(rest)";
  const kpf = kpeval(kpparse(code));

  const result = kpcall(kpf, [1, "a", [], null], {});

  t.is(result, 4);
});

test("Named arguments are sent to the Kenpali function", (t) => {
  const code =
    "(base, multiplier:, bonus:) => base | times(multiplier) | plus(bonus)";
  const kpf = kpeval(kpparse(code));

  const result = kpcall(kpf, [3], { bonus: 4, multiplier: 5 });

  t.is(result, 19);
});

test("Kenpali parameter defaults can reference names from the context", (t) => {
  const code = "a = 5; (x, y = a) => x | times(y)";
  const kpf = kpeval(kpparse(code));

  const result = kpcall(kpf, [3], {});

  t.is(result, 15);
});

test("Errors thrown in Kenpali are thrown from kpcall", (t) => {
  const code = '(i) => "foo" @ i';
  const kpf = kpeval(kpparse(code));

  assertThrows(t, () => kpcall(kpf, ["bar"], {}), "wrongType");
});

test("A time limit can be set on a kpcall", (t) => {
  const code = "() => 1 | build(| up) | toArray";
  const kpf = kpeval(kpparse(code));

  assertThrows(
    t,
    () => kpcall(kpf, [], {}, { timeLimitSeconds: 0.1 }),
    "timeLimitExceeded"
  );
});

test("We can pass a JavaScript callback to a Kenpali function using kpcall", (t) => {
  const code = "(callback) => callback()";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(() => 42);

  const result = kpcall(kpf, [callback], {});

  t.is(result, 42);
});

test("A JavaScript callback can accept positional arguments", (t) => {
  const code = "(callback) => callback(3, 4)";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(([x, y]) => x * (y + 1));

  const result = kpcall(kpf, [callback], {});

  t.is(result, 15);
});

test("A JavaScript callback can accept named arguments", (t) => {
  const code = "(callback) => callback(3, bonus: 4, multiplier: 5)";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(
    ([base], { multiplier, bonus }) => base * multiplier + bonus
  );

  const result = kpcall(kpf, [callback], {});

  t.is(result, 19);
});

test("An error thrown by a JavaScript callback throws in Kenpali", (t) => {
  const code = "(callback) => callback() | plus(42)";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(() => {
    throw kperror("someError");
  });

  assertThrows(t, () => kpcall(kpf, [callback], {}), "someError");
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

test("An error thrown by a Kenpali callback throws in JavaScript", (t) => {
  const code = '(callback) => callback(() => throw(newError("someError")))';
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(([callback], _, kpcallback) => {
    try {
      return kpcallback(callback, [], {});
    } catch (error) {
      return 42;
    }
  });

  const result = kpcall(kpf, [callback], {});

  t.is(result, 42);
});

test("A time kpcall time limit is enforced through nested callbacks", (t) => {
  const code = "(callback) => callback(() => 1 | build(| up) | toArray)";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(([callback], _, kpcallback) =>
    kpcallback(callback, [], {})
  );

  assertThrows(
    t,
    () => kpcall(kpf, [callback], {}, { timeLimitSeconds: 0.1 }),
    "timeLimitExceeded"
  );
});

test("We can call display on a Display value without explicitly passing a kpcallback", (t) => {
  const code = "newVar(42)";
  const value = kpeval(kpparse(code));

  t.is(display(value), "Var {value: 42}");
});

test("We can call display from inside a JavaScript callback", (t) => {
  const code = "(foo) => foo(bar: newVar(42))";
  const kpf = kpeval(kpparse(code));
  const callback = toKpFunction(([], { bar }, kpcallback) => {
    return display(bar, kpcallback);
  });

  const result = kpcall(kpf, [callback], {});

  t.is(result, "Var {value: 42}");
});
