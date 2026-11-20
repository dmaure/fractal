/**
 * Generador de .gitignore para proyectos Laravel.
 * 
 * Incluye .env para cumplir con Artículo VI (sin secrets comprometidos).
 */

import type { BackendFrontendRef } from '@fractal/core';
import { pickStaticFrontend } from './dockerfile.js';

export function generateGitignore(options: { frontends?: BackendFrontendRef[] } = {}): string {
  // Monolito: el frontend vive en su dir (dependencias y build fuera del repo).
  const frontend = pickStaticFrontend(options.frontends);
  const web = frontend
    ? `/${frontend.dir}/node_modules\n/${frontend.dir}/${frontend.build.outputDir}\n`
    : '';
  return `# Laravel
/vendor
/node_modules
/public/hot
/public/storage
/public/build
${web}/storage/*.key
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
