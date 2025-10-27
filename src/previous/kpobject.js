import { isArray, isFunction, isInstance, isObject } from "./values.js";

export default function kpobject(...entries) {
  return new Map(entries);
}

export function toKpobject(object) {
  return kpobject(...Object.entries(object));
}

export function deepToKpobject(value) {
  if (value === null) {
    return value;
  } else if (isArray(value)) {
    return value.map(deepToKpobject);
  } else if (isFunction(value) || isObject(value) || isInstance(value)) {
    return value;
  } else if (typeof value === "object") {
    return kpoMap(toKpobject(value), ([key, value]) => [
      key,
      deepToKpobject(value),
    ]);
  } else {
    return value;
  }
}

export function toJsObject(kpo) {
  return Object.fromEntries([...kpo]);
}

export function deepToJsObject(value) {
  if (value === null) {
    return value;
  } else if (Array.isArray(value)) {
    return value.map(deepToJsObject);
  } else if (value instanceof Map) {
    return toJsObject(
      kpoMap(value, ([key, value]) => [key, deepToJsObject(value)])
    );
  } else {
    return value;
  }
}

export function kpoEntries(kpo) {
  return [...kpo];
}

export function kpoKeys(kpo) {
  return [...kpo.keys()];
}

export function kpoValues(kpo) {
  return [...kpo.values()];
}

export function kpoSet(kpo, key, newValue) {
  return new Map([...kpo, [key, newValue]]);
}

export function kpoUpdate(kpo, key, f) {
  return kpoSet(kpo, key, f(kpo.get(key)));
}

export function kpoMap(kpo, f) {
  return new Map([...kpo].map(f));
}

export function kpoFilter(kpo, f) {
  return new Map([...kpo].filter(f));
}

export function kpoMerge(...kpos) {
  return new Map(
    [].concat.apply(
      [],
      kpos.map((kpo) => [...kpo])
    )
  );
}
