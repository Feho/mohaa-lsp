#include <napi.h>

typedef struct TSLanguage TSLanguage;

extern "C" TSLanguage *tree_sitter_morpheus();

// "tree-sitter", "currentVersion" returns a numeric version number
// "tree-sitter", "language" returns the language pointer

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports["name"] = Napi::String::New(env, "morpheus");
  exports["language"] = Napi::External<TSLanguage>::New(env, tree_sitter_morpheus());
  return exports;
}

NODE_API_MODULE(tree_sitter_morpheus_binding, Init)
