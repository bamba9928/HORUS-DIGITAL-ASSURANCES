// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // `dist/` est le bundle exporte ; `.expo/` porte les types de routes
    // regeneres par `expo start`. Ni l'un ni l'autre n'est du code source.
    ignores: ["dist/*", ".expo/*"],
  },
]);
