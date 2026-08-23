import esbuild from "esbuild";

const production = globalThis.process.argv[2] === "production";
const { readFile } = await import("node:fs/promises");
const manifest = JSON.parse(
  await readFile(new URL("./manifest.json", import.meta.url), "utf8"),
);

const context = await esbuild.context({
  banner: {
    js: `/* ${manifest.name} v${manifest.version} | MIT | obsidiest */`,
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "main.js",
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2022",
  treeShaking: true,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
