export class Stream {}

class FullStream extends Stream {
  constructor(value, next) {
    super();
    this.value = () => {
      if (this.savedValue === undefined) {
        this.savedValue = value();
      }
      return this.savedValue;
    };
    this.next = () => {
      if (this.savedNext === undefined) {
        this.savedNext = next();
      }
      return this.savedNext;
    };
  }

  isEmpty() {
    return false;
  }
}

export function stream({ value, next }) {
  return new FullStream(value, next);
}

class EmptyStream extends Stream {
  isEmpty() {
    return true;
  }
}

export function emptyStream() {
  return new EmptyStream();
}
