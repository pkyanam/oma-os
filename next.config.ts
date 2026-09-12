import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/browser-runtime': ['./node_modules/playwright-core/**/*', './node_modules/playwright/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};
export default config;
