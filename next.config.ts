import type { NextConfig } from 'next';

const nextConfig: NextConfig =
  process.env.TOPKAPI_GITHUB_PAGES === '1'
    ? {
        output: 'export',
        assetPrefix: '/Topkapi',
        images: { unoptimized: true },
      }
    : {};

export default nextConfig;
