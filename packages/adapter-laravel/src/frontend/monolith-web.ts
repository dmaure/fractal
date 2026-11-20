/**
 * Frontend (SPA React + Vite) del monolito, generado dentro de `web/`.
 *
 * Todo el código del frontend vive en este directorio, separado del generador
 * del monolito, para poder moverlo tal cual a un adapter de frontend propio
 * sin cambiar el output generado.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generatePackageJson } from '../stubs/package.js';

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

/** Escribe todo el frontend del monolito en `<projectPath>/web`. */
export async function generateMonolithWeb(
  projectPath: string,
  name: string
): Promise<void> {
  const webPath = join(projectPath, 'web');
  await mkdir(join(webPath, 'src', 'lib'), { recursive: true });

  await writeFile(join(webPath, 'package.json'), generatePackageJson(name, 'monolith'));
  await writeFile(join(webPath, 'vite.config.ts'), generateWebViteConfig());
  await writeFile(join(webPath, 'index.html'), generateWebIndexHtml(name));
  await writeFile(join(webPath, 'tsconfig.json'), generateWebTsconfig());
  await writeFile(join(webPath, 'src', 'main.tsx'), generateWebMain());
  await writeFile(join(webPath, 'src', 'App.tsx'), generateWebApp());
  await writeFile(join(webPath, 'src', 'App.css'), generateWebCss());
  await writeFile(join(webPath, 'src', 'lib', 'api.ts'), generateWebApiLib());
}
