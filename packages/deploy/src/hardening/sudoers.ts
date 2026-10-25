/**
 * Drop-in sudoers acotado para el usuario de deploy (FRA-75).
 *
 * El contenido se deriva de las invocaciones `sudo` reales del camino de
 * deploy/redeploy (state, runtime, SSL, chequeo de puertos). No incluye
 * sudo irrestricto ni un shell: un atacante con la clave `deploy` no obtiene
 * `sudo -i`. Framework-agnostic: solo rutas y binarios de Linux.
 */

const SAFE_USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;

/** Rutas/comandos que el drop-in DEBE autorizar (el test afirma el alcance). */
export const DEPLOY_SUDOERS_REQUIRED = [
  '/usr/bin/docker',
  '/usr/bin/certbot',
  '/usr/bin/systemctl',
  '/usr/bin/apt-get',
  '/usr/bin/snap',
  'env_keep += "DEBIAN_FRONTEND"',
  '/usr/bin/openssl',
  '/usr/bin/lsof',
  '/usr/bin/cat /etc/fractal/state.json',
  '/usr/bin/mkdir -p /etc/fractal',
  '/usr/bin/tee /etc/fractal/state.json',
  '/usr/bin/rm -f /etc/fractal/state.json',
  '/usr/bin/install -m 0755 -d /etc/apt/keyrings',
  '/usr/bin/gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
  '/usr/bin/chmod a+r /etc/apt/keyrings/docker.gpg',
  '/usr/bin/tee /etc/apt/sources.list.d/docker.list',
  '/usr/bin/mkdir -p /home/deploy/docker/nginx/certbot/.well-known/acme-challenge',
  '/usr/bin/chmod -R 755 /home/deploy/docker/nginx/certbot/.well-known',
  '/usr/bin/cp -L /etc/letsencrypt/live/*/fullchain.pem /home/deploy/docker/nginx/ssl/fullchain.pem',
  '/usr/bin/cp -L /etc/letsencrypt/live/*/privkey.pem /home/deploy/docker/nginx/ssl/privkey.pem',
  '/usr/bin/chmod 644 /home/deploy/docker/nginx/ssl/fullchain.pem',
  '/usr/bin/chmod 600 /home/deploy/docker/nginx/ssl/privkey.pem',
  '/usr/bin/tee /etc/cron.d/certbot-renewal',
  '/usr/bin/tee /etc/letsencrypt/renewal-hooks/post/reload-services',
  '/usr/bin/ln -sf /snap/bin/certbot /usr/bin/certbot',
  '/usr/bin/cloud-init',
  '/usr/bin/fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock',
  '/usr/bin/flock -n /var/lib/dpkg/lock-frontend -c true',
] as const;

/** Fragmentos que el drop-in NO debe contener. */
export const DEPLOY_SUDOERS_FORBIDDEN = [
  'NOPASSWD:ALL',
  'NOPASSWD: ALL',
  '/bin/bash',
  '/bin/sh',
  '/usr/bin/sudo',
] as const;

export function assertSafeSudoersUsername(username: string): void {
  if (!SAFE_USERNAME.test(username)) {
    throw new Error(
      `Usuario de deploy inválido para sudoers: "${username}" ` +
        `(solo [a-z_][a-z0-9_-], máximo 32 caracteres)`
    );
  }
}

/**
 * Genera el texto del drop-in `/etc/sudoers.d/90-fractal-<user>`.
 * `SETENV` no se usa: `DEBIAN_FRONTEND` se preserva con `env_keep`
 * (el instalador de Docker lo exporta antes de `sudo apt-get`).
 */
export function buildDeploySudoers(username: string): string {
  assertSafeSudoersUsername(username);

  return [
    `# Fractal — sudo acotado para ${username} (FRA-75).`,
    `# Sin sudo irrestricto ni shell: solo comandos del provisioning y el redeploy.`,
    ``,
    `Cmnd_Alias FRACTAL_STATE = \\`,
    `    /usr/bin/cat /etc/fractal/state.json, \\`,
    `    /usr/bin/mkdir -p /etc/fractal, \\`,
    `    /usr/bin/tee /etc/fractal/state.json, \\`,
    `    /usr/bin/rm -f /etc/fractal/state.json`,
    ``,
    `Cmnd_Alias FRACTAL_PKG = \\`,
    `    /usr/bin/apt-get, \\`,
    `    /usr/bin/snap`,
    ``,
    `Cmnd_Alias FRACTAL_RUNTIME = \\`,
    `    /usr/bin/docker, \\`,
    `    /usr/bin/systemctl enable docker, \\`,
    `    /usr/bin/systemctl start docker, \\`,
    `    /usr/bin/systemctl is-active docker, \\`,
    `    /usr/sbin/usermod -aG docker ${username}, \\`,
    `    /usr/bin/install -m 0755 -d /etc/apt/keyrings, \\`,
    `    /usr/bin/gpg --dearmor -o /etc/apt/keyrings/docker.gpg, \\`,
    `    /usr/bin/chmod a+r /etc/apt/keyrings/docker.gpg, \\`,
    `    /usr/bin/tee /etc/apt/sources.list.d/docker.list, \\`,
    `    /usr/bin/cloud-init, \\`,
    `    /usr/bin/fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock, \\`,
    `    /usr/bin/flock -n /var/lib/dpkg/lock-frontend -c true`,
    ``,
    `Cmnd_Alias FRACTAL_SSL = \\`,
    `    /usr/bin/certbot, \\`,
    `    /usr/bin/openssl, \\`,
    `    /usr/bin/ln -sf /snap/bin/certbot /usr/bin/certbot, \\`,
    `    /usr/bin/systemctl enable certbot.timer, \\`,
    `    /usr/bin/systemctl start certbot.timer, \\`,
    `    /usr/bin/mkdir -p /home/deploy/docker/nginx/certbot/.well-known/acme-challenge, \\`,
    `    /usr/bin/chmod -R 755 /home/deploy/docker/nginx/certbot/.well-known, \\`,
    `    /usr/bin/cp -L /etc/letsencrypt/live/*/fullchain.pem /home/deploy/docker/nginx/ssl/fullchain.pem, \\`,
    `    /usr/bin/cp -L /etc/letsencrypt/live/*/privkey.pem /home/deploy/docker/nginx/ssl/privkey.pem, \\`,
    `    /usr/bin/chmod 644 /home/deploy/docker/nginx/ssl/fullchain.pem, \\`,
    `    /usr/bin/chmod 600 /home/deploy/docker/nginx/ssl/privkey.pem, \\`,
    `    /usr/bin/tee /etc/cron.d/certbot-renewal, \\`,
    `    /usr/bin/chmod 644 /etc/cron.d/certbot-renewal, \\`,
    `    /usr/bin/tee /etc/letsencrypt/renewal-hooks/post/reload-services, \\`,
    `    /usr/bin/chmod +x /etc/letsencrypt/renewal-hooks/post/reload-services`,
    ``,
    `Cmnd_Alias FRACTAL_PROBE = /usr/bin/lsof`,
    ``,
    `Defaults:${username} env_keep += "DEBIAN_FRONTEND"`,
    `${username} ALL=(ALL) NOPASSWD: FRACTAL_STATE, FRACTAL_PKG, FRACTAL_RUNTIME, FRACTAL_SSL, FRACTAL_PROBE`,
    ``,
  ].join('\n');
}
