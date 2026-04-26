import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev StrictMode 더블 마운트가 Phaser.Game을 2개 띄워 CPU 폭주를 유발해 끔.
  // 운영에는 영향 없음.
  reactStrictMode: false,
  // Phaser ships ESM/CJS dual entry that needs transpilation under Turbopack.
  transpilePackages: ["phaser", "phaser-navmesh"],
};

export default nextConfig;
