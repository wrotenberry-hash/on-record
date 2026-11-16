import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The disposable-email blocklist is read from disk by the account sign-in action.
  outputFileTracingIncludes: { "/account": ["./lib/data/disposable-domains.txt"] },
};

export default nextConfig;
