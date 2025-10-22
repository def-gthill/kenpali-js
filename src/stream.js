import {
  Class,
  displayProtocol,
  Instance,
  instanceProtocol,
  sequenceProtocol,
  toString,
} from "./values.js";

export const streamClass = new Class("Stream", [
  sequenceProtocol,
  displayProtocol,
  instanceProtocol,
]);

export class Stream extends Instance {
  constructor(properties) {
    super(streamClass, { ...properties });
  }
}

class FullStream extends Stream {
  constructor(value, next) {
    const display = (_args, _namedArgs, { kpcallback }) => {
      let current = this;
      const elements = [];
      while (current.savedValue !== undefined) {
        elements.push(toString(current.savedValue, kpcallback));
        if (current.savedNext === undefined) {
          break;
        } else {
          current = current.savedNext;
        }
      }
      const result = `Stream [${elements.join(", ")}`;
      if (current.properties.isEmpty()) {
        return result + "]";
      } else {
        return result + "...]";
      }
    };
    const value_ = () => {
      if (this.savedValue === undefined) {
        this.savedValue = value();
      }
      return this.savedValue;
    };
    const next_ = () => {
      if (this.savedNext === undefined) {
        this.savedNext = next();
      }
      return this.savedNext;
    };
    super({ isEmpty: () => false, display, value: value_, next: next_ });
  }
}

export function stream({ value, next }) {
  return new FullStream(value, next);
}

class EmptyStream extends Stream {
  constructor() {
    super({ isEmpty: () => true, display: () => "stream []" });
  }
}

export function emptyStream() {
  return new EmptyStream();
}

export function isStream(value) {
  return value instanceof Stream;
}
