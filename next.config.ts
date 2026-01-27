import type { NextConfig } from "next";
import { initPloyForDev } from "@meetploy/nextjs";

if (process.env.NODE_ENV === "development") {
  await initPloyForDev();
}

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
