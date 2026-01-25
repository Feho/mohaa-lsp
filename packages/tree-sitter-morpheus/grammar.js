/**
 * Tree-sitter grammar for MOHAA Morpheus Script (.scr)
 *
 * Morpheus Script is the scripting language used in Medal of Honor: Allied Assault
 * and its expansions (Spearhead, Breakthrough) as well as community patches (Reborn, NightFall).
 */

/// <reference types="tree-sitter-cli/dsl" />

module.exports = grammar({
  name: 'morpheus',

  // External scanner for complex tokens
  externals: $ => [
    $._line_continuation,
    $.unquoted_string,
    $.file_path,
  ],

  extras: $ => [
    /\s/,
    $.comment,
    $._line_continuation,
  ],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.primary_expression, $.call_expression],
    [$.ternary_expression, $.argument_list],
    [$.argument_list, $.const_array],
    [$.parameter_list, $.primary_expression],
    [$.call_expression],
    [$.ternary_expression, $.const_array],
    [$.const_array],
    [$.end_statement],
  ],

  rules: {
    // Entry point - a script file contains thread definitions
    source_file: $ => repeat($.thread_definition),

    // ==================== THREAD STRUCTURE ====================

    // Thread definition: mythread local.param1 local.param2:
    //   body statements
    // end
    thread_definition: $ => seq(
      field('name', $.identifier),
      optional(field('parameters', $.parameter_list)),
      ':',
      field('body', $.thread_body),
    ),

    parameter_list: $ => repeat1($.scoped_variable),

    // Thread body contains statements and ends with 'end'
    thread_body: $ => seq(
      repeat($._block_statement),
      $.end_statement,
    ),

    // End statement terminates a thread (optionally with return value on same line)
    // Use prec(-1) to prefer other interpretations when there's ambiguity
    end_statement: $ => seq(
      'end',
      optional(prec(-1, field('value', $._expression))),
    ),

    // ==================== STATEMENTS ====================

    // Statements that can appear inside a thread body (not 'end')
    _block_statement: $ => choice(
      $.labeled_statement,
      $.if_statement,
      $.for_statement,
      $.while_statement,
      $.switch_statement,
      $.try_statement,
      $.break_statement,
      $.continue_statement,
      $.goto_statement,
      $.expression_statement,
      $.empty_statement,
    ),

    // Labeled statement for goto targets inside threads
    labeled_statement: $ => prec.right(seq(
      field('label', $.identifier),
      ':',
      optional($._block_statement),
    )),

    // Block of statements for control flow (if/for/while)
    block: $ => prec.left(repeat1($._block_statement)),

    // Empty statement
    empty_statement: $ => ';',

    // Expression statement - use prec.right to greedily consume optional semicolon
    expression_statement: $ => prec.right(seq(
      $._expression,
      optional(';'),
    )),

    // if/else statement
    if_statement: $ => prec.right(seq(
      'if',
      field('condition', $.parenthesized_expression),
      field('consequence', $.block_or_statement),
      optional(seq(
        'else',
        field('alternative', $.block_or_statement),
      )),
    )),

    block_or_statement: $ => choice(
      seq('{', repeat($._block_statement), '}'),
      $._block_statement,
    ),

    // for loop
    for_statement: $ => seq(
      'for',
      '(',
      field('init', optional($._expression)),
      ';',
      field('condition', optional($._expression)),
      ';',
      field('update', optional($._expression)),
      ')',
      field('body', $.block_or_statement),
    ),

    // while loop
    while_statement: $ => seq(
      'while',
      field('condition', $.parenthesized_expression),
      field('body', $.block_or_statement),
    ),

    // switch statement
    switch_statement: $ => seq(
      'switch',
      field('value', $.parenthesized_expression),
      '{',
      repeat($.switch_case),
      optional($.default_case),
      '}',
    ),

    switch_case: $ => seq(
      'case',
      field('value', $._expression),
      ':',
      repeat($._block_statement),
    ),

    default_case: $ => seq(
      'default',
      ':',
      repeat($._block_statement),
    ),

    // try/catch statement
    try_statement: $ => seq(
      'try',
      field('body', $.block_or_statement),
      'catch',
      field('handler', $.block_or_statement),
    ),

    break_statement: $ => 'break',
    continue_statement: $ => 'continue',

    goto_statement: $ => seq(
      'goto',
      field('label', $.identifier),
    ),

    // ==================== EXPRESSIONS ====================

    _expression: $ => choice(
      $.assignment_expression,
      $.binary_expression,
      $.unary_expression,
      $.call_expression,
      $.member_expression,
      $.subscript_expression,
      $.primary_expression,
      $.const_array,
      $.parenthesized_expression,
      $.ternary_expression,
    ),

    primary_expression: $ => choice(
      $.identifier,
      $.scoped_variable,
      $.entity_reference,
      $.number,
      $.string,
      $.nil,
      $.boolean,
      $.vector,
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    // Assignment: local.var = value
    assignment_expression: $ => prec.right(1, seq(
      field('left', choice(
        $.scoped_variable,
        $.member_expression,
        $.subscript_expression,
      )),
      field('operator', choice('=', '+=', '-=', '*=', '/=')),
      field('right', $._expression),
    )),

    // Binary expressions with precedence
    binary_expression: $ => choice(
      prec.left(2, seq($._expression, '||', $._expression)),
      prec.left(3, seq($._expression, '&&', $._expression)),
      prec.left(4, seq($._expression, choice('==', '!=', '<', '>', '<=', '>='), $._expression)),
      prec.left(5, seq($._expression, choice('+', '-'), $._expression)),
      prec.left(6, seq($._expression, choice('*', '/', '%'), $._expression)),
      prec.left(7, seq($._expression, choice('&', '|', '^'), $._expression)),
    ),

    // Unary expressions
    unary_expression: $ => prec.right(8, seq(
      choice('!', '-', '~'),
      $._expression,
    )),

    // Ternary expression: cond ? true : false
    ternary_expression: $ => prec.right(0, seq(
      field('condition', $._expression),
      '?',
      field('consequence', $._expression),
      ':',
      field('alternative', $._expression),
    )),

    // Function/method call: entity functionname arg1 arg2
    call_expression: $ => prec.left(9, seq(
      optional(field('target', choice(
        $.scoped_variable,
        $.entity_reference,
        $.member_expression,
        $.identifier,
      ))),
      field('function', $.identifier),
      optional(field('arguments', $.argument_list)),
    )),

    argument_list: $ => prec.left(repeat1($._expression)),

    // Member access: entity.property
    member_expression: $ => prec.left(10, seq(
      field('object', $._expression),
      '.',
      field('property', $.identifier),
    )),

    // Array subscript: array[index]
    subscript_expression: $ => prec.left(10, seq(
      field('object', $._expression),
      '[',
      field('index', $._expression),
      ']',
    )),

    // Const array: val1 :: val2 :: val3
    const_array: $ => prec.right(seq(
      $._expression,
      repeat1(seq('::', $._expression)),
    )),

    // ==================== VARIABLES ====================

    // Scoped variables: local.var, level.var, game.var, group.var, parm.var
    scoped_variable: $ => seq(
      field('scope', $.scope_keyword),
      '.',
      field('name', $.identifier),
    ),

    scope_keyword: $ => choice(
      'local',
      'level',
      'game',
      'group',
      'parm',
      'self',
      'owner',
    ),

    // Entity reference: $entityname or $("dynamic")
    entity_reference: $ => choice(
      seq('$', $.identifier),
      seq('$', '(', $._expression, ')'),
    ),

    // ==================== LITERALS ====================

    identifier: $ => /[a-zA-Z_@#'][a-zA-Z0-9_@#'-]*/,

    number: $ => choice(
      // Integer
      /\d+/,
      // Float
      /\d*\.\d+/,
      /\d+\.\d*/,
      // Hex
      /0[xX][0-9a-fA-F]+/,
    ),

    string: $ => seq(
      '"',
      repeat(choice(
        /[^"\\]+/,
        $.escape_sequence,
      )),
      '"',
    ),

    escape_sequence: $ => /\\./,

    nil: $ => 'NIL',

    boolean: $ => choice('true', 'false'),

    // Vector literal: (x y z)
    vector: $ => seq(
      '(',
      $.number,
      $.number,
      $.number,
      ')',
    ),

    // ==================== COMMENTS ====================

    comment: $ => choice(
      // Line comment
      seq('//', /.*/),
      // Block comment
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
      // Doc comment
      seq('/**', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
    ),
  },
});
