import { kpoEntries, toKpobject } from "./kpobject.js";

//#region Type objects

export class Instance {
  constructor(class_, properties) {
    this.class_ = class_;
    this.properties = properties;
  }
}

export class Protocol extends Instance {
  constructor(name, protocols = []) {
    const display = () => {
      return `Protocol {name: "${name}"}`;
    };
    super(undefined, { name, protocols, display });
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

export const sequenceProtocol = new Protocol("Sequence");
export const typeProtocol = new Protocol("Type");
export const instanceProtocol = new Protocol("Instance");
export const displayProtocol = new Protocol("Display");
export const anyProtocol = new Protocol("Any");

export const nullClass = new Class("Null");
export const booleanClass = new Class("Boolean");
export const numberClass = new Class("Number");
export const stringClass = new Class("String", [sequenceProtocol]);
export const arrayClass = new Class("Array", [sequenceProtocol]);
export const objectClass = new Class("Object");
export const functionClass = new Class("Function");
export const classClass = new Class("Class", [
  typeProtocol,
  instanceProtocol,
  displayProtocol,
]);
export const protocolClass = new Class("Protocol", [
  typeProtocol,
  instanceProtocol,
  displayProtocol,
]);

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

function hasProtocol(type, protocol) {
  if (protocol === anyProtocol) {
    return true;
  }
  return type.properties.protocols.some(
    (protocol_) => protocol_ === protocol || hasProtocol(protocol_, protocol)
  );
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

export function toString(value) {
  if (isArray(value)) {
    return "[" + value.map((element) => toString(element)).join(", ") + "]";
  } else if (isObject(value)) {
    return (
      "{" +
      kpoEntries(value)
        .map(([k, v]) => `${isValidName(k) ? k : `"${k}"`}: ${toString(v)}`)
        .join(", ") +
      "}"
    );
  } else if (isNaturalFunction(value)) {
    return `Function {name: "${value.name}"}`;
  } else if (isPlatformFunction(value)) {
    return `Function {name: "${functionName(value)}"}`;
  } else if (isInstance(value)) {
    if (hasProtocol(value.class_, displayProtocol)) {
      return value.properties.display();
    } else {
      return `${value.constructor.name} ${toString(toKpobject(value.properties))}`;
    }
  } else {
    return JSON.stringify(value);
  }
}

export function functionName(f) {
  return f.functionName ?? f.name ?? "<anonymous>";
}

function isValidName(string) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(string);
}

//#endregion
