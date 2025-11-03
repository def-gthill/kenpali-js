import kpobject, { kpoMerge } from "./kpobject.js";
import { Class, display, Instance, instanceProtocol } from "./values.js";

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

export function kptry(f, onError, onSuccess) {
  try {
    const result = f();
    if (onSuccess) {
      return onSuccess(result);
    } else {
      return result;
    }
  } catch (error) {
    if (isError(error)) {
      return onError(error);
    } else if (error instanceof KenpaliError) {
      return onError(error.error);
    } else {
      throw error;
    }
  }
}

export function kpcatch(f) {
  return kptry(
    f,
    (error) => ({ status: "error", error }),
    (result) => ({ status: "success", value: result })
  );
}

export function transformError(f, transform) {
  return kptry(
    f,
    (error) => {
      throw transform(error);
    },
    (result) => result
  );
}

export class KenpaliError extends Error {
  constructor(error, kpcallback, message = "Kenpali encountered an error") {
    super(`${message}: ${display(error, kpcallback)}`);
    this.name = this.constructor.name;
    this.error = error;
    this.kpcallback = kpcallback;
  }
}
