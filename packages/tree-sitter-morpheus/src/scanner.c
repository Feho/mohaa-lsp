#include <tree_sitter/parser.h>
#include <wctype.h>

enum TokenType {
  LINE_CONTINUATION,
};

void *tree_sitter_morpheus_external_scanner_create() {
  return NULL;
}

void tree_sitter_morpheus_external_scanner_destroy(void *payload) {
}

unsigned tree_sitter_morpheus_external_scanner_serialize(void *payload, char *buffer) {
  return 0;
}

void tree_sitter_morpheus_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
}

bool tree_sitter_morpheus_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  if (valid_symbols[LINE_CONTINUATION]) {
    while (iswspace(lexer->lookahead)) {
      if (lexer->lookahead == '\n') break; // Don't skip newlines yet
      lexer->advance(lexer, true);
    }

    if (lexer->lookahead == '\\') {
      lexer->advance(lexer, false);
      
      if (lexer->lookahead == '\r') {
        lexer->advance(lexer, false);
      }
      
      if (lexer->lookahead == '\n') {
        lexer->advance(lexer, false);
        lexer->result_symbol = LINE_CONTINUATION;
        return true;
      }
    }
  }

  return false;
}
