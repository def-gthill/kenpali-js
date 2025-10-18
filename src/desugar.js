import {
  argList,
  args,
  arrayRest,
  arraySpread,
  arrow,
  at,
  call,
  catch_,
  entry,
  function_,
  group,
  index,
  keyName,
  objectRest,
  objectSpread,
  optional,
  paramList,
  pipe,
  pipeArgs,
  pipeDot,
  pipeline,
  rest,
  spread,
  TreeTransformer,
} from "./kpast.js";

export default function desugar(expression) {
  let result = expression;

  // This step splits argument and parameter lists into positional and named elements.
  result = splitMixedLists(result);

  // Kenpali Code uses different syntax for spreads in arrays than for spreads in objects.
  // This step converts both to the single `spread` node mandated by Kenpali JSON.
  result = removeSpecializedSpreads(result);

  // Kenpali Code uses different syntax for rest elements in arrays than for rest elements in objects.
  // This step converts both to the single `rest` node mandated by Kenpali JSON.
  result = removeSpecializedRests(result);

  // This step converts Kenpali's function syntax, with its mixed arguments and
  // shorthand for common function types, to Kenpali JSON's function syntax.
  result = convertFunctionSyntax(result);

  // This step converts Kenpali's pipeline syntax into ordinary function calls
  // and operators.
  result = convertPipelines(result);

  // Kenpali Code has a few shortcuts for object syntax that we need to expand to
  // match the Kenpali JSON standard.
  result = normalizeObjectSyntax(result);

  // This step replaces expressions in parentheses with their contents.
  // Normally this could be done *first*—the AST inherently encodes
  // precedence, so there's no need to alter it with parentheses. But
  // in Kenpali, some syntactic sugar has a parent node reaching into
  // child nodes and changing them. Putting a child node in a group can be
  // used to block that effect, so the groups need to stay around
  // through the desugaring process.
  result = removeGroups(result);

  return result;
}

// Version of transformTree that also recurses into sugar nodes.
// This makes it possible to split desugaring into several
// largely independent steps.
class SugaredTreeTransformer extends TreeTransformer {
  transformArrayElement(element) {
    if (element.type === "arraySpread") {
      return arraySpread(this.transformExpression(element.value));
    } else {
      return super.transformArrayElement(element);
    }
  }

  transformObjectElement(element) {
    if (element.type === "objectSpread") {
      return objectSpread(this.transformExpression(element.value));
    } else if (element.type === "keyName") {
      return keyName(this.transformName(element.key));
    } else if (element.type === "entry") {
      return entry(
        this.transformExpression(element.key),
        this.transformExpression(element.value)
      );
    } else {
      return super.transformObjectElement(element);
    }
  }

  transformArrayPatternElement(element) {
    if (element.type === "optional") {
      return optional(
        this.transformArrayPatternElement(element.name),
        this.transformExpression(element.defaultValue)
      );
    } else if (element.type === "arrayRest") {
      return arrayRest(this.transformNamePattern(element.name));
    } else {
      return super.transformArrayPatternElement(element);
    }
  }

  transformObjectPatternElement(element) {
    if (element.type === "optional") {
      return optional(
        this.transformObjectPatternElement(element.name),
        this.transformExpression(element.defaultValue)
      );
    } else if (element.type === "objectRest") {
      return objectRest(this.transformNamePattern(element.name));
    } else if (element.type === "keyName") {
      return keyName(this.transformName(element.key));
    } else if (element.type === "entry") {
      return entry(
        this.transformExpression(element.key),
        this.transformNamePattern(element.value)
      );
    } else {
      return super.transformObjectPatternElement(element);
    }
  }

  transformOptional(element) {
    if (element.name.type === "keyName" || element.name.type === "entry") {
      return optional(
        this.transformObjectPatternElement(element.name),
        this.transformExpression(element.defaultValue)
      );
    } else {
      return super.transformOptional(element);
    }
  }

  transformOtherExpression(expression) {
    if (
      expression === null ||
      typeof expression !== "object" ||
      !("type" in expression)
    ) {
      return super.transformOtherExpression(expression);
    }
    switch (expression.type) {
      case "group":
        return this.transformGroup(expression);
      case "arrow":
        return this.transformArrow(expression);
      case "pipeline":
        return this.transformPipeline(expression);
      default:
        return super.transformOtherExpression(expression);
    }
  }

