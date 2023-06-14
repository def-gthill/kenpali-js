import {
  array,
  calling,
  defining,
  literal,
  name,
  object,
  optional,
} from "./kpast.js";
import kplex from "./kplex.js";
import kpobject, { kpoMap } from "./kpobject.js";

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
  return parseAllOf([parse, consume("EOF", "unparsedInput")], normalize)(
    tokens,
    0
  );
}

function normalize(ast) {
  if (Array.isArray(ast)) {
    return ast.map(normalize);
  } else if (ast instanceof Map) {
    return kpoMap(ast, ([key, value]) => [key, normalize(value)]);
  } else if (ast === null) {
    return null;
  } else if (typeof ast === "object") {
    if ("indexing" in ast) {
      return calling(name("at"), [normalize(ast.indexing), normalize(ast.at)]);
    } else if ("group" in ast) {
      return normalize(ast.group);
    } else {
      return Object.fromEntries(
        Object.entries(ast).map(([key, value]) => [key, normalize(value)])
      );
    }
  } else {
    return ast;
  }
}

function parse(tokens, start) {
  return parseScope(tokens, start);
}

function parseScope(tokens, start) {
  return parseAllOf(
    [
      parseZeroOrMore(parseNameDefinition, {
        terminator: consume("SEMICOLON"),
        errorIfTerminatorMissing: "missingDefinitionSeparator",
      }),
      parsePipeline,
    ],
    (definitions, result) =>
      definitions.length === 0 ? result : defining(...definitions, result)
  )(tokens, start);
}

function parseNameDefinition(tokens, start) {
  return parseAllOf(
    [parseName, consume("EQUALS", "missingEqualsInDefinition"), parsePipeline],
    (name, value) => [name.name, value]
  )(tokens, start);
}

function parsePipeline(tokens, start) {
  return parseAllOf(
    [
      parseTightPipeline,
      parseZeroOrMore(
        parseAllOf([
          parseAnyOf(
            parseSingle("PIPE", () => "PIPE"),
            parseSingle("AT", () => "AT")
          ),
          parseTightPipeline,
        ])
      ),
    ],
    (expression, calls) => {
      let axis = expression;
      for (const [op, call] of calls) {
        if (op === "AT") {
          axis = { indexing: axis, at: call };
        } else {
          if ("calling" in call) {
            axis = calling(call.calling, [axis, ...call.args], call.kwArgs);
          } else {
            axis = calling(call, [axis]);
          }
        }
      }
      return axis;
    }
  )(tokens, start);
}

function parseTightPipeline(tokens, start) {
  return parseAllOf(
    [
      parseCallable,
      parseZeroOrMore(parseAnyOf(parsePropertyAccess, parseArgumentList)),
    ],
    (expression, calls) => {
      let axis = expression;
      for (const call of calls) {
        if ("access" in call) {
          axis = { indexing: axis, at: call.access };
        } else {
          const [args, kwArgs] = call.arguments;
          axis = calling(axis, args, kwArgs);
        }
      }
      return axis;
    }
  )(tokens, start);
}

function parsePropertyAccess(tokens, start) {
  return parseAllOf(
    [consume("DOT", "expectedPropertyAccess"), parseName],
    (property) => ({ access: { literal: property.name } })
  )(tokens, start);
}

function parseArgumentList(tokens, start) {
  return parseAnyOf(
    parseAllOf(
      [
        consume("OPEN_PAREN", "expectedArguments"),
        parseZeroOrMore(parsePositionalArgument, {
          terminator: consume("COMMA"),
          errorIfTerminatorMissing: "missingArgumentSeparator",
        }),
        parseZeroOrMore(parseKeywordArgument, {
          terminator: consume("COMMA"),
          errorIfTerminatorMissing: "missingArgumentSeparator",
        }),
        consume("CLOSE_PAREN", "unclosedArguments"),
      ],
      (args, kwArgs) => ({
        arguments: [args, kpobject(...kwArgs)],
      })
    ),
    parseAllOf(
      [
        consume("OPEN_PAREN", "expectedArguments"),
        parseZeroOrMore(parseKeywordArgument, {
          terminator: consume("COMMA"),
          errorIfTerminatorMissing: "missingArgumentSeparator",
        }),
        consume("CLOSE_PAREN", "unclosedArguments"),
      ],
      (kwArgs) => ({ arguments: [[], kpobject(...kwArgs)] })
    )
  )(tokens, start);
}

function parsePositionalArgument(tokens, start) {
  return parseArgument(tokens, start);
}

function parseKeywordArgument(tokens, start) {
  return parseAllOf(
    [parseName, consume("EQUALS", "expectedKeywordArgument"), parseArgument],
    (name, value) => [name.name, value]
  )(tokens, start);
}

function parseArgument(tokens, start) {
  return parseAnyOf(
    parseAllOf(
      [parse, consume("QUESTION_MARK", "expectedOptionalArgument")],
      optional
    ),
    parse
  )(tokens, start);
}

function parseCallable(tokens, start) {
  return parseAnyOf(
    parseGroup,
    parseArray,
    parseObject,
    parseLiteral,
    parseName
  )(tokens, start);
}

function parseGroup(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_PAREN", "expectedGroup"),
      parse,
      consume("CLOSE_PAREN", "unclosedGroup"),
    ],
    (expression) => ({
      group: expression,
    })
  )(tokens, start);
}

function parseArray(tokens, start) {
  return parseAllOfFlat(
    [
      consume("OPEN_BRACKET", "expectedArray"),
      parseZeroOrMore(parse, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingArraySeparator",
      }),
      consume("CLOSE_BRACKET", "unclosedArray"),
    ],
    array
  )(tokens, start);
}

function parseObject(tokens, start) {
  return parseAllOfFlat(
    [
      consume("OPEN_BRACE", "expectedObject"),
      parseZeroOrMore(parseObjectEntry, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingObjectSeparator",
      }),
      consume("CLOSE_BRACE", "unclosedObject"),
    ],
    object
  )(tokens, start);
}

function parseObjectEntry(tokens, start) {
  return parseAllOf(
    [parse, consume("COLON", "missingKeyValueSeparator"), parse],
    (key, value) => {
      if ("name" in key) {
        return [literal(key.name), value];
      } else {
        return [key, value];
      }
    }
  )(tokens, start);
}

function parseLiteral(tokens, start) {
  return parseSingle("LITERAL", (token) => literal(token.value))(tokens, start);
}

function parseName(tokens, start) {
  return parseSingle("NAME", (token) => name(token.text))(tokens, start);
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

function parseAllOfFlat(parsers, converter = (...args) => args) {
  return parseAllOf(parsers, (...args) => converter(...[].concat([], ...args)));
}

function parseZeroOrMore(
  parser,
  { terminator, errorIfTerminatorMissing } = {}
) {
  return parseRepeatedly(parser, {
    terminator,
    errorIfTerminatorMissing,
    minimumCount: 0,
  });
}

function parseRepeatedly(
  parser,
  { terminator, errorIfTerminatorMissing, minimumCount } = {}
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
