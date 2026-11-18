/**
 * Generador del Dockerfile del proyecto Laravel generado.
 *
 * Imagen php-fpm construida en el VPS durante el deploy (FRA-70). Una etapa
 * Node compila el SPA con Vite (FRA-111) y la etapa PHP instala las extensiones,
 * dependencias de Composer en modo producción, copia la app a /var/www/html
 * junto con `public/build` y ajusta permisos sobre storage y bootstrap/cache.
 *
 * El servicio php-fpm resultante escucha en el puerto 9000 y nginx (en su
 * propio contenedor) le hace fastcgi_pass; ver nginx-conf.ts.
 */
import { PHP_DOCKER_IMAGE } from './php-version.js';

export function generateDockerfile(): string {
  return `# Dockerfile generado por Fractal
# Etapa 1: compila el SPA React con Vite (public/build).
FROM node:22-alpine AS assets
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY index.html vite.config.ts ./
COPY resources ./resources
RUN npm run build

# Etapa 2: imagen php-fpm para producción. Se construye en el VPS durante el deploy.
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

# Assets compilados del SPA (etapa Node).
COPY --from=assets /app/public/build /var/www/html/public/build

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
export function generateDockerignore(): string {
  return `.git
node_modules
vendor
dist
public/build
storage/logs/*.log
.env
.env.*
`;
}
