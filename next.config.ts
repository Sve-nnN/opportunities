import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted Docker deploy (Dokploy), never a Vercel-specific API.
  // Produces .next/standalone for the multi-stage Dockerfile.
  output: "standalone",
  // This repo already has a GSD-managed .claude/CLAUDE.md; disable Next.js
  // 16's auto-generated root CLAUDE.md/AGENTS.md so it doesn't shadow or
  // conflict with the existing convention.
  agentRules: false,
};

export default nextConfig;
