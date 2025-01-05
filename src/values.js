import kpobject, { kpoEntries } from "./kpobject.js";

//#region Identifying types

export function typeOf(value) {
  if (value === null) {
    return "null";
  } else if (isArray(value)) {
    return "array";
  } else if (isStream(value)) {
    return "stream";
  } else if (isObject(value)) {
    return "object";
  } else if (isBuiltin(value)) {
    return "builtin";
  } else if (isGiven(value)) {
    return "given";
  } else if (isError(value)) {
    return "error";
  } else {
    return typeof value;
  }
}

export function isNull(value) {
  return value === null;
}

export function isBoolean(value) {
  return typeof value === "boolean";
}

export function isNumber(value) {
  return typeof value === "number";
}

export function isString(value) {
  return typeof value === "string";
}

export function isArray(value) {
  return Array.isArray(value);
}

export function isStream(value) {
  return isJsObjectWithProperty(value, "next");
}

export function isBuiltin(value) {
  return (
    typeof value === "function" ||
    (isJsObjectWithProperty(value, "target") && value.isBuiltin)
  );
}

export function isGiven(value) {
  return isJsObjectWithProperty(value, "target") && !value.isBuiltin;
}

export function isError(value) {
  return isJsObjectWithProperty(value, "error");
}

export function isObject(value) {
  return value instanceof Map;
}

export function isFunction(value) {
  return isBuiltin(value) || isGiven(value);
}

export function isSequence(value) {
  return isString(value) || isArray(value) || isStream(value);
}

function isJsObjectWithProperty(value, property) {
  return value !== null && typeof value === "object" && property in value;
}

//#endregion

//#region Polymorphic functions

export function equals(a, b) {
  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.map((a_i, i) => equals(a_i, b[i])).every((x) => x);
  } else if (isObject(a) && isObject(b)) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!equals(value, b.get(key))) {
        return false;
      }
    }
    return true;
  } else {
    return a === b;
  }
}

export function toString(value, kpcallback) {
  if (isArray(value)) {
    return (
      "[" +
      value.map((element) => toString(element, kpcallback)).join(", ") +
      "]"
    );
  } else if (isStream(value)) {
    let current = value;
    const elements = [];
    if (kpcallback) {
      while (current.next !== null && elements.length < 3) {
        const [getValue, next] = current.next;
        elements.push(getValue());
        current = kpcallback(next, [], kpobject());
      }
    }
    const result = `stream [${elements.join(", ")}`;
    if (current.next === null) {
      return result + "]";
    } else {
      return result + "...]";
    }
  } else if (isObject(value)) {
    return (
      "{" +
      kpoEntries(value)
        .map(
          ([k, v]) =>
            `${isValidName(k) ? k : `"${k}"`}: ${toString(v, kpcallback)}`
        )
        .join(", ") +
      "}"
    );
  } else if (isGiven(value)) {
    return `function ${value.name}`;
  } else if (isBuiltin(value)) {
    return `function ${functionName(value)}`;
  } else if (isError(value)) {
    return [
      `error ${value.error} ${toString(value.details, kpcallback)}`,
      ...(value.calls ?? []).map((call) => `in ${call.get("function")}`),
    ].join("\n");
  } else {
    return JSON.stringify(value);
  }
}

export function functionName(f) {
  return f.builtinName ?? f.name ?? "<anonymous>";
}

function isValidName(string) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(string);
}

//#endregion
