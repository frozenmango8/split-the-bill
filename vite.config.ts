import { defineConfig } from "vitest/config";

// Project site: https://frozenmango8.github.io/split-the-bill/
export default defineConfig({
  base: "/split-the-bill/",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
