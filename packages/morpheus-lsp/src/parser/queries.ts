/**
 * Tree-sitter queries for extracting information from Morpheus Script AST.
 * 
 * Provides query-based extraction of threads, labels, variables, and other constructs.
 */

import Parser from 'web-tree-sitter';
import { getLanguage } from './treeSitterParser';
import { ThreadDefinition, LabelDefinition, VariableDefinition, SymbolInfo } from '../data/types';

// Query strings - will be compiled into Query objects on first use
// Threads are always thread_definition nodes with a thread_body
const THREAD_QUERY_SOURCE = `
(thread_definition
  name: (identifier) @name
  parameters: (parameter_list)? @params
) @thread
`;

// Labels inside threads (labeled_statement nodes inside thread_body)
const LABEL_QUERY_SOURCE = `
(labeled_statement
  label: (identifier) @label
) @stmt
`;

const VARIABLE_ASSIGNMENT_QUERY_SOURCE = `
(assignment_expression
  left: (scoped_variable
    scope: (scope_keyword) @scope
    name: (identifier) @name
  )
)
`;

// Secondary query for level/game/group variables parsed as member_expression
// The grammar parses level.x, game.y, group.z as member_expression with self_reference
const MEMBER_VARIABLE_ASSIGNMENT_QUERY_SOURCE = `
(assignment_expression
  left: (member_expression
    object: (primary_expression
      (self_reference) @scope)
    property: (identifier) @name
  )
)
`;

const CALL_EXPRESSION_QUERY_SOURCE = `
(call_expression
  target: (_)? @target
  function: (identifier) @function
  arguments: (argument_list)? @args
)
`;

const GOTO_QUERY_SOURCE = `
(goto_statement
  label: (identifier) @label
)
`;

// Cached compiled queries
let threadQuery: Parser.Query | null = null;
let labelQuery: Parser.Query | null = null;
let variableQuery: Parser.Query | null = null;
let memberVariableQuery: Parser.Query | null = null;
let callQuery: Parser.Query | null = null;
let gotoQuery: Parser.Query | null = null;

/**
 * Get or compile the thread definition query.
 */
function getThreadQuery(): Parser.Query {
  if (!threadQuery) {
    threadQuery = getLanguage().query(THREAD_QUERY_SOURCE);
  }
  return threadQuery;
}

/**
 * Get or compile the label query.
 */
function getLabelQuery(): Parser.Query {
  if (!labelQuery) {
    labelQuery = getLanguage().query(LABEL_QUERY_SOURCE);
  }
  return labelQuery;
}

/**
 * Get or compile the variable assignment query.
 */
function getVariableQuery(): Parser.Query {
  if (!variableQuery) {
    variableQuery = getLanguage().query(VARIABLE_ASSIGNMENT_QUERY_SOURCE);
  }
  return variableQuery;
}

/**
 * Get or compile the member variable assignment query (for level.x, game.y, group.z).
 */
function getMemberVariableQuery(): Parser.Query {
  if (!memberVariableQuery) {
    memberVariableQuery = getLanguage().query(MEMBER_VARIABLE_ASSIGNMENT_QUERY_SOURCE);
  }
  return memberVariableQuery;
}

/**
 * Get or compile the call expression query.
 */
function getCallQuery(): Parser.Query {
  if (!callQuery) {
    callQuery = getLanguage().query(CALL_EXPRESSION_QUERY_SOURCE);
  }
  return callQuery;
}

/**
 * Get or compile the goto statement query.
 */
function getGotoQuery(): Parser.Query {
  if (!gotoQuery) {
    gotoQuery = getLanguage().query(GOTO_QUERY_SOURCE);
  }
  return gotoQuery;
}

/**
 * Extract all thread definitions from a syntax tree.
 * Threads are parsed as thread_definition nodes with a thread_body.
 */
export function findThreads(tree: Parser.Tree, uri: string): ThreadDefinition[] {
  const query = getThreadQuery();
  const matches = query.matches(tree.rootNode);
  const threads: ThreadDefinition[] = [];
  const seenNames = new Set<string>();

  for (const match of matches) {
    const threadNode = match.captures.find(c => c.name === 'thread')?.node;
    const nameNode = match.captures.find(c => c.name === 'name')?.node;
    const paramsNode = match.captures.find(c => c.name === 'params')?.node;

    if (!nameNode || !threadNode) continue;
    
    // Avoid duplicates
    if (seenNames.has(nameNode.text)) continue;
    seenNames.add(nameNode.text);

    // Extract parameter names from the parameter_list node
    const parameters: string[] = [];
    if (paramsNode) {
      for (const child of paramsNode.namedChildren) {
        if (child.type === 'scoped_variable') {
          const nameChild = child.childForFieldName('name');
          if (nameChild) {
            parameters.push(nameChild.text);
          }
        }
      }
    }

    threads.push({
      name: nameNode.text,
      parameters,
      line: nameNode.startPosition.row,
      character: nameNode.startPosition.column,
      uri,
    });
  }

  return threads;
}

/**
 * Extract all labeled statements from a syntax tree.
 * Labels are inside thread bodies (goto targets).
 */
export function findLabels(tree: Parser.Tree, uri: string): LabelDefinition[] {
  const query = getLabelQuery();
  const matches = query.matches(tree.rootNode);
  const labels: LabelDefinition[] = [];

  for (const match of matches) {
    const labelNode = match.captures.find(c => c.name === 'label')?.node;
    if (!labelNode) continue;

    labels.push({
      name: labelNode.text,
      line: labelNode.startPosition.row,
      character: labelNode.startPosition.column,
      uri,
    });
  }

  return labels;
}

