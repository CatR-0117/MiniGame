import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [".next/**", "out/**", "next-env.d.ts"],
  },
  ...nextVitals,
  ...nextTypeScript,
];

export default eslintConfig;
