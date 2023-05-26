import test from "ava";
import kplex from "../src/kplex.js";

test(`Lexing "null" produces a null literal`, (t) => {
  assertTokensAre(t, kplex("null"), { type: "LITERAL", value: null });
});

test(`Lexing "true" produces a true literal`, (t) => {
  assertTokensAre(t, kplex("true"), { type: "LITERAL", value: true });
});

test(`Lexing "false" produces a false literal`, (t) => {
  assertTokensAre(t, kplex("false"), { type: "LITERAL", value: false });
});

test(`Lexing "0" produces a numeric literal`, (t) => {
  assertTokensAre(t, kplex("0"), { type: "LITERAL", value: 0 });
});

test(`Lexing "1" produces a numeric literal`, (t) => {
  assertTokensAre(t, kplex("1"), { type: "LITERAL", value: 1 });
});

test(`Lexing "-2.5" produces a numeric literal`, (t) => {
  assertTokensAre(t, kplex("-2.5"), { type: "LITERAL", value: -2.5 });
});

test(`Lexing text in quotes produces a string literal`, (t) => {
  assertTokensAre(t, kplex(`"foobar"`), { type: "LITERAL", value: "foobar" });
});

test(`Lexing an array expression produces bracket and comma tokens`, (t) => {
  assertTokenTypesAre(
    t,
    kplex("[1, 2, 3]"),
    "OPEN_BRACKET",
    "LITERAL",
    "COMMA",
    "LITERAL",
    "COMMA",
    "LITERAL",
    "CLOSE_BRACKET"
  );
});

function assertTokensAre(t, actual, ...expected) {
  const actualArray = [...actual].slice(0, -1);
  t.is(actualArray.length, expected.length);
  actualArray.forEach((actualToken, i) => {
    t.like(actualToken, expected[i]);
  });
}

function assertTokenTypesAre(t, actual, ...expected) {
  const actualArray = [...actual].slice(0, -1);
  t.is(actualArray.length, expected.length);
  actualArray.forEach((actualToken, i) => {
    t.is(actualToken.type, expected[i]);
  });
}
