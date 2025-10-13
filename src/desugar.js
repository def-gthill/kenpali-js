import {
  array,
  arrayPattern,
  block,
  call,
  catch_,
  function_,
  index,
  object,
  objectPattern,
  optional,
  rest,
  spread,
  transformTree,
} from "./kpast.js";

export default function desugar(expression) {
  return transformTree(expression, {
    handleArray(node, transformExpression) {
      return array(
        ...node.elements.map((element) => {
          if (element.type === "arraySpread") {
            return spread(transformExpression(element.expression));
          } else {
            return transformExpression(element);
          }
        })
      );
    },
    handleObject(node, transformExpression) {
      return object(
        ...node.entries.map((element) => {
          if (element.type === "objectSpread") {
            return spread(transformExpression(element.expression));
          } else if (element.type === "name") {
            return [element.name, element];
          } else {
            const [key, value] = element;
            return [
              desugarProperty(key, transformExpression),
              transformExpression(value),
            ];
          }
        })
      );
    },
    handleBlock(node, transformExpression) {
      return block(
        ...node.defs.map(([name, value]) => [
          name ? desugarNamePattern(name, transformExpression) : name,
          transformExpression(value),
        ]),
        transformExpression(node.result)
      );
    },
    handleFunction(node, transformExpression) {
      return function_(
        transformExpression(node.body),
        desugarArrayPattern(node.params ?? [], transformExpression),
        desugarObjectPattern(node.namedParams ?? [], transformExpression)
      );
    },
    handleOther(node, transformExpression) {
      switch (node.type) {
        case "group":
          return desugarGroup(node, transformExpression);
        case "pipeline":
          return desugarPipeline(node, transformExpression);
        default:
          return node;
      }
    },
  });
}

function desugarArrayElements(elements, transformExpression) {
  return elements.map((element) => {
    if (element.type === "arraySpread") {
      return spread(transformExpression(element.expression));
    } else {
      return transformExpression(element);
    }
  });
}

function desugarObjectEntries(entries, transformExpression) {
  return entries.map((element) => {
    if (element.type === "objectSpread") {
      return spread(transformExpression(element.expression));
    } else {
      const [key, value] = element;
      return [
        desugarProperty(key, transformExpression),
        transformExpression(value),
      ];
    }
  });
}

function desugarNamePattern(pattern, transformExpression) {
  if (typeof pattern === "string") {
    return pattern;
  }
  switch (pattern.type) {
    case "arrayPattern":
      return arrayPattern(
        ...pattern.names.map((element) =>
          desugarNamePatternElement(element, transformExpression)
        )
      );
    case "objectPattern":
      return objectPattern(
        ...pattern.entries.map((element) =>
          desugarObjectPatternElement(element, transformExpression)
        )
      );
    default:
      throw new Error(`Invalid name pattern type ${pattern.type}`);
  }
}

function desugarArrayPattern(pattern, transformExpression) {
  return pattern.map((element) =>
    desugarNamePatternElement(element, transformExpression)
  );
}

function desugarObjectPattern(pattern, transformExpression) {
  return pattern.map((element) =>
    desugarObjectPatternElement(element, transformExpression)
  );
}

function desugarObjectPatternElement(element, transformExpression) {
  if (element.type === "objectRest") {
    return rest(desugarNamePattern(element.name, transformExpression));
  } else {
    const [key, name] = element;
    return [
      desugarNamePattern(key, transformExpression),
      desugarNamePatternElement(name, transformExpression),
    ];
  }
}

function desugarNamePatternElement(element, transformExpression) {
  if (typeof element === "object" && element.type === "arrayRest") {
    return rest(desugarNamePattern(element.name, transformExpression));
  } else if (typeof element === "object" && element.type === "optional") {
    return optional(
      desugarNamePattern(element.name, transformExpression),
      transformExpression(element.defaultValue)
    );
  } else {
    return desugarNamePattern(element, transformExpression);
  }
}

function desugarGroup(expression, transformExpression) {
  return transformExpression(expression.expression);
}

function desugarProperty(expression, transformExpression) {
  if (expression.type === "name") {
    return expression.name;
  } else if (expression.type === "literal") {
    return expression.value;
  } else {
    return transformExpression(expression);
  }
}

function desugarPipeline(expression, transformExpression) {
  let axis = transformExpression(expression.start);
  for (const [op, ...target] of expression.calls) {
    if (op === "CALL") {
      const [allArgs] = target;
      const { args, namedArgs } = allArgs;
      axis = call(
        axis,
        desugarArrayElements(args, transformExpression),
        desugarObjectEntries(namedArgs, transformExpression)
      );
    } else if (op === "PIPECALL") {
      const [callee, allArgs] = target;
      const { args, namedArgs } = allArgs;
      axis = call(
        transformExpression(callee),
        [axis, ...desugarArrayElements(args, transformExpression)],
        desugarObjectEntries(namedArgs, transformExpression)
      );
    } else if (op === "PIPEDOT") {
      const [propertyName] = target;
      axis = index(axis, propertyName);
    } else if (op === "PIPE") {
      const [callee] = target;
      axis = call(transformExpression(callee), [axis]);
    } else if (op === "AT") {
      const [i] = target;
      axis = index(axis, transformExpression(i));
    } else if (op === "BANG") {
      axis = catch_(axis);
    } else {
      throw new Error(`Invalid pipeline op ${op}`);
    }
  }
  return axis;
}
