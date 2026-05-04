/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'ph-files.imgix.net', 'avatars.githubusercontent.com', 'logo.clearbit.com', 'www.google.com'],
    unoptimized: true,
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
  },
  // 禁用 CSP 报告（开发环境）
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https:;"
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
