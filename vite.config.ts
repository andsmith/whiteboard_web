import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        whiteboard: resolve(__dirname, "whiteboard/index.html"),
      },
    },
  },
  worker: {
    format: "es",
  },
});
