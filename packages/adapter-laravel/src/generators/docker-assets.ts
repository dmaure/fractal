/**
 * Artefactos de contenedor para el deploy (FRA-70, FRA-71, FRA-114).
 *
 * - El Dockerfile va en el directorio del backend (`Dockerfile` en monolito,
 *   `api/Dockerfile` en monorepo). El contexto de build es siempre la raíz del
 *   repo, para que la etapa Node pueda compilar el frontend (`web/`).
 * - `.dockerignore` va en la raíz (la raíz del contexto de build).
 * - `docker/nginx/nginx.conf` va en la raíz: el compose que genera
 *   `fractal deploy` monta `./docker/nginx/...` relativo a la raíz subida.
 *   TLS ya está cableado (FRA-71): `docker/nginx/ssl` aloja el certificado
 *   Let's Encrypt (fullchain.pem/privkey.pem) que el nginx del contenedor monta,
 *   y `docker/nginx/certbot` es el webroot compartido del challenge ACME
 *   HTTP-01. Ambos se crean como placeholders con un `.gitkeep`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackendFrontendRef } from '@fractal/core';
import { generateDockerfile, generateDockerignore } from '../stubs/dockerfile.js';
import { generateNginxConf } from '../stubs/nginx-conf.js';

export async function writeDockerAssets(
  rootPath: string,
  frontends: BackendFrontendRef[] = [],
  backendDir: string = '.'
): Promise<void> {
  await writeFile(
    join(rootPath, backendDir, 'Dockerfile'),
    generateDockerfile(frontends, { backendDir })
  );
  await writeFile(
    join(rootPath, '.dockerignore'),
    generateDockerignore(frontends, { backendDir })
  );

  const nginxPath = join(rootPath, 'docker', 'nginx');
  await mkdir(nginxPath, { recursive: true });
  await writeFile(join(nginxPath, 'nginx.conf'), generateNginxConf(frontends));

  const sslPath = join(nginxPath, 'ssl');
  await mkdir(sslPath, { recursive: true });
  await writeFile(join(sslPath, '.gitkeep'), '');

  const certbotPath = join(nginxPath, 'certbot');
  await mkdir(certbotPath, { recursive: true });
  await writeFile(join(certbotPath, '.gitkeep'), '');
}
