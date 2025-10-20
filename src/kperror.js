import kpobject, { kpoMerge } from "./kpobject.js";
import { Class, Instance, instanceProtocol } from "./values.js";

export const errorClass = new Class("Error", [instanceProtocol]);

export class Error extends Instance {
  constructor(type, details, calls) {
    super(errorClass, { type, details, calls });
  }
}

export default function kperror(type, ...details) {
  return new Error(type, kpobject(...details), []);
}

export function isError(value) {
  return value instanceof Error;
}

export function withErrorType(err, newType, ...newDetails) {
  return new Error(
    newType,
    kpoMerge(err.properties.details, kpobject(...newDetails)),
    err.properties.calls
  );
}

export function withDetails(err, ...newDetails) {
  return new Error(
    err.properties.type,
    kpoMerge(err.properties.details, kpobject(...newDetails)),
    err.properties.calls
  );
}

export function kpcatch(f) {
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
