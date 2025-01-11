export class Stream {}

class FullStream extends Stream {
  constructor(value, next) {
    super();
    this.value = value;
    this.next = () => {
      if (this.nextRef === null) {
        this.nextRef = next();
      }
      return this.nextRef;
    };
    this.nextRef = null;
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
