import type { NextConfig } from "next";

const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Permit the current ngrok hostname while running `next dev`.
  // This affects development only. Update it if ngrok changes the hostname.
  allowedDevOrigins: ["vagrancy-untrained-tactless.ngrok-free.dev"],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
