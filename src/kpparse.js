import desugar from "./desugar.js";
import {
  access,
  array,
  arraySpread,
  calling,
  defining,
  given,
  group,
  literal,
  name,
  object,
  objectSpread,
  optional,
  pipeline,
  quote,
  unquote,
} from "./kpast.js";
import kplex from "./kplex.js";
import kpobject from "./kpobject.js";

export default function kpparse(code) {
  const sugar = kpparseSugared(code);
  if ("error" in sugar) {
    return sugar;
  } else {
    return desugar(sugar);
  }
}

export function kpparseSugared(code) {
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
  return parseAllOf([parse, consume("EOF", "unparsedInput")], (ast) => ast)(
    tokens,
    0
  );
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
  return parseAllOf([
    parseAnyOf(parseName, parseArray),
    consume("EQUALS", "missingEqualsInDefinition"),
    parsePipeline,
  ])(tokens, start);
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
        parseAnyOf(
          parseAllOf([parseSingle("PIPE", () => "PIPE"), parsePipelineElement]),
          parseAllOf([parseSingle("AT", () => "AT"), parsePipelineElement]),
          parseSingle("BANG", () => "BANG")
        )
      ),
    ],
    (expression, calls) => {
      if (calls.length > 0) {
        return pipeline(expression, ...calls);
      } else {
        return expression;
      }
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
    given
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
          axis = access(axis, call.access);
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
  return parseAnyOf(parseName, parseUnquote, parseLiteral)(tokens, start);
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
    (args) => {
      const posArgs = args.filter(
        (argument) => !(Array.isArray(argument) || "objectSpread" in argument)
      );
      let namedArgs = args.filter(
        (argument) => Array.isArray(argument) || "objectSpread" in argument
      );
      if (!namedArgs.some((arg) => "objectSpread" in arg)) {
        namedArgs = kpobject(...namedArgs);
      }
      return {
        arguments: [posArgs, namedArgs],
      };
    }
  )(tokens, start);
}

function parseArgument(tokens, start) {
  return parseAnyOf(
    parseNamedArgument,
    parsePositionalArgument,
    parseArraySpread,
    parseObjectSpread
  )(tokens, start);
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
      [parse, consume("QUESTION_MARK", "expectedOptionalArgument")],
      optional
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
    quote
  )(tokens, start);
}

function parseUnquote(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_ANGLES", "expectedUnquote"),
      parse,
      consume("CLOSE_ANGLES", "unclosedUnquote"),
    ],
    unquote
  )(tokens, start);
}

function parseGroup(tokens, start) {
  return parseAllOf(
    [
      consume("OPEN_PAREN", "expectedGroup"),
      parse,
      consume("CLOSE_PAREN", "unclosedGroup"),
    ],
    group
  )(tokens, start);
}

function parseArray(tokens, start) {
  return parseAllOfFlat(
    [
      consume("OPEN_BRACKET", "expectedArray"),
      parseZeroOrMore(parseArrayElement, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingArraySeparator",
      }),
      consume("CLOSE_BRACKET", "unclosedArray"),
    ],
    array
  )(tokens, start);
}

function parseArrayElement(tokens, start) {
  return parseAnyOf(parse, parseArraySpread)(tokens, start);
}

function parseArraySpread(tokens, start) {
  return parseAllOfFlat(
    [consume("STAR", "expectedSpread"), parse],
    arraySpread
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
  return parseAnyOf(
    parseAllOf([parse, consume("COLON", "missingKeyValueSeparator"), parse]),
    parseObjectSpread
  )(tokens, start);
}

function parseObjectSpread(tokens, start) {
  return parseAllOfFlat(
    [consume("DOUBLE_STAR", "expectedSpread"), parse],
    objectSpread
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
