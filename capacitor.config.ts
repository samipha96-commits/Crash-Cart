import type { CapacitorConfig } from "@capacitor/cli";

// Native Android / iOS shell around the same web build (see README → Mobile).
const config: CapacitorConfig = {
  appId: "app.crashcart.mobile",
  appName: "Crash Cart",
  webDir: "dist",
};

export default config;
