// Sent with every response. No full Content-Security-Policy (it would need
// nonces for Next's inline scripts); these cover clickjacking, MIME sniffing,
// referrer leaks and plugin content. No form-action rule: PunchOut posts to
// and from supplier sites.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Browsers ignore this over plain http, so it's safe in development.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Docker image sets NEXT_OUTPUT=standalone; `next start` and dev are unaffected.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  serverExternalPackages: ['@prisma/client'],
  // The app doesn't use next/image; switching the optimizer off removes its
  // /_next/image endpoint, a recurring source of Next.js vulnerabilities.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
