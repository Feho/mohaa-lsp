{
  "targets": [
    {
      "target_name": "tree_sitter_morpheus_binding",
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "src"
      ],
      "sources": [
        "bindings/node/binding.cc",
        "src/parser.c",
        "src/scanner.c"
      ],
      "cflags_c": [
        "-std=c11"
      ],
      "defines": [
        "NAPI_VERSION=7",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ]
    }
  ]
}
