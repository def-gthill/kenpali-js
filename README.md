# Kenpali

THIS PACKAGE IS EXPERIMENTAL AND ANY PART OF IT MAY CHANGE AT ANY TIME. DO NOT USE IT FOR ANYTHING THAT MATTERS.

This is an implementation of the [Kenpali](https://github.com/def-gthill/kenpali) minimalistic programming language in JavaScript.

## Installation

Kenpali is available as an [npm package](https://www.npmjs.com/package/kenpali). You can install it with

```
npm install --save-exact kenpali@0.8.0
```

Pinning the exact version is highly recommended, given that this package is still experimental and routinely makes backward-incompatible changes.

## Usage

This package's main exports are `kpparse`, which converts Kenpali Code to Kenpali JSON, and `kpeval`, which evaluates a Kenpali JSON expression. So the following function evaluates a Kenpali Code expression:

```javascript
import { kpeval, kpparse } from "kenpali";

function evalKenpaliCode(code) {
  const json = kpparse(code);
  return kpeval(json);
}
```

Since Kenpali's data types are based on JSON, most values can be passed seamlessly back and forth between Kenpali and JavaScript. But functions work quite differently in Kenpali, so this package also exports converters—`toJsFunction` and `toKpFunction`—to translate back and forth.

If `kpeval` returns a function, you have to wrap it in `toJsFunction` in order to call it from JavaScript:

```javascript
import { kpeval, kpparse, toJsFunction } from "kenpali";

const code = '(name) => join(["Hello, ", name, "!"])';
const kpFunction = kpeval(kpparse(code));
const jsFunction = toJsFunction(kpFunction);
const result = jsFunction("world");
console.log(result);
```

If the Kenpali function has named parameters, the JavaScript wrapper expects the corresponding arguments to be passed in an object as the last argument:

```javascript
import { kpeval, kpparse, toJsFunction } from "kenpali";

const code = '(name:) => join(["Hello, ", name, "!"])';
const kpFunction = kpeval(kpparse(code));
const jsFunction = toJsFunction(kpFunction);
const result = jsFunction({ name: "world" });
console.log(result);
```

## Contributing

See the [contributing guide](/CONTRIBUTING).
