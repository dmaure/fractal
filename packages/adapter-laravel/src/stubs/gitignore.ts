/**
 * Generador de .gitignore para proyectos Laravel.
 * 
 * Incluye .env para cumplir con Artículo VI (sin secrets comprometidos).
 */

export function generateGitignore(): string {
  return `# Laravel
/vendor
/node_modules
/public/hot
/public/storage
/public/build
/storage/*.key
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
