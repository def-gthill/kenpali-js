import kperror from "./kperror.js";

export class Stream {}

class FullStream extends Stream {
  constructor(value, next) {
    super();
    this.called = false;
    this.value = (back) => {
      if (this.called && back !== this.savedBack) {
        throw kperror(
          "conflictingBack",
          ["old", wrapBackForError(this.savedBack)],
          ["new", wrapBackForError(back)]
        );
      }
      if (this.savedValue === undefined) {
        this.called = true;
        this.savedBack = back;
        this.savedValue = value(back);
      }
      return this.savedValue;
    };
    this.next = (back) => {
      if (this.called && back !== this.savedBack) {
        throw kperror(
          "conflictingBack",
          ["old", wrapBackForError(this.savedBack)],
          ["new", wrapBackForError(back)]
        );
      }
      if (this.savedNext === undefined) {
        this.called = true;
        this.savedBack = back;
        this.savedNext = next(back);
      }
      return this.savedNext;
    };
  }

  isEmpty() {
    return false;
  }
}

function wrapBackForError(back) {
  if (back === undefined) {
    return "<missing>";
  } else {
    return back;
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