  transformGroup(expression) {
    return group(this.transformExpression(expression.expression));
  }

  transformArrow(expression) {
    return arrow(
      paramList(
        expression.params.posParams.map((param) =>
          this.transformArrayPatternElement(param)
        ),
        expression.params.namedParams.map((param) =>
          this.transformObjectPatternElement(param)
        )
      ),
      this.transformExpression(expression.body)
    );
  }

  transformPipeline(expression) {
    return pipeline(
      this.transformExpression(expression.start),
      ...expression.steps.map((step) => this.transformPipelineStep(step))
    );
  }

  transformPipelineStep(step) {
    switch (step.type) {
      case "args":
        return this.transformArgsStep(step);
      case "pipeArgs":
        return this.transformPipeArgsStep(step);
      case "pipeDot":
        return this.transformPipeDotStep(step);
      case "pipe":
        return this.transformPipeStep(step);
      case "at":
        return this.transformAtStep(step);
      case "bang":
        return this.transformBangStep(step);
      default:
        return this.transformOtherStep(step);
    }
  }

  transformArgsStep(step) {
    return args(
      argList(
        step.args.posArgs.map((arg) => this.transformArrayElement(arg)),
        step.args.namedArgs.map((arg) => this.transformObjectElement(arg))
      )
    );
  }

  transformPipeArgsStep(step) {
    return pipeArgs(
      this.transformExpression(step.callee),
      argList(
        step.args.posArgs.map((arg) => this.transformArrayElement(arg)),
        step.args.namedArgs.map((arg) => this.transformObjectElement(arg))
      )
    );
  }

  transformPipeDotStep(step) {
    return pipeDot(this.transformExpression(step.index));
  }

  transformPipeStep(step) {
    return pipe(this.transformExpression(step.callee));
  }

  transformAtStep(step) {
    return at(this.transformExpression(step.index));
  }

  transformBangStep(step) {
    return step;
  }

  transformOtherStep(step) {
    return step;
  }
}

class MixedListSplitter extends SugaredTreeTransformer {
  transformArrow(expression) {
    return super.transformArrow(
      arrow(
        paramList(...this.splitParamList(expression.params.params)),
        expression.body
      )
    );
  }

  splitParamList(params) {
    const posParams = [];
    const namedParams = [];
    for (const param of params) {
      if (
        (param.type === "optional" &&
          (param.name.type === "keyName" || param.name.type === "entry")) ||
        param.type === "objectRest" ||
        param.type === "keyName" ||
        param.type === "entry"
      ) {
        namedParams.push(param);
      } else {
        posParams.push(param);
      }
    }
    return [posParams, namedParams];
  }

  transformArgsStep(step) {
    return super.transformArgsStep(
      args(argList(...this.splitArgList(step.args.args)))
    );
  }

  transformPipeArgsStep(step) {
    return super.transformPipeArgsStep(
      pipeArgs(step.callee, argList(...this.splitArgList(step.args.args)))
    );
  }

  splitArgList(args) {
    const posArgs = [];
    const namedArgs = [];
    for (const arg of args) {
      if (
        arg.type === "objectSpread" ||
        arg.type === "keyName" ||
        arg.type === "entry"
      ) {
        namedArgs.push(arg);
      } else {
        posArgs.push(arg);
      }
    }
    return [posArgs, namedArgs];
  }
}

const mixedListSplitter = new MixedListSplitter();

function splitMixedLists(expression) {
  return mixedListSplitter.transformExpression(expression);
}

class SpecializedSpreadRemover extends SugaredTreeTransformer {
  transformArrayElement(element) {
    if (element.type === "arraySpread") {
      return spread(element.value);
    } else {
      return super.transformArrayElement(element);
    }
  }

  transformObjectElement(element) {
    if (element.type === "objectSpread") {
      return spread(element.value);
    } else {
      return super.transformObjectElement(element);
    }
  }
}

const specializedSpreadRemover = new SpecializedSpreadRemover();

