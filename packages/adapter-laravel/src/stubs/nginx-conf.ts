/**
 * Generador de docker/nginx/nginx.conf para el proyecto Laravel generado.
 *
 * nginx corre en su propio contenedor (servicio `nginx` del compose), escucha
 * en el puerto 80 y sirve /var/www/html/public. Las peticiones a archivos .php
 * se pasan por fastcgi al contenedor php-fpm (servicio `app`, puerto 9000),
 * que comparte el código vía un volumen montado en la misma ruta.
 *
 * Este archivo reemplaza el nginx.conf principal del contenedor (se monta en
 * /etc/nginx/nginx.conf), por lo que incluye los bloques events{} y http{}.
 *
 * FRA-70 cubre solo HTTP (puerto 80). TLS/HTTPS es FRA-71.
 */
export function generateNginxConf(): string {
  return `# nginx.conf generado por Fractal
# Sirve la app Laravel por HTTP (puerto 80) y delega PHP al contenedor php-fpm.
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 100M;

    server {
        listen 80;
        listen [::]:80;
        server_name _;

        root /var/www/html/public;
        index index.php index.html;

        charset utf-8;

        location / {
            try_files $uri $uri/ /index.php?$query_string;
        }

        location = /favicon.ico { access_log off; log_not_found off; }
        location = /robots.txt  { access_log off; log_not_found off; }

        error_page 404 /index.php;

        location ~ \\.php$ {
            fastcgi_pass app:9000;
            fastcgi_index index.php;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
            fastcgi_param DOCUMENT_ROOT $realpath_root;
        }

        location ~ /\\.(?!well-known).* {
            deny all;
        }
    }
}
`;
}
