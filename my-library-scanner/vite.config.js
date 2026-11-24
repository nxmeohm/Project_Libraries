import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http://localhost:5000 http://127.0.0.1:5000 http://localhost http://127.0.0.1; connect-src 'self' http://localhost:5000 ws://localhost:5000 http://127.0.0.1:5000 ws://127.0.0.1:5000 https://localhost:5175 wss://localhost:5175;",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

function securityPlugin() {
  const handleSecurity = (req, res, next) => {
    for (const [header, val] of Object.entries(securityHeaders)) {
      res.setHeader(header, val);
    }
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    const rawUrl = req.url || '';
    const queryIdx = rawUrl.indexOf('?');
    const pathname = queryIdx !== -1 ? rawUrl.substring(0, queryIdx) : rawUrl;
    const queryStr = queryIdx !== -1 ? rawUrl.substring(queryIdx + 1) : '';

    if (queryStr) {
      const lowerQuery = queryStr.toLowerCase();
      if (
        lowerQuery.includes('%2f') ||
        lowerQuery.includes('%5c') ||
        lowerQuery.includes('%2e') ||
        lowerQuery.includes('..') ||
        lowerQuery.includes('/') ||
        lowerQuery.includes('\\') ||
        lowerQuery.includes('\0')
      ) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain');
        return res.end('Bad Request: Invalid query parameter path characters');
      }
    }

    let decodedPath = '';
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('Bad Request: Invalid URI encoding');
    }

    if (
      decodedPath.includes('..') ||
      pathname.includes('%2e%2e') ||
      pathname.includes('%2E%2E') ||
      decodedPath.includes('\0')
    ) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('Access Denied: Path Traversal Attempt Blocked');
    }

    const forbiddenPrefixes = ['/src', '/public', '/node_modules', '/.git', '/.vite'];
    const isForbidden = forbiddenPrefixes.some(prefix =>
      decodedPath === prefix ||
      decodedPath === `${prefix}/` ||
      (decodedPath.startsWith(prefix) && decodedPath.endsWith('/'))
    );
    if (isForbidden) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('Access Denied: Directory Browsing Forbidden');
    }

    next();
  };

  return {
    name: 'vite-security-plugin',
    configureServer(server) {
      server.middlewares.use(handleSecurity);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleSecurity);
    }
  };
}

export default defineConfig({
  plugins: [securityPlugin(), react(), tailwindcss(), basicSsl()],
  server: {
    port: 5175,
    host: true,
    headers: securityHeaders,
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '../*']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 5175,
    host: true,
    headers: securityHeaders
  },
  build: {
    sourcemap: false
  }
})
