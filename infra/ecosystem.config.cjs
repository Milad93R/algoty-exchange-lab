const path = require("path");
const root = path.resolve(__dirname, "..");
// pm2 may inherit __NEXT_PROCESSED_ENV from another Next.js process, which makes
// `next start` skip apps/web/.env.local. Clear the flag and pass the file explicitly.
const fs = require("fs");
function envFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
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
      args: "start --hostname 127.0.0.1 --port 18200",
      env: {
        ...envFile(root + "/apps/web/.env.local"),
        __NEXT_PROCESSED_ENV: "",
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=768",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      max_memory_restart: "1100M",
    },
  ],
};
