import kpobject from "./kpobject.js";
import { Class } from "./values.js";

export default function kpmodule(definitions) {
  return kpobject(
    ...definitions.flatMap((definition) => {
      if (typeof definition === "function") {
        return [[definition.functionName, definition]];
      } else if (Array.isArray(definition)) {
        if (typeof definition[0] === "string") {
          return [definition];
        } else if (
          Array.isArray(definition[0]) &&
          definition[0]?.[1]?.value instanceof Class
        ) {
          const [class_, ...constructors] = definition;
          return [
            class_,
            ...constructors.map((constructor) => [
              constructor.functionName,
              constructor,
            ]),
          ];
        } else {
          throw new Error(`Invalid module definition: ${definition}`);
        }
      } else {
        throw new Error(`Invalid module definition: ${definition}`);
      }
    })
  );
}
