# Kenpali

THIS PACKAGE IS EXPERIMENTAL AND ANY PART OF IT MAY CHANGE AT ANY TIME. DO NOT USE IT FOR ANYTHING THAT MATTERS.

This is an implementation of the [Kenpali](https://github.com/def-gthill/kenpali) minimalistic programming language in JavaScript.

## Installation

Kenpali is available as an [npm package](https://www.npmjs.com/package/kenpali). You can install it with

```
npm install --save-exact kenpali@0.18.0
```

Pinning the exact version is highly recommended, given that this package is still experimental and routinely makes backward-incompatible changes.

## Usage

### Evaluating Kenpali Expressions

This package's main exports are `kpparse`, which converts Kenpali Code to Kenpali JSON, and `kpeval`, which evaluates a Kenpali JSON expression. So the following function evaluates a Kenpali Code expression:

```javascript
import { kpeval, kpparse } from "kenpali";

function evalKenpaliCode(code) {
  const json = kpparse(code);
  return kpeval(json);
}
```

To protect against infinite loops or runaway computations, you can set a time limit on `kpeval`:

```javascript
import { kpeval, kpparse } from "kenpali";

function evalKenpaliCode(code) {
  const json = kpparse(code);
  return kpeval(json, { timeLimitSeconds: 10 });
}
```

If the computation takes more than 10 seconds, it will stop and return a `timeLimitExceeded` error.

### Calling Kenpali functions from JavaScript

Since Kenpali's data types are based on JSON, most values can be passed seamlessly back and forth between Kenpali and JavaScript. But functions work quite differently in Kenpali, and need special handling.

Suppose you let the user define a _function_ in Kenpali—often the easiest way to allow them to add custom behaviour to your application. Then `kpeval` will return a Kenpali function object, which can't be called using JavaScript's normal `()` syntax. Instead, use the `kpcall` function:

```javascript
import { kpeval, kpparse, kpcall } from "kenpali";

const code = '(name) => join(["Hello, ", name, "!"])';
const kpFunction = kpeval(kpparse(code));
const result = kpcall(kpFunction, ["world"], {});
console.log(result);
```

The `kpcall` function takes an array of positional arguments and an object of named arguments. Here's an example with a named argument instead:

```javascript
import { kpeval, kpparse, kpcall } from "kenpali";

const code = '(name:) => join(["Hello, ", name, "!"])';
const kpFunction = kpeval(kpparse(code));
const result = kpcall(kpFunction, [], { name: "world" });
console.log(result);
```

Like `kpeval`, `kpcall` accepts a time limit:

```javascript
import { kpeval, kpparse, kpcall } from "kenpali";

function applyCustomTransform(code, input) {
  const json = kpparse(code);
  const kpFunction = kpeval(json, { timeLimitSeconds: 1 });
  return kpcall(kpFunction, [input], {}, { timeLimitSeconds: 10 });
}
```

### Passing JavaScript Callbacks into Kenpali Functions

Kenpali doesn't know how to call normal JavaScript functions directly. If you need to pass a JavaScript callback to a Kenpali function, wrap it with `toKpFunction`:

```javascript
import { kpeval, kpparse, kpcall } from "kenpali";

const code = '(callback) => join(["Hello, ", callback("world"), "!"])';
const kpFunction = kpeval(kpparse(code));
const callback = toKpFunction(([word]) => word.toUpperCase());
const result = kpcall(kpFunction, [callback], {});
console.log(result);
```

### Calling Kenpali Functions inside JavaScript Callbacks

If a JavaScript callback needs to itself invoke a Kenpali callback, don't use `kpcall`, which starts a brand new interpreter session. Instead, have the JavaScript callback accept an extra `kpcallback` parameter, and use that in the same way as `kpcall`.

```javascript
import { kpeval, kpparse, kpcall } from "kenpali";

const code = '(callback) => join(["Hello, ", callback(() => "world"), "!"])';
const kpFunction = kpeval(kpparse(code));
const callback = toKpFunction(([word], {}, kpcallback) =>
  kpcallback(word, [], {}).toUpperCase()
);
const result = kpcall(kpFunction, [callback], {});
console.log(result);
```

## Contributing

See the [contributing guide](/CONTRIBUTING).
