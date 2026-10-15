/**
 * Generador del Dockerfile del proyecto Laravel generado.
 *
 * Imagen php-fpm de una sola etapa, pensada para ser construida en el VPS
 * durante el primer deploy (FRA-70). Instala las extensiones PHP necesarias,
 * instala dependencias con Composer en modo producción, copia la app a
 * /var/www/html y ajusta permisos sobre storage y bootstrap/cache.
 *
 * Nota: la vista raíz del monolito es self-contained (FRA-69), por lo que `/`
 * responde 200 sin assets compilados; por eso esta imagen no corre un build de
 * front-end (el proyecto generado aún no incluye configuración de Vite usable).
 *
 * El servicio php-fpm resultante escucha en el puerto 9000 y nginx (en su
 * propio contenedor) le hace fastcgi_pass; ver nginx-conf.ts.
 */
export function generateDockerfile(): string {
  return `# Dockerfile generado por Fractal
# Imagen php-fpm para producción. Se construye en el VPS durante el deploy.
FROM php:8.3-fpm

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

# Instalar dependencias de producción.
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-progress

# Permisos de escritura para el runtime de Laravel.
RUN chown -R www-data:www-data storage bootstrap/cache \\
    && chmod -R ug+rwX storage bootstrap/cache

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
storage/logs/*.log
.env
.env.*
`;
}
