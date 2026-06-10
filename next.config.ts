import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone-сборка — требование деплоя в Docker (эпоха 6)
  output: "standalone",
};

export default nextConfig;
