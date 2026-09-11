const path = require("path");
const root = path.resolve(__dirname, "..");
module.exports = {
  apps: [
    {
      name: "exchange-lab-matching",
      cwd: root + "/services/matching-go",
      script: "./matching",
      interpreter: "none",
      env: { STATE_FILE: root + "/.runtime/matching.json" },
      max_memory_restart: "192M",
    },
    {
      name: "exchange-lab-core",
      cwd: root,
      script: "java",
      interpreter: "none",
      args: "-Xms64m -Xmx256m -jar services/core-java/build/libs/exchange-core-0.1.0.jar",
      env: { DB_PASSWORD: process.env.DB_PASSWORD },
      max_memory_restart: "450M",
    },
    {
      name: "exchange-lab-web",
      cwd: root + "/apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "dev --hostname 127.0.0.1 --port 18200",
      env: {
        NODE_ENV: "development",
        NODE_OPTIONS: "--max-old-space-size=768",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      max_memory_restart: "1100M",
    },
  ],
};
