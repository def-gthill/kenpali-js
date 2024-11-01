import { isError } from "./builtins.js";
import kpobject, { kpoMerge } from "./kpobject.js";

export default function kperror(type, ...properties) {
  return kpobject(["#error", type], ...properties);
}

export function errorType(err) {
  return err.get("#error");
}

export function withErrorType(err, newType, ...newProperties) {
  return kpoMerge(err, kperror(newType, ...newProperties));
}

export function catch_(f) {
  try {
    return f();
  } catch (error) {
    if (isError(error)) {
      return error;
    } else {
      throw error;
    }
  }
}

export function transformError(f, transform) {
  try {
    return f();
  } catch (error) {
    if (isError(error)) {
      throw transform(error);
    } else {
      throw error;
    }
  }
}

export function foldError(f, onSuccess, onFailure) {
  try {
    return onSuccess(f());
  } catch (error) {
    if (isError(error)) {
      return onFailure(error);
    } else {
      throw error;
    }
  }
}

export function errorToNull(f) {
  try {
    return f();
  } catch (error) {
    if (isError(error)) {
      return null;
    } else {
      throw error;
    }
  }
}
