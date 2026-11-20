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
export async function writeFrontendFiles(destinationPath: string, name: string): Promise<void> {
  await mkdir(join(destinationPath, 'src', 'lib'), { recursive: true });

  await writeFile(join(destinationPath, 'package.json'), generatePackageJson(name));
  await writeFile(join(destinationPath, 'vite.config.ts'), generateWebViteConfig());
  await writeFile(join(destinationPath, 'index.html'), generateWebIndexHtml(name));
  await writeFile(join(destinationPath, 'tsconfig.json'), generateWebTsconfig());
  await writeFile(join(destinationPath, 'src', 'main.tsx'), generateWebMain());
  await writeFile(join(destinationPath, 'src', 'App.tsx'), generateWebApp());
  await writeFile(join(destinationPath, 'src', 'App.css'), generateWebCss());
  await writeFile(join(destinationPath, 'src', 'lib', 'api.ts'), generateWebApiLib());
}
