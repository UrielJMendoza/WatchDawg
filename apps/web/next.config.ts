import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "maplibre-gl", "@deck.gl/core"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "mapbox-gl": "maplibre-gl",
    };
    return config;
  },
};

export default nextConfig;
