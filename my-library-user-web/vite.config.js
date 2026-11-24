import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Standard-compliant CSP & Security Headers without wildcards or forbidden directives
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http://localhost:5000 http://127.0.0.1:5000 http://localhost http://127.0.0.1; connect-src 'self' http://localhost:5000 ws://localhost:5000 http://127.0.0.1:5000 ws://127.0.0.1:5000 http://localhost:5174 ws://localhost:5174 http://localhost:5173 ws://localhost:5173 https://localhost:5175 wss://localhost:5175; media-src 'self'; worker-src 'self' blob:; child-src 'self'; manifest-src 'self';",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache'
};

// Security middleware to eliminate Path Traversal, Directory Browsing, and missing headers
function securityPlugin() {
  const handleSecurity = (req, res, next) => {
    // 1. Inject Security Headers unconditionally
    for (const [header, val] of Object.entries(securityHeaders)) {
      res.setHeader(header, val);
    }
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    const rawUrl = req.url || '';

    // 2. Parse URL parts
    const queryIdx = rawUrl.indexOf('?');
    const pathname = queryIdx !== -1 ? rawUrl.substring(0, queryIdx) : rawUrl;
    const queryStr = queryIdx !== -1 ? rawUrl.substring(queryIdx + 1) : '';

    // 3. Prevent Path Traversal in Query String (block '..' sequences but allow Vite's ?v= cache-busting params)
    if (queryStr) {
      const lowerQuery = queryStr.toLowerCase();
      if (
        lowerQuery.includes('..') ||
        lowerQuery.includes('%2e%2e') ||
        lowerQuery.includes('%2e.') ||
        lowerQuery.includes('.%2e') ||
        lowerQuery.includes('%5c') ||
        lowerQuery.includes('\0')
      ) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain');
        return res.end('Bad Request: Invalid query parameter path characters');
      }
    }

    // 4. Prevent Path Traversal in URI Path
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

    // 5. Prevent Directory Browsing
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
  plugins: [
    securityPlugin(),
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5174,
    headers: securityHeaders,
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '../*']
    }
  },
  preview: {
    host: true,
    port: 5174,
    headers: securityHeaders
  },
  build: {
    sourcemap: false
  }
})
