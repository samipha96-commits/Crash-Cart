import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps asset paths relative so the same build works on a web
// host, inside the Capacitor native shell, and from a sub-folder.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "node" },
} as never);
