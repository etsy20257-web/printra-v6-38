import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@printra/ui', '@printra/shared', '@printra/ux', '@printra/i18n'],
  experimental: { cpus: 1 },
  outputFileTracingRoot: path.join(__dirname, '..', '..')
};

export default nextConfig;
