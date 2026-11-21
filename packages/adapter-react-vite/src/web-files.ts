/**
 * Archivos del frontend (SPA React + Vite). Salen de adapter-laravel (FRA-116)
 * sin cambiar el output generado.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function generatePackageJson(name: string): string {
  const packageName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  return JSON.stringify(
    {
      name: packageName,
      version: '0.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
      },
      dependencies: {},
      devDependencies: {
        '@vitejs/plugin-react': '^4.0.0',
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        typescript: '^5.0.0',
        vite: '^5.0.0',
      },
    },
    null,
    2
  );
}

export function generateWebIndexHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function generateWebViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3000,
    // En desarrollo, /api va al Laravel local (php artisan serve).
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
`;
}

export function generateWebTsconfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`;
}

export function generateWebMain(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
`;
}

export function generateWebApp(): string {
  return `import React from 'react';
import { API_BASE } from './lib/api';

export default function App() {
  const [health, setHealth] = React.useState('consultando /api/health…');

  React.useEffect(() => {
    fetch(\`\${API_BASE}/api/health\`)
      .then((res) => {
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        return res.json();
      })
      .then((data) => setHealth(\`/api/health: \${data.status}\`))
      .catch(() => setHealth('/api/health: sin respuesta'));
  }, []);

  return (
    <div className="container">
      <h1>Fractal Laravel App</h1>
      <p>Tu aplicación está lista para desarrollar.</p>
      <p data-testid="health">{health}</p>
    </div>
  );
}
`;
}

export function generateWebApiLib(): string {
  return `export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';
`;
}

export function generateWebCss(): string {
  return `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
`;
}

/** Escribe todo el frontend en `destinationPath`. */
export async function writeFrontendFiles(
  destinationPath: string,
  name: string,
  mode: 'embedded' | 'standalone' = 'embedded',
  ownRepo = false
): Promise<void> {
  await mkdir(join(destinationPath, 'src', 'lib'), { recursive: true });

  await writeFile(join(destinationPath, 'package.json'), generatePackageJson(`${name}-web`));
  await writeFile(join(destinationPath, 'vite.config.ts'), generateWebViteConfig());
  await writeFile(join(destinationPath, 'index.html'), generateWebIndexHtml(name));
  await writeFile(join(destinationPath, 'tsconfig.json'), generateWebTsconfig());
  await writeFile(join(destinationPath, 'src', 'main.tsx'), generateWebMain());
  await writeFile(join(destinationPath, 'src', 'App.tsx'), generateWebApp());
  await writeFile(join(destinationPath, 'src', 'App.css'), generateWebCss());
  await writeFile(join(destinationPath, 'src', 'lib', 'api.ts'), generateWebApiLib());

  if (mode === 'standalone') {
    // Repo/package propio: health.txt lo usa el healthcheck del deploy estático.
    await mkdir(join(destinationPath, 'public'), { recursive: true });
    await writeFile(join(destinationPath, 'public', 'health.txt'), 'ok');
    await writeFile(join(destinationPath, '.gitignore'), 'node_modules\ndist\n.env\n.env.production\n');
    await writeFile(
      join(destinationPath, 'README.md'),
      `# ${name}-web\n\nFrontend React + Vite de ${name}.\n\n- \`npm install\` y \`npm run dev\` (puerto 3000, \`/api\` se proxea a localhost:8000)\n- \`npm run build\` genera \`dist/\`\n- La URL de la API se configura con \`VITE_API_URL\`\n`
    );
  }

  if (ownRepo) await writeDeployAssets(destinationPath);
}

/**
 * Dockerfile + nginx del repo web (multirepo, FRA-112). El Dockerfile compila
 * el SPA (VITE_API_URL llega como build arg) y copia dist/ a una imagen nginx;
 * el nginx.conf (TLS, SPA fallback, /health.txt) lo monta el compose.
 */
async function writeDeployAssets(destinationPath: string): Promise<void> {
  await writeFile(join(destinationPath, 'Dockerfile'), generateWebDockerfile());
  await writeFile(join(destinationPath, '.dockerignore'), 'node_modules\ndist\n.git\n.env\n.env.*\n');
  const nginxPath = join(destinationPath, 'docker', 'nginx');
  for (const dir of ['ssl', 'certbot']) {
    await mkdir(join(nginxPath, dir), { recursive: true });
    await writeFile(join(nginxPath, dir, '.gitkeep'), '');
  }
  await writeFile(join(nginxPath, 'nginx.conf'), generateWebNginxConf());
}

export function generateWebDockerfile(): string {
  return `# Dockerfile generado por Fractal (repo web)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# URL de la API, horneada en el bundle por Vite (la pasa el compose).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
`;
}

export function generateWebNginxConf(): string {
  return `# nginx.conf generado por Fractal (repo web): SPA estático con TLS.
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;

    server {
        listen 80;
        listen [::]:80;
        server_name _;

        # Challenge ACME HTTP-01 (Let's Encrypt).
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        listen [::]:443 ssl;
        http2 on;
        server_name _;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        root /usr/share/nginx/html;
        index index.html;

        # /health.txt sale de public/health.txt (copiado a dist/ por Vite).
        location / {
            try_files $uri /index.html;
        }
    }
}
`;
}
