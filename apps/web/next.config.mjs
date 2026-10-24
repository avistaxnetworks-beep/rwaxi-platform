import prismaMonorepo from "@prisma/nextjs-monorepo-workaround-plugin";

const { PrismaPlugin } = prismaMonorepo;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // In a pnpm monorepo the Prisma query engine (rhel-openssl-3.0.x on Vercel, see schema.prisma binaryTargets)
  // lives outside the app, so the server bundle does not trace it: the plugin copies it next to the server output.
  webpack: (config, { isServer }) => {
    if (isServer) config.plugins.push(new PrismaPlugin());
    return config;
  },
  // The ported prototype runs effects and timers that assume a single mount (as in the
  // original artifact). Re-enable once screens move to server data.
  reactStrictMode: false,
  transpilePackages: ["@rwaxi/database", "@rwaxi/blockchain-sdk", "@rwaxi/document-vault", "@rwaxi/mail"],
  // ESLint is not configured yet; type safety is enforced by `pnpm typecheck` and `next build`.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Every request goes through the host middleware, which buffers the body (10 MB by default, then truncates):
    // the DocumentVault upload accepts up to 21 MB (Data Room files of 20 MB + multipart), and refuses more itself.
    middlewareClientMaxBodySize: "21mb",
  },
};

export default nextConfig;
