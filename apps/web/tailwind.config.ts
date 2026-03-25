import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx,css}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};

export default config;
