package tree_sitter_morpheus_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-morpheus"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_morpheus.Language())
	if language == nil {
		t.Errorf("Error loading Morpheus grammar")
	}
}
