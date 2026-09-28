import ts from "typescript";

const exemptionPattern = /^\s*\/\/\s*error-provenance:\s*allow\s+(expected|cleanup)\s+--\s+(.+?)\s*$/u;
const anyExemptionPattern = /^\s*\/\/\s*error-provenance:\s*allow\b.*$/u;

export function scanErrorProvenance(sourceText, fileName) {
  if (isExcluded(fileName)) return [];
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const diagnostics = [];

  for (const match of sourceText.matchAll(/^.*error-provenance:\s*allow.*$/gmu)) {
    const text = match[0];
    if (anyExemptionPattern.test(text) && !exemptionPattern.test(text)) {
      diagnostics.push(createDiagnostic(sourceFile, match.index ?? 0, "malformed-exemption", "Error provenance exemptions must use allow expected|cleanup with a non-empty reason."));
    }
  }

  const visit = (node) => {
    if (ts.isCatchClause(node)) inspectCatch(node);
    if (ts.isCallExpression(node) && isPromiseCatch(node)) inspectPromiseCatch(node);
    ts.forEachChild(node, visit);
  };

  const inspectCatch = (clause) => {
    if (hasValidExemption(sourceText, clause)) return;
    if (clause.variableDeclaration === undefined || !ts.isIdentifier(clause.variableDeclaration.name)) {
      diagnostics.push(createDiagnostic(sourceFile, clause.getStart(sourceFile), "catch-binding", "Catch clauses must bind the thrown value or declare a reasoned expected/cleanup exemption."));
      return;
    }
    inspectHandler(clause.block, clause.variableDeclaration.name.text, clause.getStart(sourceFile), "catch");
  };

  const inspectPromiseCatch = (call) => {
    const handler = call.arguments[0];
    if (handler === undefined || (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler))) return;
    if (hasValidExemption(sourceText, handler)) return;
    const parameter = handler.parameters[0];
    const position = handler.getStart(sourceFile);
    if (parameter === undefined || !ts.isIdentifier(parameter.name)) {
      diagnostics.push(createDiagnostic(sourceFile, position, "promise-rejection-value", "Promise rejection handlers must bind and preserve the rejection value or declare a reasoned exemption."));
      return;
    }
    inspectHandler(handler.body, parameter.name.text, position, "promise");
  };

  const inspectHandler = (body, binding, position, kind) => {
    const handlerDiagnostics = [];
    walk(body, (node) => {
      if (ts.isNewExpression(node) && isErrorConstructor(node.expression) && !hasCauseOption(node)) {
        handlerDiagnostics.push(createDiagnostic(sourceFile, node.getStart(sourceFile), "missing-error-cause", "Contextual errors created inside a failure handler must retain the original value with { cause }."));
      }
      if (ts.isObjectLiteralExpression(node) && isFailureEnvelope(node) && (!hasProperty(node, "exception") || !hasProperty(node, "referenceId"))) {
        handlerDiagnostics.push(createDiagnostic(sourceFile, node.getStart(sourceFile), "failure-envelope", "Owned failure envelopes must carry both referenceId and serialized exception details."));
      }
    });
    diagnostics.push(...dedupe(handlerDiagnostics));
    if (handlerDiagnostics.length === 0 && !usesBinding(body, binding)) {
      diagnostics.push(createDiagnostic(sourceFile, position, "unused-catch-value", `${kind === "catch" ? "Caught" : "Rejected"} values must be propagated, enriched with cause, or passed to the owning logger/transport.`));
    }
  };

  visit(sourceFile);
  return dedupe(diagnostics).sort((left, right) => left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule));
}

function isExcluded(fileName) {
  const normalized = fileName.replaceAll("\\", "/");
  return /(?:^|\/)(?:dist|dist-desktop-overlay|storybook-static|coverage|node_modules)\//u.test(normalized) ||
    /(?:\.test|\.spec|\.stories)\.[cm]?[jt]sx?$/u.test(normalized) || /\.d\.[cm]?ts$/u.test(normalized);
}

function isPromiseCatch(node) {
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "catch";
}

function hasValidExemption(sourceText, node) {
  const start = node.getFullStart();
  const comments = ts.getLeadingCommentRanges(sourceText, start) ?? [];
  const last = comments.at(-1);
  if (last === undefined) return false;
  const between = sourceText.slice(last.end, node.getStart());
  return /^\s*$/u.test(between) && exemptionPattern.test(sourceText.slice(last.pos, last.end));
}

function usesBinding(body, binding) {
  let used = false;
  const visit = (node, shadowed) => {
    if (used) return;
    const nestedScope = node !== body && introducesBindingScope(node, binding);
    const nextShadowed = shadowed || nestedScope;
    if (!nextShadowed && ts.isIdentifier(node) && node.text === binding && isValueReference(node)) {
      used = true;
      return;
    }
    ts.forEachChild(node, (child) => visit(child, nextShadowed));
  };
  visit(body, false);
  return used;
}

function introducesBindingScope(node, binding) {
  if (ts.isFunctionLike(node)) {
    return node.parameters.some((parameter) => bindingNameContains(parameter.name, binding));
  }
  if (!ts.isBlock(node)) return false;
  return node.statements.some((statement) => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some((declaration) => bindingNameContains(declaration.name, binding));
    }
    return (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === binding;
  });
}

function bindingNameContains(name, binding) {
  if (ts.isIdentifier(name)) return name.text === binding;
  return name.elements.some((element) => !ts.isOmittedExpression(element) && bindingNameContains(element.name, binding));
}

function isValueReference(node) {
  const parent = node.parent;
  if (parent === undefined) return false;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) || ts.isTypeParameterDeclaration(parent)) && parent.name === node) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) || ts.isMethodSignature(parent) || ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) && parent.name === node) return false;
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent) || ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) ||
      ts.isTypeReferenceNode(parent) || ts.isExpressionWithTypeArguments(parent)) return false;
  return true;
}

function walk(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

function isErrorConstructor(expression) {
  if (ts.isIdentifier(expression)) return expression.text.endsWith("Error");
  return ts.isPropertyAccessExpression(expression) && expression.name.text.endsWith("Error");
}

function hasCauseOption(node) {
  const options = node.arguments?.at(-1);
  return options !== undefined && ts.isObjectLiteralExpression(options) && hasProperty(options, "cause");
}

function hasProperty(node, name) {
  return node.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false;
    return property.name !== undefined && propertyName(property.name) === name;
  });
}

function propertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : "";
}

function isFailureEnvelope(node) {
  const type = node.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property.name) === "type");
  if (type === undefined || !ts.isPropertyAssignment(type) || !ts.isStringLiteral(type.initializer)) return false;
  return ["failed", "command-failed"].includes(type.initializer.text) && hasProperty(node, "message");
}

function createDiagnostic(sourceFile, position, rule, message) {
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  return { fileName: sourceFile.fileName, line: location.line + 1, column: location.character + 1, rule, message };
}

function dedupe(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.line}:${diagnostic.column}:${diagnostic.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
