import {
  args,
  arrayRest,
  at,
  call,
  catch_,
  group,
  index,
  objectRest,
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

  // Kenpali Code uses different syntax for spreads in arrays than for spreads in objects.
  // This step converts both to the single `spread` node mandated by Kenpali JSON.
  result = removeSpecializedSpreads(result);

  // Kenpali Code uses different syntax for rest elements in arrays than for rest elements in objects.
  // This step converts both to the single `rest` node mandated by Kenpali JSON.
  result = removeSpecializedRests(result);

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
    } else {
      return super.transformObjectElement(element);
    }
  }

  transformArrayPatternElement(element) {
    if (element.type === "arrayRest") {
      return arrayRest(this.transformNamePattern(element.name));
    } else {
      return super.transformArrayPatternElement(element);
    }
  }

  transformObjectPatternElement(element) {
    if (element.type === "objectRest") {
      return objectRest(this.transformNamePattern(element.name));
    } else {
      return super.transformObjectPatternElement(element);
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
      case "pipeline":
        return this.transformPipeline(expression);
      default:
        return super.transformOtherExpression(expression);
    }
  }

  transformGroup(expression) {
    return group(this.transformExpression(expression.expression));
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
      step.args.map((arg) => this.transformArrayElement(arg)),
      step.namedArgs.map((arg) => this.transformObjectElement(arg))
    );
  }

  transformPipeArgsStep(step) {
    return pipeArgs(
      this.transformExpression(step.callee),
      step.args.map((arg) => this.transformArrayElement(arg)),
      step.namedArgs.map((arg) => this.transformObjectElement(arg))
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

class SpecializedSpreadRemover extends SugaredTreeTransformer {
  transformArrayElement(element) {
    if (element.type === "arraySpread") {
      return spread(element.expression);
    } else {
      return super.transformArrayElement(element);
    }
  }

  transformObjectElement(element) {
    if (element.type === "objectSpread") {
      return spread(element.expression);
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

class PipelineTransformer extends SugaredTreeTransformer {
  transformPipeline(pipeline) {
    let axis = pipeline.start;
    for (const step of pipeline.steps) {
      switch (step.type) {
        case "args":
          axis = call(axis, step.args, step.namedArgs);
          break;
        case "pipeArgs":
          axis = call(step.callee, [axis, ...step.args], step.namedArgs);
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
    if (element.type === "name") {
      return this.transformEntryObjectElement([element.name, element]);
    } else {
      return super.transformObjectElement(element);
    }
  }
  transformEntryObjectElement([key, value]) {
    const transformedKey =
      key.type === "name" ? key.name : key.type === "literal" ? key.value : key;
    return super.transformEntryObjectElement([transformedKey, value]);
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
