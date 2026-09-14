import type { NextConfig } from "next";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: new URL("../../.env", import.meta.url), quiet: true });

const nextConfig: NextConfig = {
  // Preserve the repository's spec-anchored instructions during next dev.
  agentRules: false,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@substation/db", "@substation/domain", "@substation/storage"],
};

export default nextConfig;
