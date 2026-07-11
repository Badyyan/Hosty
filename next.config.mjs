/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: [
      "adm-zip",
      "nodemailer",
      "pg",
      "@prisma/adapter-pg",
    ],
  },
  async headers() {
    return [
      {
        // Security headers apply to the app itself; hosted sites are served
        // by the /sites route handler which sets its own headers.
        source: "/((?!sites).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
