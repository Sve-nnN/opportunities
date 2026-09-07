import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted Docker deploy (Dokploy), never a Vercel-specific API.
  // Produces .next/standalone for the multi-stage Dockerfile.
  output: "standalone",
};

export default nextConfig;
