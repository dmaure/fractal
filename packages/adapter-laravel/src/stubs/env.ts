/**
 * Generador de .env.example para proyectos Laravel.
 * 
 * No incluye secrets reales ni APP_KEY — cumple con Artículo VI.
 */

export function generateEnvExample(appName: string): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `APP_NAME="${appName}"
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost

LOG_CHANNEL=stack
LOG_LEVEL=debug

# Base de datos: SQLite por defecto para correr en local sin servicios externos.
# El archivo database/database.sqlite se crea al generar el proyecto.
DB_CONNECTION=sqlite
# Para MySQL/Postgres (por ejemplo en produccion) descomenta y completa:
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_DATABASE=${slug}
# DB_USERNAME=root
# DB_PASSWORD=

# Drivers locales sin dependencias externas (archivo / sync).
BROADCAST_CONNECTION=log
CACHE_STORE=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

MAIL_MAILER=log
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="\${APP_NAME}"
`;
}
