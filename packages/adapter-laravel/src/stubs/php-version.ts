/**
 * Versión de PHP compartida entre la imagen Docker generada y el pin de
 * plataforma de composer del scaffold Laravel.
 *
 * Mantenerlas derivadas de una sola constante evita que `composer install` en
 * un entorno local con una versión de PHP más nueva (p. ej. 8.4) resuelva el
 * composer.lock con dependencias incompatibles con el runtime del contenedor
 * (`php:8.3-fpm`), lo que rompía el build en el VPS (FRA-92).
 */

/** Serie mayor.menor de PHP; fuente de verdad única (coincide con la imagen Docker). */
export const PHP_VERSION = '8.3';

/** Tag de la imagen base Docker generada: `php:8.3-fpm`. */
export const PHP_DOCKER_IMAGE = `php:${PHP_VERSION}-fpm`;

/**
 * Versión usada en `config.platform.php` de composer. Es el piso de la serie
 * (`8.3.0`), de modo que composer resuelve las dependencias como si corriera
 * sobre la misma versión mínima que la imagen Docker.
 */
export const PHP_PLATFORM_VERSION = `${PHP_VERSION}.0`;
