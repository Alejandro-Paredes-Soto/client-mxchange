import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID,
    FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET,
  },
};

export default nextConfig;
