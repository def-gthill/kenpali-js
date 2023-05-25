import kpobject from "./kpobject.js";

export const rawBuiltins = {
  plus: (args) => args.reduce((acc, value) => acc + value, 0),
  negative: ([x]) => -x,
  times: (args) => args.reduce((acc, value) => acc * value, 1),
  oneOver: ([x]) => 1 / x,
  divideWithRemainder: ([a, b]) =>
    kpobject(["quotient", Math.floor(a / b)], ["remainder", ((a % b) + b) % b]),
  equals([a, b]) {
    if (this.typeOf([a]) === "array" && this.typeOf([b]) === "array") {
      if (a.length !== b.length) {
        return false;
      }
      return a.map((a_i, i) => this.equals([a_i, b[i]])).every((x) => x);
    } else if (this.typeOf([a]) === "object" && this.typeOf([b]) === "object") {
      if (a.size !== b.size) {
        return false;
      }
      for (const [key, value] of a) {
        if (!this.equals([value, b.get(key)])) {
          return false;
        }
      }
      return true;
    } else {
      return a === b;
    }
  },
  isLessThan([a, b]) {
    return a < b;
  },
  typeOf([value]) {
    if (value === null) {
      return "null";
    } else if (Array.isArray(value)) {
      return "array";
    } else {
      return typeof value;
    }
  },
};

export const builtins = kpobject(
  ...Object.entries(rawBuiltins).map(([name, f]) => [name, f.bind(rawBuiltins)])
);
