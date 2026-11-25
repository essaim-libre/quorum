import type { NextConfig } from "next";
import { buildStaticSecurityHeaders } from "./src/lib/security-headers";

const isProd = process.env.NODE_ENV === "production";
const securityHeaders = buildStaticSecurityHeaders(isProd);

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
