import desugar from "./desugar.js";
import {
  args,
  array,
  arrayPattern,
  arrayRest,
  arraySpread,
  arrow,
  at,
  block,
  constantFunction,
  dot,
  entry,
  group,
  keyName,
  literal,
  loosePipeline,
  mixedArgList,
  mixedParamList,
  name,
  object,
  objectPattern,
  objectRest,
  objectSpread,
  optional,
  pipe,
  pipelineCall,
  tightPipeline,
} from "./kpast.js";
import kperror, { isError } from "./kperror.js";
import kplex from "./kplex.js";
import { deepToKpobject, kpoEntries } from "./kpobject.js";
import { kpcallbackInNewSession } from "./kpvm.js";

export default function kpparse(code, { trace = false } = {}) {
  return desugar(kpparseSugared(code, { trace }));
}

export function kpparseModule(code, { trace = false } = {}) {
  return kpparseSugared(code, { parseRoot: parseModule, trace }).map(
    ([name, f]) => [name.name, desugar(f)]
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
  if (isError(parseResult)) {
    throw parseResult;
  } else {
    return parseResult.ast;
  }
}

export function parseAll(parser, start) {
  return wrapError(() =>
    parseAllOf(
      "kpcode",
      [parseExpression, consume("EOF", "unparsedInput")],
      (ast) => ast
    )(parser, start)
  );
}

export function parseModule(parser, start) {
  return wrapError(() =>
    parseAllOf(
      "module",
      [
        parseZeroOrMore("definitions", parseStatement, {
          terminator: consume("SEMICOLON"),
          errorIfTerminatorMissing: "missingDefinitionSeparator",
          finalTerminatorMandatory: true,
        }),
        consume("EOF", "unparsedInput"),
      ],
      (definitions) => definitions
    )(parser, start)
  );
}

function wrapError(f) {
  try {
    return f();
  } catch (error) {
    if (isError(error)) {
      throw new KenpaliError(error, kpcallbackInNewSession, "Syntax error");
    } else {
      throw error;
    }
  }
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
      statements.length === 0 ? result : block(...statements, result)
  )(parser, start);
}

function parseStatement(parser, start) {
  return parseAllOf("statement", [
    parseOptional(
      "assignmentTargets",
      parseAllOfFlat(
        "assignmentTarget",
        [parseNamePattern, consume("EQUALS", "missingEqualsInDefinition")],
        (result) => result
      )
    ),
    parseAssignable,
  ])(parser, start);
}

function parseNamePattern(parser, start) {
  return parseAnyOf(
    "namePattern",
    parseName,
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
    parseArrayPatternOptional,
    parseArrayPatternRest,
    parseNamePattern
  )(parser, start);
}

function parseArrayPatternOptional(parser, start) {
  return parseAllOf(
    "arrayPatternOptional",
    [parseNamePattern, consume("EQUALS", "expectedDefault"), parseAssignable],
    optional
  )(parser, start);
}

function parseArrayPatternRest(parser, start) {
  return parseAllOf(
    "arrayPatternRest",
    [consume("STAR", "expectedRest"), parseNamePattern],
    (pattern) => arrayRest(pattern)
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
    parseObjectPatternOptional,
    parseObjectPatternSimple,
    parseObjectPatternRest
  )(parser, start);
}

function parseObjectPatternOptional(parser, start) {
  return parseAllOf(
    "objectPatternOptional",
    [
      parseObjectPatternSimple,
      consume("EQUALS", "expectedDefault"),
      parseAssignable,
    ],
    optional
  )(parser, start);
}

function parseObjectPatternSimple(parser, start) {
  return parseAnyOf(
    "objectPatternSimple",
    parseObjectPatternEntry,
    parseObjectPatternKeyName
  )(parser, start);
}

function parseObjectPatternEntry(parser, start) {
  return parseAllOf(
    "objectPatternEntry",
    [
      parseAssignable,
      consume("COLON", "missingKeyTargetSeparator"),
      parseNamePattern,
    ],
    entry
  )(parser, start);
}

function parseObjectPatternKeyName(parser, start) {
  return parseAllOf(
    "objectPatternKeyName",
    [parseName, consume("COLON", "expectedPropertyName")],
    keyName
  )(parser, start);
}

function parseObjectPatternRest(parser, start) {
  return parseAllOf(
    "objectPatternRest",
    [consume("DOUBLE_STAR", "expectedRest"), parseNamePattern],
    objectRest
  )(parser, start);
}

function parseAssignable(parser, start) {
  return parseAnyOf(
    "assignable",
    parseArrowFunction,
    parseLoosePipelineCall,
    parseLoosePipeline,
    parseConstantFunction
  )(parser, start);
}

function parseConstantFunction(parser, start) {
  return parseAllOf(
    "constantFunction",
    [consume("DOLLAR", "expectedConstantFunction"), parseAssignable],
    constantFunction
  )(parser, start);
}

function parseLoosePipelineCall(parser, start) {
  return parseAllOf(
    "loosePipelineCall",
    [parseTight, parseOptional("loosePipeline", parseLoosePipeline)],
    (start, pipeline) => {
      if (pipeline) {
        return pipelineCall(start, pipeline);
      } else {
        return start;
      }
    }
  )(parser, start);
}

function parseLoosePipeline(parser, start) {
  return convert(
    parseOneOrMore("loosePipelineSteps", parseLoosePipelineStep),
    (steps) => loosePipeline(...steps)
  )(parser, start);
}