/**
 * Variable definition with scope and first occurrence info.
 */
export { VariableDefinition } from '../data/types';

/**
 * Extract all unique variable definitions from a syntax tree.
 * Returns first occurrence of each scope.name combination.
 * Handles both scoped_variable (local.x) and member_expression (level.y) patterns.
 */
export function findVariables(tree: Parser.Tree, uri: string): VariableDefinition[] {
  const seen = new Map<string, VariableDefinition>();

  // Query for scoped_variable pattern (local.x, parm.y, etc.)
  const scopedQuery = getVariableQuery();
  const scopedMatches = scopedQuery.matches(tree.rootNode);

  for (const match of scopedMatches) {
    const scopeNode = match.captures.find(c => c.name === 'scope')?.node;
    const nameNode = match.captures.find(c => c.name === 'name')?.node;

    if (!scopeNode || !nameNode) continue;

    const scope = scopeNode.text;
    const name = nameNode.text;
    const key = `${scope}.${name}`;

    // Only keep first occurrence
    if (!seen.has(key)) {
      seen.set(key, {
        name,
        scope,
        line: nameNode.startPosition.row,
        character: nameNode.startPosition.column,
        uri,
      });
    }
  }

  // Query for member_expression pattern (level.x, game.y, group.z)
  const memberQuery = getMemberVariableQuery();
  const memberMatches = memberQuery.matches(tree.rootNode);

  for (const match of memberMatches) {
    const scopeNode = match.captures.find(c => c.name === 'scope')?.node;
    const nameNode = match.captures.find(c => c.name === 'name')?.node;

    if (!scopeNode || !nameNode) continue;

    const scope = scopeNode.text;
    // Only include level, game, group (not self, owner)
    if (!['level', 'game', 'group'].includes(scope)) continue;

    const name = nameNode.text;
    const key = `${scope}.${name}`;

    // Only keep first occurrence
    if (!seen.has(key)) {
      seen.set(key, {
        name,
        scope,
        line: nameNode.startPosition.row,
        character: nameNode.startPosition.column,
        uri,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Call expression information.
 */
export interface CallInfo {
  target: string | null;
  functionName: string;
  arguments: Parser.SyntaxNode[];
  node: Parser.SyntaxNode;
}

/**
 * Extract all function/method calls from a syntax tree.
 */
export function findCalls(tree: Parser.Tree): CallInfo[] {
  const query = getCallQuery();
  const matches = query.matches(tree.rootNode);
  const calls: CallInfo[] = [];

  for (const match of matches) {
    const funcNode = match.captures.find(c => c.name === 'function')?.node;
    const targetNode = match.captures.find(c => c.name === 'target')?.node;
    const argsNode = match.captures.find(c => c.name === 'args')?.node;

    if (!funcNode) continue;

    const callNode = funcNode.parent;
    if (!callNode) continue;

    calls.push({
      target: targetNode?.text ?? null,
      functionName: funcNode.text,
      arguments: argsNode?.namedChildren ?? [],
      node: callNode,
    });
  }

  return calls;
}

/**
 * Extract all goto statements from a syntax tree.
 */
export function findGotos(tree: Parser.Tree): { label: string; node: Parser.SyntaxNode }[] {
  const query = getGotoQuery();
  const matches = query.matches(tree.rootNode);
  const gotos: { label: string; node: Parser.SyntaxNode }[] = [];

  for (const match of matches) {
    const labelNode = match.captures.find(c => c.name === 'label')?.node;
    if (!labelNode) continue;

    gotos.push({
      label: labelNode.text,
      node: labelNode.parent!,
    });
  }

  return gotos;
}

/**
 * Find the thread definition that contains a given position.
 */
export function findContainingThread(
  tree: Parser.Tree,
  line: number,
  column: number
): Parser.SyntaxNode | null {
  const point: Parser.Point = { row: line, column };
  const node = tree.rootNode.namedDescendantForPosition(point);

  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'thread_definition') {
      return current;
    }
    current = current.parent;
  }

  return null;
}

/**
 * Get symbols (threads, labels, variables) for document outline.
 */
export function getDocumentSymbols(tree: Parser.Tree, uri: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  // Add threads
  for (const thread of findThreads(tree, uri)) {
    symbols.push({
      name: thread.name,
      kind: 'thread',
      line: thread.line,
      character: thread.character,
      uri,
    });
  }

  // Add labels
  for (const label of findLabels(tree, uri)) {
    symbols.push({
      name: label.name,
      kind: 'label',
      line: label.line,
      character: label.character,
      uri,
    });
  }

  // Add variables
  for (const variable of findVariables(tree, uri)) {
    symbols.push({
      name: `${variable.scope}.${variable.name}`,
      kind: 'variable',
      scope: variable.scope,
      line: variable.line,
      character: variable.character,
      uri,
    });
  }

  return symbols;
}

/**
 * Reset cached queries (for testing or when language changes).
 */
export function resetQueries(): void {
  if (threadQuery) {
    threadQuery.delete();
    threadQuery = null;
  }
  if (labelQuery) {
    labelQuery.delete();
    labelQuery = null;
  }
  if (variableQuery) {
    variableQuery.delete();
    variableQuery = null;
  }
  if (memberVariableQuery) {
    memberVariableQuery.delete();
    memberVariableQuery = null;
  }
  if (callQuery) {
    callQuery.delete();
    callQuery = null;
  }
  if (gotoQuery) {
    gotoQuery.delete();
    gotoQuery = null;
  }
}
