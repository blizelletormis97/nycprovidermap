import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes read the cached provider JSON from disk at runtime
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/data/*-geocoded.json"],
  },
};

export default nextConfig;
