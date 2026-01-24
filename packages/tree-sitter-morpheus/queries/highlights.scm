; Morpheus Script syntax highlighting queries for Tree-sitter

; Keywords
[
  "if"
  "else"
  "for"
  "while"
  "switch"
  "case"
  "default"
  "try"
  "catch"
  "goto"
  "end"
] @keyword

; Break and continue statements
(break_statement) @keyword
(continue_statement) @keyword

; Scope keywords (local, level, game, etc.)
(scope_keyword) @keyword.storage

; Thread definitions
(thread_definition
  name: (identifier) @function.definition)

; Function calls
(call_expression
  function: (identifier) @function.call)

; Variables
(scoped_variable
  scope: (scope_keyword) @keyword.storage
  name: (identifier) @variable)

; Entity references
(entity_reference
  "$" @punctuation.special
  (identifier) @variable.special)

; Labels
(labeled_statement
  label: (identifier) @label)

; Goto targets
(goto_statement
  label: (identifier) @label)

; Operators
[
  "="
  "+="
  "-="
  "*="
  "/="
  "+"
  "-"
  "*"
  "/"
  "%"
  "=="
  "!="
  "<"
  ">"
  "<="
  ">="
  "&&"
  "||"
  "!"
  "&"
  "|"
  "^"
  "~"
  "?"
  ":"
  "::"
] @operator

; Punctuation
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  "."
  ";"
] @punctuation.delimiter

; Literals
(number) @number
(string) @string
(escape_sequence) @string.escape
(nil) @constant.builtin
(boolean) @boolean

; Comments
(comment) @comment
