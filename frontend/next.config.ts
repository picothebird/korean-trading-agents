import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phaser ships ESM/CJS dual entry that needs transpilation under Turbopack.
  transpilePackages: ["phaser", "phaser-navmesh"],
};

export default nextConfig;
