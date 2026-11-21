import type { NextConfig } from 'next';

export default function config(): NextConfig {
  return {
    images: {
      remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
    },
  };
}
