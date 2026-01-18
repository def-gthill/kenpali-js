import kpobject, { kpoEntries, toKpobject } from "./kpobject.js";

//#region Type objects

export class Instance {
  constructor(class_, properties, internals = {}) {
    for (const name in internals) {
      this[name] = internals[name];
    }
    this.class_ = class_;
    this.properties = properties;
  }
}

export class Protocol extends Instance {
  constructor(name, supers = [], accepts = () => false) {
    const display = () => {
      return `Protocol {name: "${name}"}`;
    };
    super(undefined, { name, supers, accepts, display });
    Object.defineProperty(this, "class_", {
      get() {
        return protocolClass;
      },
    });
  }
}

export class Class extends Instance {
  constructor(name, protocols = []) {
    const display = () => {
      return `Class {name: "${name}"}`;
    };
    super(undefined, { name, protocols, display });
    Object.defineProperty(this, "class_", {
      get() {
        return classClass;
      },
    });
  }
}

export const collectionProtocol = new Protocol("Collection");
export const sequenceProtocol = new Protocol("Sequence", [collectionProtocol]);
export const typeProtocol = new Protocol("Type");
export const instanceProtocol = new Protocol("Instance", [], (type) => {
  return type instanceof Class && !nonInstanceClasses.includes(type);
});
export const displayProtocol = new Protocol("Display");
export const anyProtocol = new Protocol("Any", [], () => true);

export const nullClass = new Class("Null");
export const booleanClass = new Class("Boolean");
export const numberClass = new Class("Number");
export const stringClass = new Class("String", [sequenceProtocol]);
export const arrayClass = new Class("Array", [sequenceProtocol]);
export const objectClass = new Class("Object", [collectionProtocol]);
export const functionClass = new Class("Function");
export const classClass = new Class("Class", [typeProtocol, displayProtocol]);
export const protocolClass = new Class("Protocol", [
  typeProtocol,
  displayProtocol,
]);

const nonInstanceClasses = [
  nullClass,
  booleanClass,
  numberClass,
  stringClass,
  arrayClass,
  objectClass,
  functionClass,
];

//#endregion

//#region Identifying types

export function classOf(value) {
  if (isNull(value)) {
    return nullClass;
  } else if (isBoolean(value)) {
    return booleanClass;
  } else if (isNumber(value)) {
    return numberClass;
  } else if (isString(value)) {
    return stringClass;
  } else if (isArray(value)) {
    return arrayClass;
  } else if (isObject(value)) {
    return objectClass;
  } else if (isFunction(value)) {
    return functionClass;
  } else if (isInstance(value)) {
    return value.class_;
  } else {
    throw new Error(`Not a valid Kenpali value: ${value}`);
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

export function isObject(value) {
  return value instanceof Map;
}

export function isFunction(value) {
  return isPlatformFunction(value) || isNaturalFunction(value);
}

export function isClass(value) {
  return value instanceof Class;
}

export function isProtocol(value) {
  return value instanceof Protocol;
}

export function isPlatformFunction(value) {
  return (
    (typeof value === "function" && !isInstance(value)) ||
    (isJsObjectWithProperty(value, "target") && value.isPlatform)
  );
}

export function isNaturalFunction(value) {
  return isJsObjectWithProperty(value, "target") && !value.isPlatform;
}

export function isCollection(value) {
  return hasProtocol(classOf(value), collectionProtocol);
}

export function isSequence(value) {
  return hasProtocol(classOf(value), sequenceProtocol);
}

export function isType(value) {
  return hasProtocol(classOf(value), typeProtocol);
}

export function isInstance(value) {
  return value instanceof Instance;
}

function isJsObjectWithProperty(value, property) {
  return value !== null && typeof value === "object" && property in value;
}

export function hasType(value, type) {
  if (type instanceof Class) {
    return classOf(value) === type;
  } else {
    return hasProtocol(classOf(value), type);
  }
}

export function hasProtocol(type, protocol) {
  if (protocol.properties.accepts(type)) {
    return true;
  }
  return (type.properties.protocols ?? type.properties.supers).some(
    (super_) => super_ === protocol || hasProtocol(super_, protocol)
  );
}

export function isPlatformValue(value) {
  return typeof value === "function" || value instanceof Instance;
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

/**
 * Like `display`, but throws a clear error if the value implements `Display`.
 * Useful in places where a suitable `kpcallback` isn't available, and the
 * argument is known to have a narrow range of types.
 * @param value - The value to convert to a string.
 * @returns - The string representation of the value.
 */
export function displaySimple(value) {
  return display(value, (display, posArgs, namedArgs) => {
    if (typeof display === "function") {
      // A few types, like Class and Protocol, implement `display` as a plain
      // JavaScript function, so they don't need a `kpcallback`. This is useful
      // for disassembling.
      return display(posArgs, namedArgs);
    } else {
      throw new Error(
        `Value of type ${classOf(display.self).properties.name} implements Display`
      );
    }
  });
}

export function display(value, kpcallback) {
  if (isArray(value)) {
    return (
      "[" +
      value.map((element) => display(element, kpcallback)).join(", ") +
      "]"
    );
  } else if (isObject(value)) {
    return (
      "{" +
      kpoEntries(value)
        .map(
          ([k, v]) =>
            `${isValidName(k) ? k : `"${k}"`}: ${display(v, kpcallback)}`
        )
        .join(", ") +
      "}"
    );
  } else if (isNaturalFunction(value)) {
    return `Function {name: "${value.name}"}`;
  } else if (isPlatformFunction(value)) {
    return `Function {name: "${functionName(value)}"}`;
  } else if (isInstance(value)) {
    if (hasProtocol(value.class_, displayProtocol)) {
      if (typeof value.properties.display === "function") {
        return value.properties.display([], kpobject(), { kpcallback });
      } else if (kpcallback) {
        return kpcallback(value.properties.display, [], kpobject());
      } else {
        return `${value.class_.properties.name} ${display(toKpobject(value.properties), kpcallback)}`;
      }
    } else {
      return `${value.class_.properties.name} ${display(toKpobject(value.properties), kpcallback)}`;
    }
  } else {
    return JSON.stringify(value, (key, value) =>
      key === "" ? value : display(value, kpcallback)
    );
  }
}

export function functionName(f) {
  return f.functionName ?? f.name ?? "<anonymous>";
}

function isValidName(string) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(string);
}

//#endregion
