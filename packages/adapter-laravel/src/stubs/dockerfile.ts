/**
 * Generador del Dockerfile del proyecto Laravel generado.
 *
 * Imagen php-fpm construida en el VPS durante el deploy (FRA-70). Una etapa
 * Node compila el SPA con Vite (FRA-111) y la etapa PHP instala las extensiones,
 * dependencias de Composer en modo producción, copia la app a /var/www/html
 * junto con el SPA compilado en `public/spa` y ajusta permisos sobre storage y bootstrap/cache.
 *
 * El servicio php-fpm resultante escucha en el puerto 9000 y nginx (en su
 * propio contenedor) le hace fastcgi_pass; ver nginx-conf.ts.
 */
import type { BackendFrontendRef } from '@fractal/core';
import { PHP_DOCKER_IMAGE } from './php-version.js';

/**
 * Frontend estático que el backend sirve: el primero cuyo contrato es
 * `serve: 'static'` y declara build (FRA-116). Sin frontend ⇒ undefined.
 */
export function pickStaticFrontend(
  frontends: BackendFrontendRef[] = []
): (BackendFrontendRef & { build: NonNullable<BackendFrontendRef['contract']['build']> }) | undefined {
  for (const f of frontends) {
    if (f.contract.serve === 'static' && f.contract.build) {
      return { ...f, build: f.contract.build };
    }
  }
  return undefined;
}

function generateFrontendStage(frontend: ReturnType<typeof pickStaticFrontend>): string {
  if (!frontend) return '';
  const { dir, build, contract } = frontend;
  const manifests = build.dependencyManifests
    ? `COPY ${dir}/${build.dependencyManifests} ./\n`
    : '';
  return `# Etapa 1: compila el ${contract.description ?? contract.target} (${dir}/${build.outputDir}).
FROM ${build.image} AS web-build
WORKDIR /app/${dir}
${manifests}RUN ${build.installCommand}
COPY ${dir}/ ./
RUN ${build.buildCommand}

`;
}

export function generateDockerfile(frontends: BackendFrontendRef[] = []): string {
  const frontend = pickStaticFrontend(frontends);
  return `# Dockerfile generado por Fractal
${generateFrontendStage(frontend)}${frontend ? '# Etapa 2: ' : '# '}imagen php-fpm para producción. Se construye en el VPS durante el deploy.
FROM ${PHP_DOCKER_IMAGE}

# Dependencias de sistema y extensiones PHP requeridas por Laravel + PostgreSQL.
RUN apt-get update && apt-get install -y --no-install-recommends \\
        git \\
        unzip \\
        libpq-dev \\
        libzip-dev \\
        libicu-dev \\
    && docker-php-ext-install pdo pdo_pgsql pgsql zip intl opcache bcmath \\
    && apt-get clean \\
    && rm -rf /var/lib/apt/lists/*

# Composer (copiado desde la imagen oficial).
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copiar el código de la aplicación.
COPY . /var/www/html

${frontend ? `# SPA compilado (etapa Node); nginx lo sirve desde public/spa.
COPY --from=web-build /app/${frontend.dir}/${frontend.build.outputDir} /var/www/html/public/spa
` : ''}
# Instalar dependencias de producción.
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-progress

# Permisos de escritura para el runtime de Laravel.
RUN chown -R www-data:www-data storage bootstrap/cache \\
    && chmod -R ug+rwX storage bootstrap/cache

# php-fpm, por default, vacía el entorno del worker (\`clear_env = yes\`).
# Las variables que compose inyecta (APP_KEY, DB_*, APP_URL) no llegarían
# a PHP y Laravel respondería 500 en \`/\` (EncryptCookies exige APP_KEY).
# Destapado por el e2e real de FRA-73: HTTPS devolvía 500 estable.
RUN printf '%s\\n' '[www]' 'clear_env = no' \\
    > /usr/local/etc/php-fpm.d/zz-fractal.conf

EXPOSE 9000

CMD ["php-fpm"]
`;
}

/**
 * Genera el .dockerignore del proyecto para acelerar el build y evitar copiar
 * artefactos que se regeneran dentro de la imagen.
 */
export function generateDockerignore(frontends: BackendFrontendRef[] = []): string {
  const frontend = pickStaticFrontend(frontends);
  const frontendIgnores = frontend
    ? `${frontend.dir}/node_modules\n${frontend.dir}/${frontend.build.outputDir}\n`
    : '';
  return `.git
node_modules
vendor
dist
${frontendIgnores}storage/logs/*.log
.env
.env.*
`;
}
