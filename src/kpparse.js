import desugar from "./desugar.js";
import {
  array,
  arrayPattern,
  arraySpread,
  defining,
  given,
  group,
  literal,
  name,
  object,
  objectPattern,
  objectSpread,
  pipeline,
  unquote,
} from "./kpast.js";
import kplex from "./kplex.js";
import { deepToKpobject } from "./kpobject.js";

export default function kpparse(code, { trace = false } = {}) {
  return desugar(kpparseSugared(code, { trace }));
}

export function kpparseModule(code, { trace = false } = {}) {
  return kpparseSugared(code, { parseRoot: parseModule, trace }).map(
    ([name, f]) => [name, desugar(f)]
  );
}

export function kpparseSugared(
  code,
  { parseRoot = parseAll, trace = false } = {}
) {
  const tokens = kplex(code);
  return kpparseTokens(tokens, { parseRoot, trace });
}

export function kpparseTokens(
  tokens,
  { parseRoot = parseAll, trace = false } = {}
) {
  const tokenList = [...tokens];
  const parseResult = parseRoot({ tokens: tokenList, trace }, 0);
  if ("error" in parseResult) {
    throw parseResult;
  } else {
    return parseResult.ast;
  }
}

export function parseAll(parser, start) {
  return parseAllOf(
    "kpcode",
    [parseExpression, consume("EOF", "unparsedInput")],
    (ast) => ast
  )(parser, start);
}

export function parseModule(parser, start) {
  return parseZeroOrMore("module", parseStatement, {
    terminator: consume("SEMICOLON"),
    errorIfTerminatorMissing: "missingDefinitionSeparator",
    finalTerminatorMandatory: true,
  })(parser, start);
}

function parseExpression(parser, start) {
  return parseScope(parser, start);
}

function parseScope(parser, start) {
  return parseAllOf(
    "scope",
    [
      parseZeroOrMore("statements", parseStatement, {
        terminator: consume("SEMICOLON"),
        errorIfTerminatorMissing: "missingStatementSeparator",
        finalTerminatorMandatory: true,
      }),
      parseAssignable,
    ],
    (statements, result) =>
      statements.length === 0 ? result : defining(...statements, result)
  )(parser, start);
}

function parseStatement(parser, start) {
  return parseAllOf("statement", [
    parseOptional(
      "assignmentTargets",
      parseAllOfFlat(
        "assignmentTarget",
        [parseDefiningPattern, consume("EQUALS", "missingEqualsInDefinition")],
        (result) => result
      )
    ),
    parseAssignable,
  ])(parser, start);
}

function parseDefiningPattern(parser, start) {
  return parseAnyOf(
    "definingPattern",
    convert(parseName, (name) => name.name),
    parseArrayPattern,
    parseObjectPattern
  )(parser, start);
}

function parseArrayPattern(parser, start) {
  return parseAllOfFlat(
    "arrayPattern",
    [
      consume("OPEN_BRACKET", "expectedArrayPattern"),
      parseZeroOrMore("arrayPatternElements", parseArrayPatternElement, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingArrayPatternSeparator",
      }),
      consume("CLOSE_BRACKET", "unclosedArrayPattern"),
    ],
    arrayPattern
  )(parser, start);
}

function parseArrayPatternElement(parser, start) {
  return parseAnyOf(
    "arrayPatternElement",
    parseAllOf(
      "arrayPatternDefault",
      [
        parseDefiningPattern,
        consume("EQUALS", "expectedDefault"),
        parseExpression,
      ],
      (name, defaultValue) => ({ name, defaultValue })
    ),
    parseAllOf(
      "arrayPatternRest",
      [consume("STAR", "expectedRest"), parseName],
      (name) => ({
        rest: name.name,
      })
    ),
    parseDefiningPattern
  )(parser, start);
}

