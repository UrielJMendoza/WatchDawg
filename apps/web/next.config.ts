import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
