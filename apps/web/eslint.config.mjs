import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next already ships jsx-a11y plugin + its recommended rules.
// We layer on a few stricter overrides to keep the defense-product UX honest.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Defense-product UX: the rules below are promoted from warn to error.
      // label-has-associated-control is intentionally NOT lifted — the Label
      // primitive in components/ui/label.tsx is a building block; the caller
      // (login form) is where pairing happens and where the default warn fires.
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