function parseObjectPattern(parser, start) {
  return parseAllOfFlat(
    "objectPattern",
    [
      consume("OPEN_BRACE", "expectedObjectPattern"),
      parseZeroOrMore("objectPatternElements", parseObjectPatternElement, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingObjectPatternSeparator",
      }),
      consume("CLOSE_BRACE", "unclosedObject"),
    ],
    objectPattern
  )(parser, start);
}

function parseObjectPatternElement(parser, start) {
  return parseAnyOf(
    "objectPatternElement",
    parseAllOf(
      "objectPatternDefault",
      [
        parseObjectPatternPropertyName,
        consume("EQUALS", "expectedDefault"),
        parseExpression,
      ],
      (name, defaultValue) => ({ name, defaultValue })
    ),
    parseAllOf(
      "objectPatternRest",
      [consume("DOUBLE_STAR", "expectedRest"), parseName],
      (name) => ({
        namedRest: name.name,
      })
    ),
    parseAnyOf(
      "objectPatternStandard",
      parseAllOf(
        "objectPatternEntry",
        [
          parseAssignable,
          consume("COLON", "missingKeyTargetSeparator"),
          parseDefiningPattern,
        ],
        (name, pattern) => ({ name: pattern, property: name.name })
      ),
      parseObjectPatternPropertyName
    )
  )(parser, start);
}

function parseObjectPatternPropertyName(parser, start) {
  return parseAllOf(
    "objectPatternName",
    [parseName, consume("COLON", "expectedPropertyName")],
    (name) => name.name
  )(parser, start);
}

function parseAssignable(parser, start) {
  return parseAnyOf(
    "assignable",
    parseArrowFunction,
    parsePipeline
  )(parser, start);
}

