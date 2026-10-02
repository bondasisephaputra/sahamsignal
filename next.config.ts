import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client ships native bindings and must stay outside the bundler.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