function removeSpecializedSpreads(expression) {
  return specializedSpreadRemover.transformExpression(expression);
}

class SpecializedRestRemover extends SugaredTreeTransformer {
  transformArrayPatternElement(element) {
    if (element.type === "arrayRest") {
      return rest(element.name);
    } else {
      return super.transformArrayPatternElement(element);
    }
  }

  transformObjectPatternElement(element) {
    if (element.type === "objectRest") {
      return rest(element.name);
    } else {
      return super.transformObjectPatternElement(element);
    }
  }
}

const specializedRestRemover = new SpecializedRestRemover();

function removeSpecializedRests(expression) {
  return specializedRestRemover.transformExpression(expression);
}

class FunctionSyntaxConverter extends SugaredTreeTransformer {
  transformArrow(expression) {
    return super.transformFunction(
      function_(
        expression.body,
        expression.params.posParams,
        expression.params.namedParams
      )
    );
  }
}

const functionSyntaxConverter = new FunctionSyntaxConverter();

function convertFunctionSyntax(expression) {
  return functionSyntaxConverter.transformExpression(expression);
}

class PipelineTransformer extends SugaredTreeTransformer {
  transformPipeline(pipeline) {
    let axis = pipeline.start;
    for (const step of pipeline.steps) {
      switch (step.type) {
        case "args":
          axis = call(axis, step.args.posArgs, step.args.namedArgs);
          break;
        case "pipeArgs":
          axis = call(
            step.callee,
            [axis, ...step.args.posArgs],
            step.args.namedArgs
          );
          break;
        case "pipeDot":
          axis = index(axis, step.index);
          break;
        case "pipe":
          axis = call(step.callee, [axis]);
          break;
        case "at":
          axis = index(axis, step.index);
          break;
        case "bang":
          axis = catch_(axis);
          break;
        default:
          throw new Error(`Invalid pipeline step type "${step.type}"`);
      }
    }
    return this.transformExpression(axis);
  }
}

const pipelineTransformer = new PipelineTransformer();

function convertPipelines(expression) {
  return pipelineTransformer.transformExpression(expression);
}

class ObjectSyntaxNormalizer extends SugaredTreeTransformer {
  transformObjectElement(element) {
    if (element.type === "keyName") {
      return this.transformEntryObjectElement([element.key.name, element.key]);
    } else if (element.type === "entry") {
      return this.transformEntryObjectElement([element.key, element.value]);
    } else {
      return super.transformObjectElement(element);
    }
  }

  transformEntryObjectElement([key, value]) {
    const transformedKey =
      key.type === "name" ? key.name : key.type === "literal" ? key.value : key;
    return super.transformEntryObjectElement([transformedKey, value]);
  }

  transformObjectPatternElement(element) {
    if (element.type === "optional") {
      const inner = this.transformObjectPatternElement(element.name);
      if (Array.isArray(inner)) {
        const [key, pattern] = inner;
        return this.transformEntryObjectPatternElement([
          key,
          optional(pattern, element.defaultValue),
        ]);
      } else {
        return [inner, optional(inner, element.defaultValue)];
      }
    } else if (element.type === "keyName") {
      return this.transformEntryObjectPatternElement([
        element.key.name,
        element.key.name,
      ]);
    } else if (element.type === "entry") {
      return this.transformEntryObjectPatternElement([
        element.key,
        element.value,
      ]);
    } else {
      return super.transformObjectPatternElement(element);
    }
  }

  transformEntryObjectPatternElement([key, pattern]) {
    const transformedKey =
      key.type === "name" ? key.name : key.type === "literal" ? key.value : key;
    return super.transformEntryObjectPatternElement([transformedKey, pattern]);
  }
}

const objectSyntaxNormalizer = new ObjectSyntaxNormalizer();

function normalizeObjectSyntax(expression) {
  return objectSyntaxNormalizer.transformExpression(expression);
}

class GroupRemover extends SugaredTreeTransformer {
  transformGroup(expression) {
    return this.transformExpression(expression.expression);
  }
}

const groupRemover = new GroupRemover();

function removeGroups(expression) {
  return groupRemover.transformExpression(expression);
}
