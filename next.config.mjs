/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ]
  },
  // On VERCEL ONLY, proxy every /api/* request to the Cloudflare Worker (which has the
  // D1 database, R2 storage, and JWT secret). `beforeFiles` runs BEFORE the local API
  // route files, so it overrides them — unlike vercel.json rewrites, which don't.
  // Gated to Vercel so the Cloudflare build never proxies /api to itself (infinite loop).
  async rewrites() {
    if (!process.env.VERCEL) return []
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: 'https://outbound-itinerary-generator.outboundmanagementsystem.workers.dev/api/:path*',
        },
      ],
    }
  },
}

export default nextConfig
