const { composePlugins, withNx } = require('@nx/next');
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 */
const nextConfig = {
  nx: {
    svgr: false,
  },
  // PWA configuration
  manifest: {
    name: 'Hotel Housekeeping',
    short_name: 'Housekeeping',
    description: 'Hotel Housekeeping Management App',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#38a169',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
};

const plugins = [withNx, withPWA];

module.exports = composePlugins(...plugins)(nextConfig);
