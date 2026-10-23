/** @type {import('next').NextConfig} */
const nextConfig = {
  // The ported prototype runs effects and timers that assume a single mount (as in the
  // original artifact). Re-enable once screens move to server data.
  reactStrictMode: false,
  transpilePackages: ["@rwaxi/database", "@rwaxi/blockchain-sdk"],
  // ESLint is not configured yet; type safety is enforced by `pnpm typecheck` and `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
