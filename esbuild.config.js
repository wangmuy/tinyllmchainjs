import { build } from "esbuild";
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill'

build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  minify: false,
  platform: "browser",
  sourcemap: true,
  target: "ES2021",
  plugins: [
    NodeModulesPolyfillPlugin(),
  ]
});