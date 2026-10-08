/**
 * Generador de README.md para proyectos Laravel.
 */

export function generateReadme(
  name: string,
  topology: 'monolith' | 'monorepo' | 'multirepo-api' | 'multirepo-web'
): string {
  const title = `# ${name}`;

  const description =
    topology === 'monolith'
      ? 'Proyecto Laravel en topología monolito, generado por Fractal.'
      : topology === 'monorepo'
        ? 'Proyecto Laravel en topología monorepo desacoplado, generado por Fractal.'
        : topology === 'multirepo-api'
          ? 'API Laravel del proyecto multirepo, generado por Fractal.'
          : 'Frontend (SPA React) del proyecto multirepo, generado por Fractal.';

  const setupInstructions =
    topology === 'multirepo-web'
      ? `## Instalación

\`\`\`bash
npm install
\`\`\`

## Desarrollo

\`\`\`bash
npm run dev
\`\`\`

La aplicación estará disponible en http://localhost:3000

## Build

\`\`\`bash
npm run build
\`\`\`
`
      : topology === 'monorepo'
        ? `## Instalación

\`\`\`bash
pnpm install
\`\`\`

## Desarrollo

Ejecuta ambos packages en paralelo:

\`\`\`bash
pnpm dev
\`\`\`

- API: http://localhost:8000
- Web: http://localhost:3000

## Build

\`\`\`bash
pnpm build
\`\`\`
`
        : `## Instalación

\`\`\`bash
composer install
cp .env.example .env
php artisan key:generate
\`\`\`

## Desarrollo

\`\`\`bash
php artisan serve
\`\`\`

La aplicación estará disponible en http://localhost:8000

## Tests

\`\`\`bash
php artisan test
\`\`\`
`;

  return `${title}

${description}

${setupInstructions}

## Deploy

Este proyecto está configurado para desplegarse con \`fractal deploy\`.

## Documentación

- [Fractal](https://github.com/dmaure/fractal)
- [Laravel](https://laravel.com/docs)
`;
}
