import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

// Les seuils et leur raison : docs/clean-code.md, section « Ce que l'outillage fait respecter ». Ils sont bloquants : un avertissement que l'on peut fusionner malgré tout devient du bruit.
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
      // Omettre un champ par décomposition (`const { corps, ...reste } = x`) est l'idiome du code hérité de SSK Canon pour retirer une clé sans muter : le reste est ce qui sert.
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
    // Les tests remplacent le stockage du navigateur par un dictionnaire, et affirment ce qu'ils viennent de vérifier : deux formes que les règles proscrivent à raison dans le code livré.
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Les service workers de la version web (`outils/pwa/pwa.ts`) : leur portée globale est celle d'un worker, non d'une page.
    files: ["outils/pwa/*.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["outils/**/*.mjs", "outils/**/*.ts", "*.config.*"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
  prettier,
);
