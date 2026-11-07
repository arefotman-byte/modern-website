/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Lets instrumentation.ts start the agent autopilot when the server boots.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
