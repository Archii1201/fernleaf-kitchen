import type { NextConfig } from 'next';

const apiOrigin = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Same-origin proxy so the httpOnly session cookie is first-party for the web app.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
