import {
  array,
  calling,
  defining,
  errorPassing,
  given,
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
      definitions.length === 0
        ? result
        : definingPatterns(...definitions, result)
  )(tokens, start);
}

function parseNameDefinition(tokens, start) {
  return parseAllOf(
    [
      parseAnyOf(parseName, parseArray),
      consume("EQUALS", "missingEqualsInDefinition"),
      parsePipeline,
    ],
    (pattern, value) => [pattern, value]
  )(tokens, start);
}

function definingPatterns(...args) {
  const patterns = args.slice(0, -1);
  const result = args.at(-1);

  const names = [];
  let arrayNumber = 1;

  function resolvePattern(pattern, value) {
    if ("name" in pattern) {
      names.push([pattern.name, value]);
    } else if ("array" in pattern) {
      const tempName = `#array${arrayNumber}`;
      arrayNumber++;
      names.push([tempName, value]);
      pattern.array.forEach((subpattern, i) => {
        resolvePattern(
          subpattern,
          calling(name("at"), [name(tempName), literal(i + 1)])
        );
      });
    }
  }

  for (const [pattern, value] of patterns) {
    resolvePattern(pattern, value);
  }

  return defining(...names, result);
}

function parsePipeline(tokens, start) {
  return parseAllOf(
    [
      parsePipelineElement,
      parseZeroOrMore(
        parseAllOf([
          parseAnyOf(
            parseSingle("PIPE", () => "PIPE"),
            parseSingle("AT", () => "AT")
          ),
          parsePipelineElement,
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
            const args = call.args ?? [];
            const namedArgs = call.namedArgs ?? kpobject();
            axis = calling(call.calling, [axis, ...args], namedArgs);
          } else {
            axis = calling(call, [axis]);
          }
        }
      }
      return axis;
    }
  )(tokens, start);
}

function parsePipelineElement(tokens, start) {
  return parseAnyOf(parseArrowFunction, parseTightPipeline)(tokens, start);
}

function parseArrowFunction(tokens, start) {
  return parseAllOf(
    [
      parseParameterList,
      consume("ARROW", "expectedArrowFunction"),
      parsePipelineElement,
    ],
    (params, body) => {
      return given(params, body);
    }
  )(tokens, start);
}

function parseParameterList(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_PAREN", "expectedArrowFunction"),
      parseZeroOrMore(parseParameter, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingParameterSeparator",
      }),
      consume("CLOSE_PAREN", "unclosedParameters"),
    ],
    (params) => {
      const result = {};
      const posParams = params
        .filter((param) => "positional" in param)
        .map((param) => param.positional);
      if (posParams.length > 0) {
        result.params = posParams;
      }
      const namedParams = params
        .filter((param) => "named" in param)
        .map((param) => param.named);
      if (namedParams.length > 0) {
        result.namedParams = namedParams;
      }
      return result;
    }
  )(tokens, start);
}

function parseParameter(tokens, start) {
  return parseAnyOf(
    parseAllOf(
      [
        parseParameterName,
        consume("EQUALS", "expectedParameterDefault"),
        parse,
      ],
      (param, defaultValue) => {
        if ("named" in param) {
          return { named: { name: param.named, defaultValue } };
        } else {
          return { positional: { name: param.positional, defaultValue } };
        }
      }
    ),
    parseParameterName
  )(tokens, start);
}

function parseParameterName(tokens, start) {
  return parseAnyOf(
    parseAllOf(
      [parseName, consume("COLON", "expectedNamedParameter")],
      (name) => ({ named: name.name })
    ),
    convert(parseName, (node) => ({ positional: node.name }))
  )(tokens, start);
}

function parseTightPipeline(tokens, start) {
  return parseAllOf(
    [
      parseAtomic,
      parseZeroOrMore(parseAnyOf(parsePropertyAccess, parseArgumentList)),
    ],
    (expression, calls) => {
      let axis = expression;
      for (const call of calls) {
        if ("access" in call) {
          axis = { indexing: axis, at: call.access };
        } else {
          const [args, namedArgs] = call.arguments;
          axis = calling(axis, args, namedArgs);
        }
      }
      return axis;
    }
  )(tokens, start);
}

function parsePropertyAccess(tokens, start) {
  return parseAllOf(
    [consume("DOT", "expectedPropertyAccess"), parsePropertyName],
    (property) => ({ access: property })
  )(tokens, start);
}

function parsePropertyName(tokens, start) {
  return convert(parseAnyOf(parseName, parseUnquote, parseLiteral), (key) => {
    if ("name" in key) {
      return { literal: key.name };
    } else if ("unquote" in key) {
      return key.unquote;
    } else {
      return key;
    }
  })(tokens, start);
}

function parseArgumentList(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_PAREN", "expectedArguments"),
      parseZeroOrMore(parseArgument, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingArgumentSeparator",
      }),
      consume("CLOSE_PAREN", "unclosedArguments"),
    ],
    (args) => ({
      arguments: [
        args.filter((argument) => !Array.isArray(argument)),
        kpobject(...args.filter((argument) => Array.isArray(argument))),
      ],
    })
  )(tokens, start);
}

function parseArgument(tokens, start) {
  return parseAnyOf(parseNamedArgument, parsePositionalArgument)(tokens, start);
}

function parsePositionalArgument(tokens, start) {
  return parsePossiblyOptionalArgument(tokens, start);
}

function parseNamedArgument(tokens, start) {
  return parseAllOf(
    [
      parseName,
      consume("COLON", "expectedNamedArgument"),
      parsePossiblyOptionalArgument,
    ],
    (name, value) => [name.name, value]
  )(tokens, start);
}

function parsePossiblyOptionalArgument(tokens, start) {
  return parseAnyOf(
    parseAllOf(
      [
        parsePossiblyErrorPassingArgument,
        consume("QUESTION_MARK", "expectedOptionalArgument"),
      ],
      optional
    ),
    parsePossiblyErrorPassingArgument
  )(tokens, start);
}

function parsePossiblyErrorPassingArgument(tokens, start) {
  return parseAnyOf(
    parseAllOf(
      [parse, consume("BANG", "expectedErrorPassingArgument")],
      errorPassing
    ),
    parse
  )(tokens, start);
}

function parseAtomic(tokens, start) {
  return parseAnyOf(
    parseQuote,
    parseUnquote,
    parseGroup,
    parseArray,
    parseObject,
    parseLiteral,
    parseName
  )(tokens, start);
}

function parseQuote(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_QUOTE_PAREN", "expectedQuote"),
      parse,
      consume("CLOSE_QUOTE_PAREN", "unclosedQuote"),
    ],
    (expression) => ({ quote: expression })
  )(tokens, start);
}

function parseUnquote(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_ANGLES", "expectedUnquote"),
      parse,
      consume("CLOSE_ANGLES", "unclosedUnquote"),
    ],
    (expression) => ({ unquote: expression })
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
        return [key.name, value];
      } else if ("unquote" in key) {
        return [key.unquote, value];
      } else if ("literal" in key) {
        return [key.literal, value];
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
      if (parserResult === undefined) {
        console.log(parser);
      }
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

function convert(parser, converter) {
  return function (tokens, start) {
    const result = parser(tokens, start);
    if ("error" in result) {
      return result;
    }
    return { ast: converter(result.ast), end: result.end };
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

function debug(parser, name) {
  return function (tokens, start) {
    const result = parser(tokens, start);
    console.log(name);
    console.log(result);
    return result;
  };
}
