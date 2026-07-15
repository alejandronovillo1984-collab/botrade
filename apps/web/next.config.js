/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // App Router ya es default en Next.js 15
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
