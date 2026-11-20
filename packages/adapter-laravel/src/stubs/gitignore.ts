/**
 * Generador de .gitignore para proyectos Laravel.
 * 
 * Incluye .env para cumplir con Artículo VI (sin secrets comprometidos).
 */

export function generateGitignore(options: { webDir?: boolean } = {}): string {
  // Monolito: el frontend vive en web/ (node_modules y build fuera del repo).
  const web = options.webDir ? '/web/node_modules\n/web/dist\n' : '';
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
