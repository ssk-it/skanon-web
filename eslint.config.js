import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

// The thresholds and their reason: docs/clean-code.md, section "What the tooling enforces". They are blocking: a warning that can be merged anyway becomes noise.
export default tseslint.config(
  {
    ignores: ["dist/", "dist-web/", "node_modules/"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "no-console": "error",
      // Omitting a field by destructuring (`const { body, ...rest } = x`) is the idiom of the code inherited from SSK Canon for removing a key without mutating: the rest is what is used.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Tests replace the browser storage with a dictionary, and assert what they have just checked: two forms the rules rightly forbid in shipped code.
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // The service workers of the web version (`tools/pwa/pwa.ts`): their global scope is a worker's, not a page's.
    files: ["tools/pwa/*.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["tools/**/*.mjs", "tools/**/*.ts", "*.config.*"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
  prettier,
);
