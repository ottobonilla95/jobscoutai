import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // PDF.js loads its parser worker dynamically, outside Next's dependency trace.
  outputFileTracingIncludes: {
    '/api/cv': ['../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
  serverExternalPackages: ['pdf-parse', 'mammoth'],
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' }
    ] }];
  }
};
export default config;
