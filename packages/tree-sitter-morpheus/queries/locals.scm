; Local variable scoping for Morpheus Script

; Thread definitions create a new scope
(thread_definition) @scope

; For loops create a scope
(for_statement) @scope

; While loops create a scope
(while_statement) @scope

; If statements create scope
(if_statement) @scope

; Try/catch blocks create scope
(try_statement) @scope

; Parameter definitions
(thread_definition
  parameters: (parameter_list
    (scoped_variable) @definition.parameter))

; Local variable assignments
(assignment_expression
  left: (scoped_variable
    scope: (scope_keyword) @_scope
    name: (identifier) @definition.var)
  (#eq? @_scope "local"))

; Variable references
(scoped_variable
  name: (identifier) @reference)
