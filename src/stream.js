export class Stream {}

class FullStream extends Stream {
  constructor(get) {
    super();
    this.get = (back) => {
      if (this.getRef === null) {
        this.getRef = get(back);
      } else if (back !== undefined) {
        throw kperror("duplicateStreamBack", ["value", back]);
      }
      return this.getRef;
    };
    this.getRef = null;
  }

  isEmpty() {
    return false;
  }
}

export function stream(get) {
  return new FullStream(get);
}

class EmptyStream extends Stream {
  isEmpty() {
    return true;
  }
}

export function emptyStream() {
  return new EmptyStream();
}
