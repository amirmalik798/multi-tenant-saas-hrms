import type { NextConfig } from "next";

const backendOrigin = (
  process.env.BACKEND_ORIGIN ??
  process.env.BACKEND_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Retain the existing development hostname allowance from for-deployment.
  allowedDevOrigins: ["vagrancy-untrained-tactless.ngrok-free.dev"],
  experimental: {
    // Next.js 16.4.0's CLI checker can include stale .next/dev route validators.
    // The TypeScript API checker filters development-only route types during builds.
    useTypeScriptCli: false,
  },
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: backendOrigin + "/api/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
