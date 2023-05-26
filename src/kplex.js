const r = String.raw;

const tokenSpec = [
  // Literals
  ["NULL", "null"],
  ["FALSE", "false"],
  ["TRUE", "true"],
  ["NUMBER", r`-?(0|[1-9](\d*))(.\d+)?([Ee][+-]?\d+)?`],
  ["STRING", r`"(\\"|[^"])*"`],
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
  ["PIPE", r`\|`],
  ["AT", "@"],
  ["DOT", r`\.`],
  ["QUESTION_MARK", r`\?`],
  // Other
  ["NAME", "[A-Za-z][A-Za-z0-9]*"],
  ["NEWLINE", r`\r\n|\r|\n`],
  ["WHITESPACE", r`[ \t]+`],
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
  let lastText;

  while ((mo = re.exec(code)) !== null) {
    let [kind, text] = Object.entries(mo.groups).find(([_, value]) => value);
    lastText = text;
    let value = null;
    let column = mo.index - lineStart;

    if (kind === "NULL") {
      kind = "LITERAL";
    } else if (kind === "FALSE") {
      kind = "LITERAL";
      value = false;
    } else if (kind === "TRUE") {
      kind = "LITERAL";
      value = true;
    } else if (kind === "NUMBER") {
      kind = "LITERAL";
      value = JSON.parse(lastText);
    } else if (kind === "STRING") {
      kind = "LITERAL";
      value = JSON.parse(lastText);
    } else if (kind === "NEWLINE") {
      lineStart = mo.end();
      lineNum += 1;
      continue;
    } else if (kind === "WHITESPACE") {
      continue;
    }
    yield { type: kind, value, text: lastText, line: lineNum, column };
  }
  yield {
    type: "EOF",
    value: null,
    text: lastText,
    line: lineNum,
    column: code.length - lineStart,
  };
}