function parsePipeline(parser, start) {
  return parseAllOf(
    "pipeline",
    [
      parseAtomic,
      parseZeroOrMore(
        "pipelineSteps",
        parseAnyOf(
          "pipelineStep",
          parseCall,
          parsePipeCall,
          parsePipe,
          parseAt,
          parseBang
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
  )(parser, start);
}

function parseCall(parser, start) {
  return convert(parseArgumentList, (list) => ["CALL", list])(parser, start);
}

function parsePipeCall(parser, start) {
  return parseAllOf("pipeCall", [
    parseSingle("PIPE", () => "PIPECALL"),
    parseAtomic,
    parseArgumentList,
  ])(parser, start);
}

function parsePipe(parser, start) {
  return parseAllOf("pipe", [parseSingle("PIPE", () => "PIPE"), parseAtomic])(
    parser,
    start
  );
}

function parseAt(parser, start) {
  return parseAllOf("at", [
    parseSingle("AT", () => "AT"),
    parseAnyOf("atTarget", parsePropertyIndex, parseAtomic),
  ])(parser, start);
}

function parsePropertyIndex(parser, start) {
  return parseAllOf(
    "propertyIndex",
    [parseName, consume("COLON", "expectedPropertyIndex")],
    (name) => literal(name.name)
  )(parser, start);
}

function parseBang(parser, start) {
  return parseSingle("BANG", () => ["BANG"])(parser, start);
}

function parseArrowFunction(parser, start) {
  return parseAllOf(
    "arrowFunction",
    [
      parseParameterList,
      consume("ARROW", "expectedArrowFunction"),
      parseAssignable,
    ],
    given
  )(parser, start);
}

function parseParameterList(parser, start) {
  return parseAllOf(
    "parameterList",
    [
      consume("OPEN_PAREN", "expectedParameterList"),
      parseZeroOrMore("parameters", parseParameter, {
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
  )(parser, start);
}

function parseParameter(parser, start) {
  return parseAnyOf(
    "parameter",
    convert(parseObjectPatternElement, (pattern) => ({ named: pattern })),
    convert(parseArrayPatternElement, (pattern) => ({ positional: pattern }))
  )(parser, start);
}

function parseArgumentList(parser, start) {
  return parseAllOf(
    "argumentList",
    [
      consume("OPEN_PAREN", "expectedArguments"),
      parseZeroOrMore("arguments", parseArgument, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingArgumentSeparator",
      }),
      consume("CLOSE_PAREN", "unclosedArguments"),
    ],
    (args) => {
      const posArgs = args.filter(
        (argument) => !(Array.isArray(argument) || "objectSpread" in argument)
      );
      const namedArgs = args.filter(
        (argument) => Array.isArray(argument) || "objectSpread" in argument
      );
      return { args: posArgs, namedArgs };
    }
  )(parser, start);
}

function parseArgument(parser, start) {
  return parseAnyOf(
    "argument",
    parseNamedArgument,
    parsePositionalArgument,
    parseArraySpread,
    parseObjectSpread
  )(parser, start);
}

function parsePositionalArgument(parser, start) {
  return parseAssignable(parser, start);
}

function parseNamedArgument(parser, start) {
  return parseAllOf(
    "namedArgument",
    [parseName, consume("COLON", "expectedNamedArgument"), parseAssignable],
    (name, value) => [name.name, value]
  )(parser, start);
}

function parseAtomic(parser, start) {
  return parseAnyOf(
    "atomic",
    parseUnquote,
    parseGroup,
    parseArray,
    parseObject,
    parseLiteral,
    parseNameFromModule,
    parseName
  )(parser, start);
}

function parseUnquote(parser, start) {
  return parseAllOf(
    "unquote",
    [
      consume("OPEN_ANGLES", "expectedUnquote"),
      parseExpression,
      consume("CLOSE_ANGLES", "unclosedUnquote"),
    ],
    unquote
  )(parser, start);
}

function parseGroup(parser, start) {
  return parseAllOf(
    "group",
    [
      consume("OPEN_PAREN", "expectedGroup"),
      parseExpression,
      consume("CLOSE_PAREN", "unclosedGroup"),
    ],
    group
  )(parser, start);
}

function parseArray(parser, start) {
  return parseAllOfFlat(
    "array",
    [
      consume("OPEN_BRACKET", "expectedArray"),
      parseZeroOrMore("arrayElements", parseArrayElement, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingArraySeparator",
      }),
      consume("CLOSE_BRACKET", "unclosedArray"),
    ],
    array
  )(parser, start);
}

function parseArrayElement(parser, start) {
  return parseAnyOf(
    "arrayElement",
    parseAssignable,
    parseArraySpread
  )(parser, start);
}

function parseArraySpread(parser, start) {
  return parseAllOfFlat(
    "arraySpread",
    [consume("STAR", "expectedSpread"), parseExpression],
    arraySpread
  )(parser, start);
}

function parseObject(parser, start) {
  return parseAllOfFlat(
    "object",
    [
      consume("OPEN_BRACE", "expectedObject"),
      parseZeroOrMore("objectEntries", parseObjectEntry, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingObjectSeparator",
      }),
      consume("CLOSE_BRACE", "unclosedObject"),
    ],
    object
  )(parser, start);
}

function parseObjectEntry(parser, start) {
  return parseAnyOf(
    "objectElement",
    parseAllOf("objectEntry", [
      parseAssignable,
      consume("COLON", "missingKeyValueSeparator"),
      parseAssignable,
    ]),
    parseObjectSpread
  )(parser, start);
}

function parseObjectSpread(parser, start) {
  return parseAllOfFlat(
    "objectSpread",
    [consume("DOUBLE_STAR", "expectedSpread"), parseAssignable],
    objectSpread
  )(parser, start);
}

function parseLiteral(parser, start) {
  return parseSingle("LITERAL", (token) => literal(token.value))(parser, start);
}

function parseName(parser, start) {
  return parseSingle("NAME", (token) => name(token.text))(parser, start);
}

function parseNameFromModule(parser, start) {
  return parseAllOf(
    "nameFromModule",
    [parseName, consume("DOT", "expectedModuleAccess"), parseName],
    (module, unqualifiedName) => name(unqualifiedName.name, module.name)
  )(parser, start);
}

function parseSingle(tokenType, converter) {
  return function ({ tokens, trace }, start) {
    if (tokens[start].type === tokenType) {
      if (trace) {
        console.log(
          foundMessage(`${tokenType} (${tokens[start].text})`, tokens, start)
        );
      }
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
  return function ({ tokens }, start) {
    if (tokens[start].type === tokenType) {
      return { end: start + 1 };
    } else {
      return syntaxError(errorIfMissing, tokens, start);
    }
  };
}

function parseAnyOf(nodeName, ...parsers) {
  return function ({ tokens, trace }, start) {
    const errors = [];
    let success;
    for (const parser of parsers) {
      const result = parser({ tokens, trace }, start);
      if ("error" in result) {
        errors.push(result);
      } else {
        success = result;
        break;
      }
    }
    if (errors.length === 0) {
      if (trace) {
        console.log(foundMessage(nodeName, tokens, start));
      }
      return success;
    }
    const [farthestLine, farthestColumn] = errors
      .map(errorPos)
      .sort(([lineA, columnA], [lineB, columnB]) =>
        lineA === lineB ? columnA - columnB : lineA - lineB
      )
      .at(-1);
    const firstFarthestError = errors.find((error) => {
      const [line, column] = errorPos(error);
      return line === farthestLine && column === farthestColumn;
    });
    if (success) {
      if (
        success.farthestPartial &&
        comparePos(
          errorPos(success.farthestPartial),
          errorPos(firstFarthestError)
        ) > 0
      ) {
        if (trace) {
          console.log(
            foundMessage(nodeName, tokens, start, success.farthestPartial)
          );
        }
        return success;
      } else {
        if (trace) {
          console.log(
            foundMessage(nodeName, tokens, start, firstFarthestError)
          );
        }
        return { ...success, farthestPartial: firstFarthestError };
      }
    }
    if (
      trace &&
      comparePos(errorPos(firstFarthestError), tokenPos(tokens, start)) > 0
    ) {
      console.log(
        `No option for ${nodeName} matched after hitting ${
          firstFarthestError.error
        } at ${posString(errorPos(firstFarthestError))}`
      );
    }
    return firstFarthestError;
  };
}

function parseAllOf(nodeName, parsers, converter = (...args) => args) {
  return function ({ tokens, trace }, start) {
    const elements = [];
    let farthestPartial;
    let index = start;
    for (const parser of parsers) {
      const result = parser({ tokens, trace }, index);
      if ("error" in result) {
        if (
          !farthestPartial ||
          comparePos(errorPos(result), errorPos(farthestPartial)) >= 0
        ) {
          farthestPartial = result;
        }
        if (
          trace &&
          comparePos(errorPos(farthestPartial), tokenPos(tokens, start)) > 0
        ) {
          console.log(
            `Unable to finish ${nodeName} after hitting ${
              farthestPartial.error
            } at ${posString(errorPos(farthestPartial))}`
          );
        }
        return farthestPartial;
      } else {
        if ("ast" in result) {
          elements.push(result.ast);
          if (
            result.farthestPartial &&
            (!farthestPartial ||
              comparePos(
                errorPos(result.farthestPartial),
                errorPos(farthestPartial)
              ) >= 0)
          ) {
            farthestPartial = result.farthestPartial;
          }
        }
        index = result.end;
      }
    }
    if (trace) {
      console.log(foundMessage(nodeName, tokens, start, farthestPartial));
    }
    return { ast: converter(...elements), end: index, farthestPartial };
  };
}

function parseAllOfFlat(nodeName, parsers, converter = (...args) => args) {
  return parseAllOf(nodeName, parsers, (...args) =>
    converter(...[].concat([], ...args))
  );
}

function parseOptional(nodeName, parser) {
  return convert(
    parseRepeatedly(nodeName, parser, {
      minimumCount: 0,
      maximumCount: 1,
    }),
    (result) => (result.length === 0 ? null : result[0])
  );
}

function parseZeroOrMore(
  nodeName,
  parser,
  {
    terminator,
    errorIfTerminatorMissing,
    finalTerminatorMandatory = false,
  } = {}
) {
  return parseRepeatedly(nodeName, parser, {
    terminator,
    errorIfTerminatorMissing,
    minimumCount: 0,
    finalTerminatorMandatory,
  });
}

function parseRepeatedly(
  nodeName,
  parser,
  {
    terminator,
    errorIfTerminatorMissing,
    minimumCount,
    maximumCount = Infinity,
    finalTerminatorMandatory = false,
  } = {}
) {
  return function ({ tokens, trace }, start) {
    let index = start;
    const elements = [];
    let farthestPartial;

    while (elements.length < maximumCount) {
      let previousIndex = index;
      const parserResult = parser({ tokens, trace }, index);
      if ("error" in parserResult) {
        if (
          !farthestPartial ||
          comparePos(errorPos(parserResult), errorPos(farthestPartial)) >= 0
        ) {
          farthestPartial = parserResult;
        }
        if (elements.length >= minimumCount) {
          if (trace) {
            console.log(
              foundMessage(
                `${elements.length} ${nodeName}`,
                tokens,
                start,
                farthestPartial
              )
            );
          }
          return { ast: elements, end: index, farthestPartial };
        } else {
          return farthestPartial;
        }
      } else {
        elements.push(parserResult.ast);
        if (
          parserResult.farthestPartial &&
          (!farthestPartial ||
            comparePos(
              errorPos(parserResult.farthestPartial),
              errorPos(farthestPartial)
            ) >= 0)
        ) {
          farthestPartial = parserResult.farthestPartial;
        }
        index = parserResult.end;
      }

      if (!terminator) {
        continue;
      }

      const terminatorResult = terminator({ tokens, trace }, index);
      if ("error" in terminatorResult) {
        if (elements.length >= minimumCount) {
          if (finalTerminatorMandatory) {
            const error = syntaxError(errorIfTerminatorMissing, tokens, index);
            if (
              !farthestPartial ||
              comparePos(errorPos(error), errorPos(farthestPartial)) >= 0
            ) {
              farthestPartial = error;
            }
            elements.pop();
            if (trace) {
              console.log(
                foundMessage(
                  `${elements.length} ${nodeName}`,
                  tokens,
                  start,
                  farthestPartial
                )
              );
            }
            return { ast: elements, end: previousIndex, farthestPartial };
          } else {
            if (trace) {
              console.log(
                foundMessage(nodeName, tokens, start, farthestPartial)
              );
            }
            return { ast: elements, end: index, farthestPartial };
          }
        }
      } else {
        index = terminatorResult.end;
      }
    }
    return { ast: elements, end: index, farthestPartial };
  };
}

function convert(parser, converter) {
  return function (parseOptions, start) {
    const result = parser(parseOptions, start);
    if ("error" in result) {
      return result;
    }
    return { ...result, ast: converter(result.ast) };
  };
}

function errorPos(error) {
  return [error.details.get("line"), error.details.get("column")];
}

function tokenPos(tokens, index) {
  const token = tokens[index];
  return [token.line, token.column];
}

function posString([line, column]) {
  return `${line}:${column}`;
}

function foundMessage(nodeName, tokens, start, farthestPartial) {
  if (farthestPartial) {
    return `Found ${nodeName} at ${posString(
      tokenPos(tokens, start)
    )} after hitting ${farthestPartial.error} at ${posString(
      errorPos(farthestPartial)
    )}`;
  } else {
    return `Found ${nodeName} at ${posString(tokenPos(tokens, start))}`;
  }
}

function comparePos([lineA, columnA], [lineB, columnB]) {
  return lineA === lineB ? columnA - columnB : lineA - lineB;
}

function syntaxError(name, tokens, offendingTokenIndex, properties) {
  const offendingToken = tokens[offendingTokenIndex];
  return {
    error: name,
    details: deepToKpobject({
      line: offendingToken.line,
      column: offendingToken.column,
      ...properties,
    }),
  };
}
