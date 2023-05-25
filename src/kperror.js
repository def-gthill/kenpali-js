import kpobject from "./kpobject.js";

export default function kperror(type, ...properties) {
  return kpobject(["!!error", type], ...properties);
}
