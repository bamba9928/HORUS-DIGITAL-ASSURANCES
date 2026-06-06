import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Optimise le build pour Docker / déploiement standalone
  output: "standalone",
};

export default nextConfig;
