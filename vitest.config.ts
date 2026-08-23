import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      src: new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
  },
});