function parseLoosePipelineStep(parser, start) {
  return parseAnyOf("loosePipelineStep", parsePipe, parseAt)(parser, start);
}

function parsePipe(parser, start) {
  return parseAllOf(
    "pipe",
    [consume("PIPE", "expectedPipe"), parseTight],
    pipe
  )(parser, start);
}

function parseAt(parser, start) {
  return parseAllOf(
    "at",
    [consume("AT", "expectedAt"), parseTightPipelineCall],
    at
  )(parser, start);
}

function parseArrowFunction(parser, start) {
  return parseAllOf(
    "arrowFunction",
    [
      parseParameterList,
      consume("ARROW", "expectedArrowFunction"),
      parseAssignable,
    ],
    arrow
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
    mixedParamList
  )(parser, start);
}

function parseParameter(parser, start) {
  return parseAnyOf(
    "parameter",
    parseObjectPatternElement,
    parseArrayPatternElement
  )(parser, start);
}

function parseTight(parser, start) {
  return parseAnyOf(
    "tight",
    parseTightPipelineCall,
    parsePointFreeTightPipeline
  )(parser, start);
}

function parseTightPipelineCall(parser, start) {
  return parseAllOf(
    "tightPipelineCall",
    [parseAtomic, parseOptional("tightPipeline", parseTightPipeline)],
    (start, pipeline) => {
      if (pipeline) {
        return pipelineCall(start, pipeline);
      } else {
        return start;
      }
    }
  )(parser, start);
}

function parsePointFreeTightPipeline(parser, start) {
  // In a point-free context, a tight pipeline can't start with
  // an args step, because that would just be a thing in parens,
  // which needs to be interpreted as an ordinary group.
  return parseAllOf(
    "pointFreeTightPipeline",
    [parseDot, parseZeroOrMore("tightPipelineSteps", parseTightPipelineStep)],
    (dot, steps) => tightPipeline(dot, ...steps)
  )(parser, start);
}

function parseTightPipeline(parser, start) {
  return convert(
    parseOneOrMore("tightPipelineSteps", parseTightPipelineStep),
    (steps) => tightPipeline(...steps)
  )(parser, start);
}

function parseTightPipelineStep(parser, start) {
  return parseAnyOf("tightPipelineStep", parseArgs, parseDot)(parser, start);
}

function parseArgs(parser, start) {
  return convert(parseArgumentList, args)(parser, start);
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
    mixedArgList
  )(parser, start);
}

function parseArgument(parser, start) {
  return parseAnyOf(
    "argument",
    parseObjectElement,
    parseArrayElement
  )(parser, start);
}

function parseDot(parser, start) {
  return parseAllOf("dot", [consume("DOT", "expectedDot"), parseName], (name) =>
    dot(literal(name.name))
  )(parser, start);
}

function parseAtomic(parser, start) {
  return parseAnyOf(
    "atomic",
    parseGroup,
    parseArray,
    parseObject,
    parseLiteral,
    parseName
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
    [consume("STAR", "expectedSpread"), parseAssignable],
    arraySpread
  )(parser, start);
}

function parseObject(parser, start) {
  return parseAllOfFlat(
    "object",
    [
      consume("OPEN_BRACE", "expectedObject"),
      parseZeroOrMore("objectElements", parseObjectElement, {
        terminator: consume("COMMA"),
        errorIfTerminatorMissing: "missingObjectSeparator",
      }),
      consume("CLOSE_BRACE", "unclosedObject"),
    ],
    object
  )(parser, start);
}

function parseObjectElement(parser, start) {
  return parseAnyOf(
    "objectElement",
    parseObjectEntry,
    parseObjectKeyName,
    parseObjectSpread
  )(parser, start);
}

function parseObjectEntry(parser, start) {
  return parseAllOf(
    "objectEntry",
    [
      parseAssignable,
      consume("COLON", "missingKeyValueSeparator"),
      parseAssignable,
    ],
    entry
  )(parser, start);
}

function parseObjectKeyName(parser, start) {
  return parseAllOf(
    "objectKeyName",
    [parseName, consume("COLON", "missingKeyValueSeparator")],
    keyName
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
  return parseAnyOf(
    "name",
    parseNameInModule,
    parseSingle("NAME", (token) => name(token.text))
  )(parser, start);
}

function parseNameInModule(parser, start) {
  return parseAllOf(
    "nameInModule",
    [
      parseSingle("NAME", (token) => token.text),
      consume("SLASH", "expectedNameInModule"),
      parseSingle("NAME", (token) => token.text),
    ],
    (module, nameInModule) => name(nameInModule, module)
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
      if (isError(result)) {
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
          firstFarthestError.properties.type
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
      if (isError(result)) {
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
              farthestPartial.properties.type
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

function parseAllOfFlat(nodeName, parsers, converter) {
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

function parseOneOrMore(
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
    minimumCount: 1,
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
      if (isError(parserResult)) {
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
      if (isError(terminatorResult)) {
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
    if (isError(result)) {
      return result;
    }
    return { ...result, ast: converter(result.ast) };
  };
}

function errorPos(error) {
  return [
    error.properties.details.get("line"),
    error.properties.details.get("column"),
  ];
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
    )} after hitting ${farthestPartial.properties.type} at ${posString(
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
  return kperror(
    name,
    ...kpoEntries(
      deepToKpobject({
        line: offendingToken.line,
        column: offendingToken.column,
        ...properties,
      })
    )
  );
}
