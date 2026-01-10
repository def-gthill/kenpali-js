// Command line interface for Kenpali.

import { Buffer } from "node:buffer";
import fs from "node:fs";
import { main, UsageError } from "./cli.js";
import { display } from "./interop.js";
import { KenpaliError } from "./kperror.js";

try {
  console.log(
    main(process.argv.slice(2), {
      readTextFile: (file) => fs.readFileSync(file, "utf8"),
      writeTextFile: (file, content) => fs.writeFileSync(file, content),
      readBinaryFile: (file) => fs.readFileSync(file).buffer,
      writeBinaryFile: (file, content) =>
        fs.writeFileSync(file, Buffer.from(content)),
    })
  );
} catch (error) {
  if (error instanceof KenpaliError) {
    console.error(display(error.error));
  } else if (error instanceof UsageError) {
    console.error(error.message);
  } else {
    throw error;
  }
  process.exit(1);
}
