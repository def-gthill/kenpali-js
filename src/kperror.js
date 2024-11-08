import kpobject, { kpoMerge } from "./kpobject.js";
import { isError } from "./values.js";

export default function kperror(type, ...details) {
  return { error: type, details: kpobject(...details) };
}

export function errorType(err) {
  return err.error;
}

export function withErrorType(err, newType, ...newDetails) {
  return {
    error: newType,
    details: kpoMerge(err.details, kpobject(...newDetails)),
  };
}

export function withDetails(err, ...newDetails) {
  return {
    error: err.error,
    details: kpoMerge(err.details, kpobject(...newDetails)),
  };
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
