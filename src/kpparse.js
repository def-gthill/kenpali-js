import { array, literal } from "./kpast.js";
import kplex from "./kplex.js";

export default function kpparse(code) {
  const tokens = kplex(code);
  const result = kpparseTokens(tokens);
  if ("error" in result) {
    return { ...result, code };
  } else {
    return result;
  }
}

export function kpparseTokens(tokens) {
  const tokenList = [...tokens];
  const parseResult = parseAll(tokenList);
  if ("error" in parseResult) {
    return parseResult;
  } else {
    return parseResult.ast;
  }
}

function parseAll(tokens) {
  return parseAllOf(
    [parse, consume("EOF", "unparsedInput")],
    (...args) => args[0]
  )(tokens, 0);
}

function parse(tokens, start) {
  return parseAnyOf(parseArray, parseLiteral)(tokens, start);
}

function parseArray(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_BRACKET", "expectedArray"),
      parseZeroOrMore(parse, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingArraySeparator",
      }),
      consume("CLOSE_BRACKET", "unclosedArray"),
    ],
    (...args) => array(...args[0])
  )(tokens, start);
}

function parseLiteral(tokens, start) {
  return parseSingle("LITERAL", (token) => literal(token.value))(tokens, start);
}

function parseSingle(tokenType, converter) {
  return function (tokens, start) {
    if (tokens[start].type === tokenType) {
      return { ast: converter(tokens[start]), end: start + 1 };
    } else {
      return syntaxError(
        `expected${capitalizeTokenType(tokenType)}`,
        tokens,
        start
      );
    }
  };
}

function capitalizeTokenType(tokenType) {
  return tokenType.split("_").map(capitalize).join();
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1).toLowerCase();
}

function consume(tokenType, errorIfMissing) {
  return function (tokens, start) {
    if (tokens[start].type === tokenType) {
      return { end: start + 1 };
    } else {
      return syntaxError(errorIfMissing, tokens, start);
    }
  };
}

function parseAnyOf(...parsers) {
  return function (tokens, start) {
    const errors = [];
    for (const parser of parsers) {
      const result = parser(tokens, start);
      if ("error" in result) {
        errors.push(result);
      } else {
        return result;
      }
    }
    const [farthestLine, farthestColumn] = errors
      .map(pos)
      .sort(([lineA, lineB], [columnA, columnB]) =>
        lineA === lineB ? columnA - columnB : lineA - lineB
      )
      .at(-1);
    const farthestErrors = errors.filter((error) => {
      const [line, column] = pos(error);
      return line === farthestLine && column === farthestColumn;
    });
    return syntaxError("noAlternativeWorked", tokens, start, {
      errors: farthestErrors,
      // errors,
    });
  };
}

function pos(error) {
  return [error.line, error.column];
}

function parseAllOf(parsers, converter = (...args) => args) {
  return function (tokens, start) {
    const elements = [];
    let index = start;
    for (const parser of parsers) {
      const result = parser(tokens, index);
      if ("error" in result) {
        return result;
      } else {
        if ("ast" in result) {
          elements.push(result.ast);
        }
        index = result.end;
      }
    }
    return { ast: converter(...elements), end: index };
  };
}

function parseZeroOrMore(parser, { terminator, errorIfTerminatorMissing }) {
  return parseRepeatedly(parser, {
    terminator,
    errorIfTerminatorMissing,
    minimumCount: 0,
  });
}

function parseRepeatedly(
  parser,
  { terminator, errorIfTerminatorMissing, minimumCount }
) {
  return function (tokens, start) {
    let index = start;
    const elements = [];
    let terminatorMissing = false;

    while (true) {
      const parserResult = parser(tokens, index);
      if ("error" in parserResult) {
        if (elements.length >= minimumCount) {
          return { ast: elements, end: index };
        } else {
          return parserResult;
        }
      } else {
        elements.push(parserResult.ast);
        index = parserResult.end;
      }

      if (!terminator) {
        continue;
      }

      if (terminatorMissing) {
        return syntaxError(errorIfTerminatorMissing, tokens, index);
      }

      const terminatorResult = terminator(tokens, index);
      if ("error" in terminatorResult) {
        terminatorMissing = true;
      } else {
        terminatorMissing = false;
        index = terminatorResult.end;
      }
    }
  };
}

function syntaxError(name, tokens, offendingTokenIndex, properties) {
  const offendingToken = tokens[offendingTokenIndex];
  return {
    error: name,
    line: offendingToken.line,
    column: offendingToken.column,
    ...properties,
  };
}
