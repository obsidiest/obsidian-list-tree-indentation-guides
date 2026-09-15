import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    ignores: ["coverage/**", "dist/**", "main.js", "release/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["tests/**/*.ts", "vitest.config.ts"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/no-test-function": "off",
    },
  },
  {
    files: ["esbuild.config.mjs"],
    rules: {
      "obsidianmd/no-global-this": "off",
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
  {
    files: ["tests/browser/**/*.mjs"],
    languageOptions: { globals: { ltigTest: "readonly", process: "readonly" } },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/no-global-this": "off",
      "obsidianmd/no-static-styles-assignment": "off",
      "obsidianmd/rule-custom-message": "off",
      "no-unsanitized/property": "off",
      "@microsoft/sdl/no-inner-html": "off",
      "no-restricted-globals": "off",
    },
  },
];
