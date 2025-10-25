import kpobject, { kpoMerge } from "./kpobject.js";
import { Class, Instance, instanceProtocol, toString } from "./values.js";

export const errorClass = new Class("Error", [instanceProtocol]);

export class KpError extends Instance {
  constructor(type, details, calls) {
    super(errorClass, { type, details, calls });
  }
}

export default function kperror(type, ...details) {
  return new KpError(type, kpobject(...details), []);
}

export function isError(value) {
  return value instanceof KpError;
}

export function withErrorType(err, newType, ...newDetails) {
  return new KpError(
    newType,
    kpoMerge(err.properties.details, kpobject(...newDetails)),
    err.properties.calls
  );
}

export function withDetails(err, ...newDetails) {
  return new KpError(
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
    } else if (error instanceof KenpaliError) {
      return error.error;
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
    } else if (error instanceof KenpaliError) {
      throw new KenpaliError(transform(error.error), error.kpcallback);
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
    } else if (error instanceof KenpaliError) {
      return onFailure(error.error);
    } else {
      throw error;
    }
  }
}

export function errorToNull(f) {
  try {
    return f();
  } catch (error) {
    if (isError(error) || error instanceof KenpaliError) {
      return null;
    } else {
      throw error;
    }
  }
}

/**
 * Wrapper for a Kenpali error object that extends the JavaScript Error class.
 * All public functions throw instances of this class when they encounter
 * Kenpali errors.
 *
 * @param error - The Kenpali error object.
 * @param kpcallback - The `kpcallback` function to use for evaluation.
 */
export class KenpaliError extends Error {
  constructor(error, kpcallback, message = "Kenpali encountered an error") {
    super(`${message}: ${toString(error, kpcallback)}`);
    this.name = this.constructor.name;
    this.error = error;
    this.kpcallback = kpcallback;
  }
}
