import kpobject from "./kpobject.js";

export default function kpthrow(type, ...properties) {
  return kpobject(["#thrown", type], ...properties);
}
