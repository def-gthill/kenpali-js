const r = String.raw;

const tokenSpec = [
  // Literals
  ["NUMBER", r`-?(0|[1-9](\d*))(.\d+)?([Ee][+-]?\d+)?`],
  ["STRING", r`"(\\"|[^"])*"`],
  ["RAW_STRING", "`[^`]*`"],
  // Groupers
  ["OPEN_QUOTE_PAREN", r`'\(`],
  ["CLOSE_QUOTE_PAREN", r`\)'`],
  ["OPEN_PAREN", r`\(`],
  ["CLOSE_PAREN", r`\)`],
  ["OPEN_BRACKET", r`\[`],
  ["CLOSE_BRACKET", r`\]`],
  ["OPEN_BRACE", "{"],
  ["CLOSE_BRACE", "}"],
  ["OPEN_ANGLES", "<<"],
  ["CLOSE_ANGLES", ">>"],
  // Terminators
  ["COMMA", ","],
  ["SEMICOLON", ";"],
  // Operators
  ["COLON", ":"],
  ["ARROW", "=>"],
  ["EQUALS", "="],
  ["PIPE_DOT", r`\|\.`],
  ["PIPE", r`\|`],
  ["AT", "@"],
  ["DOT", r`\.`],
  ["BANG", "!"],
  ["DOLLAR", r`\$`],
  ["DOUBLE_STAR", r`\*\*`],
  ["STAR", r`\*`],
  // Other
  ["NAME", "[A-Za-z][A-Za-z0-9]*"],
  ["NEWLINE", r`\r\n|\r|\n`],
  ["WHITESPACE", r`[ \t]+`],
  ["COMMENT", r`//[^\r\n]*(\r\n|\r|\n)?`],
  ["INVALID", "."],
];

export default function* kplex(code) {
  let tokenRegex = tokenSpec
    .map((pair) => `(?<${pair[0]}>${pair[1]})`)
    .join("|");
  let lineNum = 1;
  let lineStart = 0;
  let re = new RegExp(tokenRegex, "g");
  let mo;

  while ((mo = re.exec(code)) !== null) {
    let [kind, text] = Object.entries(mo.groups).find(([_, value]) => value);
    let value = null;
    let column = mo.index - lineStart + 1;

    if (kind === "NAME") {
      if (text === "null") {
        kind = "LITERAL";
      } else if (text === "false") {
        kind = "LITERAL";
        value = false;
      } else if (text === "true") {
        kind = "LITERAL";
        value = true;
      }
    } else if (kind === "NUMBER") {
      kind = "LITERAL";
      value = JSON.parse(text);
    } else if (kind === "STRING") {
      kind = "LITERAL";
      value = JSON.parse(text);
    } else if (kind === "RAW_STRING") {
      kind = "LITERAL";
      value = text.slice(1, text.length - 1);
    } else if (kind === "NEWLINE" || kind === "COMMENT") {
      lineStart = mo.index + text.length;
      lineNum += 1;
      continue;
    } else if (kind === "WHITESPACE") {
      continue;
    }
    yield { type: kind, value, text, line: lineNum, column };
  }
  yield {
    type: "EOF",
    value: null,
    text: "",
    line: lineNum,
    column: code.length - lineStart + 1,
  };
}
