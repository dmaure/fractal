/**
 * Generador de .gitignore para proyectos Laravel.
 * 
 * Incluye .env para cumplir con Artículo VI (sin secrets comprometidos).
 */

import type { BackendFrontendRef } from '@fractal/core';
import { backendPrefix, pickStaticFrontend } from './dockerfile.js';

export function generateGitignore(
  options: { frontends?: BackendFrontendRef[]; backendDir?: string } = {}
): string {
  // El frontend vive en su dir (dependencias y build fuera del repo).
  const frontend = pickStaticFrontend(options.frontends);
  const web = frontend
    ? `/${frontend.dir}/node_modules\n/${frontend.dir}/${frontend.build.outputDir}\n`
    : '';
  // Monorepo (FRA-114): el backend vive en api/, sus artefactos también.
  const p = backendPrefix(options.backendDir);
  const backend = p ? `/${p}vendor\n` : '';
  return `# Laravel
/vendor
${backend}/node_modules
/${p}public/hot
/${p}public/storage
/${p}public/build
${web}/${p}storage/*.key
.env
.env.backup
.phpunit.result.cache
Homestead.json
Homestead.yaml
npm-debug.log
yarn-error.log

# IDE
.idea
.vscode
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Fractal
.fractal.lock
`;
}
