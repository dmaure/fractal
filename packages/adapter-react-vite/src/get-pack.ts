/**
 * Acción `get-pack`: convenciones del frontend React + Vite (determinista,
 * offline). Core agrega estos archivos al pack del proyecto.
 */
import type { PackFile, ProjectTopology } from '@fractal/core';

export const FRONTEND_CONVENTIONS_PATH = 'fractal/frontends/react-vite.md';

export function getPack(projectName: string, topology: ProjectTopology = 'monolith'): { files: PackFile[] } {
  // monolito y monorepo: el frontend vive en web/; multirepo: raíz del repo web.
  const where = topology === 'multirepo' ? 'src, en el repo web' : 'web/src';
  return {
    files: [
      {
        path: FRONTEND_CONVENTIONS_PATH,
        contents: `# Convenciones del frontend — ${projectName}

Frontend **React + Vite** (${where}). Para cada entidad del FDL
(\`fractal/domain.fdl.json\`):

- Tipos TypeScript y vistas/CRUD que consumen las rutas \`/api\` del backend.
- Formularios que reflejan las mismas validaciones que el backend.
- La URL base de la API sale de \`VITE_API_URL\` (vacía = mismo origen).
- Tests de los componentes y de las llamadas a la API.
`,
      },
    ],
  };
}
