/**
 * Generador de docker/nginx/nginx.conf para el proyecto Laravel generado.
 *
 * nginx corre en su propio contenedor (servicio `nginx` del compose), escucha
 * en los puertos 80 y 443 y sirve /var/www/html/public. Las peticiones a
 * archivos .php se pasan por fastcgi al contenedor php-fpm (servicio `app`,
 * puerto 9000), que comparte el código vía un volumen montado en la misma ruta.
 *
 * Este archivo reemplaza el nginx.conf principal del contenedor (se monta en
 * /etc/nginx/nginx.conf), por lo que incluye los bloques events{} y http{}.
 *
 * FRA-71 implementa TLS/HTTPS: el propio nginx del contenedor termina TLS con el
 * certificado Let's Encrypt montado en /etc/nginx/ssl (fullchain.pem/privkey.pem)
 * y sirve el webroot del challenge ACME HTTP-01 desde /var/www/certbot (montaje
 * compartido con el host donde certbot escribe el challenge). El dominio no se
 * conoce en tiempo de `fractal new`, así que la ruta del certificado es fija y
 * `server_name _;`.
 */
export function generateNginxConf(): string {
  return `# nginx.conf generado por Fractal
# Sirve la app Laravel por HTTP (puerto 80, redirect a HTTPS) y HTTPS (puerto
# 443, TLS terminado en el contenedor), y delega PHP al contenedor php-fpm.
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

        # Challenge ACME HTTP-01 (Let's Encrypt): webroot compartido con el host.
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Todo lo demás se redirige a HTTPS.
        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        listen [::]:443 ssl;
        http2 on;
        server_name _;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

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
