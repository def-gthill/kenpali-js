import { oneOfValues } from "./validate.js";
import { equals } from "./values.js";

export function infer(node) {
  switch (node.type) {
    case "literal":
      return oneOfValues([node.value]);
    case "name":
      return node.schema ?? "any";
    case "array":
      return node.elements.map(infer);
  }
}

export function cast(known, target) {
  if (isSubset(known, target)) {
    return "any";
  } else if (overlaps(known, target)) {
    return target;
  } else {
    return "no";
  }
}

function isSubset(known, target) {
  if (equals(known, target)) {
    return true;
  } else if (target === "any") {
    return true;
  } else {
    return false;
  }
}

function overlaps(a, b) {
  if (a === "any" || b === "any") {
    return true;
  } else {
    return false;
  }
}
