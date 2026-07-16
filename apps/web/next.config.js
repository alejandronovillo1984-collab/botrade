/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // App Router ya es default en Next.js 15
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Desactivar el cache persistente de webpack en dev.
      // Evita errores ENOENT sobre .pack.gz cuando hay otros
      // watchers (ej. tsc --watch de functions) corriendo en paralelo.
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
