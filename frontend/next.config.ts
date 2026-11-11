
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permit the current ngrok hostname while running `next dev`.
  // This affects development only. Update it if ngrok changes the hostname.
  allowedDevOrigins: ["shifty-maroon-pushpin.ngrok-free.dev"],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
