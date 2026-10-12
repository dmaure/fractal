/**
 * Test end-to-end de `fractal deploy` contra un VPS efímero REAL (SPEC-0003 DoD §9).
 *
 * Este test NO corre localmente: queda SALTADO salvo que el entorno provea
 * `FRACTAL_E2E_VPS_IP` (la IP de un VPS recién provisionado). En CI, el workflow
 * `.github/workflows/deploy-e2e.yml` crea un VPS Vultr efímero, un registro DNS
 * DNS-only en Cloudflare y exporta las variables que este test consume. El mismo
 * workflow destruye SIEMPRE el VPS y el registro DNS al final (`if: always()`),
 * aun si este test falla.
 *
 * Variables de entorno consumidas:
 *   - FRACTAL_E2E_VPS_IP       IP pública del VPS (gate del suite).
 *   - FRACTAL_E2E_SSH_KEY_PATH Ruta a la clave privada ed25519 (su `.pub` vive al lado).
 *   - FRACTAL_E2E_DOMAIN       Subdominio completo (p.ej. e2e-123.codigofractal.dev).
 *   - FRACTAL_E2E_SSH_USER     Usuario SSH inicial (opcional, default: root).
 *   - LETSENCRYPT_EMAIL        Email para Let's Encrypt (opcional, default e2e@codigofractal.dev).
 *   - CLOUDFLARE_API_TOKEN     Token de Cloudflare (reservado; el registro lo crea el workflow).
 *   - CLOUDFLARE_ZONE_ID       Zone ID de codigofractal.dev (reservado; ídem).
 *
 * Qué ejercita (SPEC-0003):
 *   - AC-2  Conectividad SSH + validación de distro/recursos/puertos.
 *   - AC-3  Hardening del sistema (usuario deploy, SSH hardening, firewall).
 *   - AC-4  Runtime Docker (DockerInstaller / RuntimeManager.verifyRuntime).
 *   - AC-5  DNS Cloudflare DNS-only (propagación del registro A → IP del VPS).
 *   - AC-7  SSL Let's Encrypt STAGING (emisión real vía HTTP-01 webroot).
 *
 * MVP (prioridad de Diego): la cosa más simple que prueba que un deploy deja una
 * página básica funcionando en producción (HTTP y HTTPS sobre un dominio real),
 * con teardown garantizado desde CI.
 *
 * Decisiones de diseño (ver STEP 1 del ticket FRA-64):
 *  - La página básica se sirve con UN contenedor `nginx:alpine` llamado
 *    `fractal_e2e_nginx` (el nombre matchea el postRenewalHook de deploy.ts:
 *    `docker exec <project>_nginx nginx -s reload`). No usamos ComposeGenerator
 *    (su compose referencia una `image:` prebuildeada, no un sitio estático);
 *    escribimos nuestro propio docker-compose.yml mínimo.
 *  - El método de certbot del módulo SSL es **webroot** (`certbot certonly
 *    --webroot -w /var/www/html`). Por eso el contenedor sirve `/var/www/html`
 *    (bind-mount del host) para que el challenge ACME HTTP-01 que certbot escribe
 *    en el host sea servido por el contenedor. Usamos Let's Encrypt STAGING para
 *    no gastar rate limits.
 *  - `NginxSslConfigGenerator` del módulo configura un nginx **del host**
 *    (sites-available / `systemctl reload nginx`), incompatible con el MVP
 *    containerizado. Por eso `SslManager.setup()` emite el certificado (lo que nos
 *    importa de AC-7: emisión real contra un dominio real) pero su paso de nginx
 *    del host NO aplica; servimos 443 desde el contenedor con el cert emitido.
 *    Afirmamos sobre `certificateIssuance.success`, no sobre `setup().success`.
 *    TODO(FRA-xx): ofrecer un generador de nginx containerizado en el módulo SSL.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve4 } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  SshClient,
  ServerValidator,
  DEFAULT_REQUIREMENTS,
  SystemHardening,
  DockerInstaller,
  RuntimeManager,
  SslManager,
  adaptSshClient,
} from '../index.js';

const execFileAsync = promisify(execFile);

// --- Configuración leída del entorno -----------------------------------------

const VPS_IP = process.env.FRACTAL_E2E_VPS_IP ?? '';
const SSH_KEY_PATH = process.env.FRACTAL_E2E_SSH_KEY_PATH ?? '';
const DOMAIN = process.env.FRACTAL_E2E_DOMAIN ?? '';
const SSH_USER = process.env.FRACTAL_E2E_SSH_USER ?? 'root';
const LE_EMAIL = process.env.LETSENCRYPT_EMAIL ?? 'e2e@codigofractal.dev';

const PROJECT_NAME = 'fractal_e2e';
const NGINX_CONTAINER = `${PROJECT_NAME}_nginx`;
const PROJECT_DIR = '/home/deploy/fractal_e2e';
const WEBROOT = '/var/www/html';
const MARKER = `FRACTAL_E2E_OK ${DOMAIN}`;

// Timeouts generosos: las instalaciones apt y la emisión de certificados tardan.
const T_CONNECT = 120_000;
const T_VALIDATE = 180_000;
const T_HARDEN = 600_000;
const T_DOCKER = 900_000;
const T_DNS = 360_000;
const T_HTTP = 360_000;
const T_SSL = 600_000;

// --- Helpers de polling y HTTP ------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface HttpResult {
  status: number;
  body: string;
  location?: string;
}

/**
 * GET simple con node:http / node:https. NO sigue redirects (para poder afirmar
 * el 301 HTTP→HTTPS). `insecure` desactiva la verificación del certificado, que
 * es necesaria con certificados de STAGING (no son de confianza).
 */
function httpGet(
  url: string,
  options: { insecure?: boolean; timeoutMs?: number } = {}
): Promise<HttpResult> {
  const { insecure = false, timeoutMs = 15_000 } = options;
  const isHttps = url.startsWith('https://');

  return new Promise((resolvePromise, reject) => {
    const onResponse = (res: import('node:http').IncomingMessage): void => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        resolvePromise({
          status: res.statusCode ?? 0,
          body,
          location: res.headers.location,
        });
      });
    };

    const req = isHttps
      ? httpsRequest(
          url,
          {
            method: 'GET',
            timeout: timeoutMs,
            ...(insecure ? { agent: new HttpsAgent({ rejectUnauthorized: false }) } : {}),
          },
          onResponse
        )
      : httpRequest(url, { method: 'GET', timeout: timeoutMs }, onResponse);

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout de ${timeoutMs}ms solicitando ${url}`));
    });
    req.end();
  });
}

/**
 * Polla una condición hasta que sea verdadera o se agote el timeout.
 */
async function pollUntil(
  label: string,
  fn: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs: number }
): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      if (await fn()) {
        console.log(`   ✓ ${label} (intento ${attempt})`);
        return true;
      }
    } catch (err) {
      console.log(
        `   … ${label}: intento ${attempt} falló (${err instanceof Error ? err.message : String(err)})`
      );
    }
    await sleep(opts.intervalMs);
  }
  console.log(`   ✗ ${label}: timeout tras ${opts.timeoutMs}ms`);
  return false;
}

/**
 * Obtiene la clave pública SSH: primero intenta `${keyPath}.pub`, luego la
 * deriva con `ssh-keygen -y` (mismo criterio que deriveSshPublicKey en deploy.ts).
 */
async function getPublicKey(keyPath: string): Promise<string> {
  try {
    const pub = await readFile(`${keyPath}.pub`, 'utf8');
    if (pub.trim()) return pub.trim();
  } catch {
    // cae al fallback con ssh-keygen
  }
  const { stdout } = await execFileAsync('ssh-keygen', ['-y', '-f', keyPath]);
  return stdout.trim();
}

// --- Generadores de configuración nginx (containerizada) ----------------------

/**
 * Fase A: solo HTTP. Sirve la página y el challenge ACME desde /var/www/html.
 */
function nginxHttpOnly(domain: string): string {
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    root ${WEBROOT};
    index index.html;

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type "text/plain";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
}

/**
 * Fase B: HTTP redirige a HTTPS (salvo el challenge ACME, para renovaciones) y
 * HTTPS sirve la página con el certificado emitido por Let's Encrypt.
 */
function nginxWithSsl(domain: string): string {
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type "text/plain";
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${domain};

    root ${WEBROOT};
    index index.html;

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
}

function composeFile(): string {
  return `services:
  nginx:
    image: nginx:alpine
    container_name: ${NGINX_CONTAINER}
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ${WEBROOT}:${WEBROOT}:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ${PROJECT_DIR}/nginx.conf:/etc/nginx/conf.d/default.conf:ro
`;
}

/**
 * Escribe un archivo en el servidor remoto vía heredoc. `useSudo` para rutas
 * que requieren root (p.ej. /var/www/html). El contenido ya viene interpolado
 * desde JS; el heredoc va con comillas para evitar expansión del shell remoto.
 */
async function writeRemoteFile(
  client: SshClient,
  path: string,
  content: string,
  useSudo: boolean
): Promise<void> {
  const tee = useSudo ? 'sudo tee' : 'tee';
  const cmd = `${tee} ${path} > /dev/null << 'FRACTAL_E2E_FILE_EOF'\n${content}\nFRACTAL_E2E_FILE_EOF`;
  const res = await client.executeCommand(cmd, { timeoutMs: 30_000 });
  expect(
    res.success,
    `No se pudo escribir ${path}: ${res.stderr || res.error}`
  ).toBe(true);
}

// --- Suite --------------------------------------------------------------------

describe.skipIf(!VPS_IP)('E2E · deploy contra VPS efímero real (SPEC-0003)', () => {
  // Estado compartido entre los pasos (tests secuenciales en un mismo archivo).
  let rootClient: SshClient;
  let deployClient: SshClient;
  let publicKey = '';

  beforeAll(() => {
    expect(SSH_KEY_PATH, 'FRACTAL_E2E_SSH_KEY_PATH es requerido').not.toBe('');
    expect(DOMAIN, 'FRACTAL_E2E_DOMAIN es requerido').not.toBe('');

    console.log('\n=== E2E deploy VPS ===');
    console.log(`   VPS:     ${VPS_IP}`);
    console.log(`   Dominio: ${DOMAIN}`);
    console.log(`   Usuario: ${SSH_USER}`);
    console.log(`   Proyecto: ${PROJECT_NAME} (contenedor ${NGINX_CONTAINER})\n`);

    rootClient = new SshClient({
      host: VPS_IP,
      username: SSH_USER,
      privateKeyPath: SSH_KEY_PATH,
      timeout: T_CONNECT,
      onUnknownHost: () => true,
    });
  });

  it(
    'AC-2 · conecta por SSH como root',
    async () => {
      console.log('→ [AC-2] Probando conectividad SSH como root...');
      const result = await rootClient.testConnection();
      expect(result.success, `Conexión SSH falló: ${result.error}`).toBe(true);
      publicKey = await getPublicKey(SSH_KEY_PATH);
      expect(publicKey.startsWith('ssh-')).toBe(true);
      console.log('   ✓ Conectado y clave pública derivada');
    },
    T_CONNECT
  );

  it(
    'AC-2 · valida distribución, recursos y puertos',
    async () => {
      console.log('→ [AC-2] Validando servidor...');
      const validator = new ServerValidator(rootClient);

      const validation = await validator.validate();
      console.log(`   serverInfo: ${JSON.stringify(validation.serverInfo)}`);
      expect(validation.valid, `Validación falló: ${validation.errors.join('; ')}`).toBe(true);
      expect(validation.serverInfo?.os).toContain('Ubuntu');
      expect(validation.serverInfo!.cpuCount).toBeGreaterThanOrEqual(DEFAULT_REQUIREMENTS.minCpu);
      expect(validation.serverInfo!.ramGb).toBeGreaterThanOrEqual(DEFAULT_REQUIREMENTS.minRamGb);
      expect(validation.serverInfo!.diskAvailableGb).toBeGreaterThanOrEqual(
        DEFAULT_REQUIREMENTS.minDiskGb
      );

      // AC-14: puertos 80/443 libres ANTES de levantar contenedores.
      const ports = await validator.validatePorts();
      expect(
        ports.available,
        `Puertos ocupados: ${ports.occupiedPorts.join(', ')}`
      ).toBe(true);
      console.log('   ✓ Distro Ubuntu LTS, recursos OK, puertos 80/443 libres');
    },
    T_VALIDATE
  );

  it(
    'AC-3 · endurece el sistema y reconecta como usuario deploy',
    async () => {
      // Infra del e2e (no forma parte del flujo de producción): el módulo opera
      // como `deploy` con `sudo` NO interactivo, y un `useradd` normal deja a
      // deploy sin poder usar sudo (sin password). Concedemos NOPASSWD como root
      // ANTES del hardening (que deshabilita el login de root). Pre-crear deploy
      // hace que SystemHardening.createDeployUser lo detecte idempotentemente.
      console.log('→ [AC-3] Preparando usuario deploy (NOPASSWD sudo, infra del e2e)...');
      const prep = await rootClient.executeCommand(
        'sudo useradd -m -s /bin/bash deploy 2>/dev/null || true; ' +
          `printf 'deploy ALL=(ALL) NOPASSWD:ALL\\n' | sudo tee /etc/sudoers.d/90-fractal-e2e-deploy > /dev/null && ` +
          'sudo chmod 440 /etc/sudoers.d/90-fractal-e2e-deploy && ' +
          'sudo visudo -cf /etc/sudoers.d/90-fractal-e2e-deploy',
        { timeoutMs: 60_000 }
      );
      expect(prep.success, `Prep de deploy falló: ${prep.stderr || prep.error}`).toBe(true);

      console.log('→ [AC-3] Ejecutando hardening...');
      const hardening = new SystemHardening(rootClient);
      const result = await hardening.harden({
        deployUser: 'deploy',
        sshPublicKey: publicKey,
        allowedPorts: [22, 80, 443],
      });
      console.log(`   pasos: ${result.steps.join(' | ')}`);
      expect(result.success, `Hardening falló: ${result.error}`).toBe(true);

      // Reconexión como deploy (mismo patrón que deploy.ts, decisión de producto #5).
      console.log('→ [AC-3] Reconectando como usuario deploy...');
      deployClient = new SshClient({
        host: VPS_IP,
        username: 'deploy',
        privateKeyPath: SSH_KEY_PATH,
        timeout: T_CONNECT,
        onUnknownHost: () => true,
      });
      const conn = await deployClient.testConnection();
      expect(conn.success, `Reconexión como deploy falló: ${conn.error}`).toBe(true);
      console.log('   ✓ Hardening aplicado y reconectado como deploy');
    },
    T_HARDEN
  );

  it(
    'AC-4 · instala el runtime Docker y lo verifica activo',
    async () => {
      console.log('→ [AC-4] Instalando Docker CE + Compose plugin...');
      const installer = new DockerInstaller(deployClient);
      const install = await installer.install({ checkPrerequisites: true });
      console.log(`   pasos: ${install.steps.join(' | ')}`);
      expect(install.success, `Instalación de Docker falló: ${install.error}`).toBe(true);

      const runtime = new RuntimeManager(deployClient);
      const verify = await runtime.verifyRuntime();
      expect(verify.ready, `Runtime no listo: ${verify.error}`).toBe(true);

      const active = await deployClient.executeCommand('sudo systemctl is-active docker');
      expect(active.stdout.trim()).toBe('active');
      console.log(`   ✓ Docker activo (${install.dockerVersion}), Compose (${install.composeVersion})`);
    },
    T_DOCKER
  );

  it(
    'MVP · levanta la página básica en un contenedor nginx:alpine',
    async () => {
      console.log('→ [MVP] Escribiendo sitio estático + compose (fase HTTP)...');

      // index.html con marcador único, en el webroot que comparte con certbot.
      await writeRemoteFile(
        deployClient,
        `${WEBROOT}/index.html`,
        `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>Fractal E2E</title></head>
  <body><h1>${MARKER}</h1></body>
</html>`,
        true
      );

      // Directorio del proyecto + archivos de compose/nginx (propiedad de deploy).
      const mk = await deployClient.executeCommand(
        `mkdir -p ${PROJECT_DIR} && sudo mkdir -p /etc/letsencrypt`,
        { timeoutMs: 30_000 }
      );
      expect(mk.success, `mkdir falló: ${mk.stderr || mk.error}`).toBe(true);

      await writeRemoteFile(deployClient, `${PROJECT_DIR}/nginx.conf`, nginxHttpOnly(DOMAIN), false);
      await writeRemoteFile(deployClient, `${PROJECT_DIR}/docker-compose.yml`, composeFile(), false);

      console.log('→ [MVP] docker compose up -d...');
      const up = await deployClient.executeCommand(
        `sudo docker compose -f ${PROJECT_DIR}/docker-compose.yml up -d`,
        { timeoutMs: 300_000 }
      );
      expect(up.success, `compose up falló: ${up.stderr || up.error}`).toBe(true);

      const ps = await deployClient.executeCommand(
        `sudo docker inspect -f '{{.State.Running}}' ${NGINX_CONTAINER}`,
        { timeoutMs: 30_000 }
      );
      expect(ps.stdout.trim()).toBe('true');
      console.log('   ✓ Contenedor nginx corriendo');
    },
    T_DOCKER
  );

  it(
    'AC-5 · el registro DNS DNS-only propaga a la IP del VPS',
    async () => {
      console.log(`→ [AC-5] Esperando propagación DNS de ${DOMAIN} → ${VPS_IP}...`);
      // El registro A (proxied:false) lo crea el workflow; aquí solo esperamos
      // que resuelva a la IP del VPS (requisito de HTTP-01 directo al origen).
      const ok = await pollUntil(
        `${DOMAIN} resuelve a ${VPS_IP}`,
        async () => {
          const ips = await resolve4(DOMAIN);
          return ips.includes(VPS_IP);
        },
        { timeoutMs: T_DNS, intervalMs: 10_000 }
      );
      expect(ok, 'El DNS no propagó a la IP del VPS').toBe(true);
    },
    T_DNS + 30_000
  );

  it(
    'MVP · la página básica responde por HTTP sobre el dominio real',
    async () => {
      console.log(`→ [MVP] Verificando http://${DOMAIN} (200 + marcador)...`);
      const ok = await pollUntil(
        `http://${DOMAIN} sirve el marcador`,
        async () => {
          const res = await httpGet(`http://${DOMAIN}/`);
          return res.status === 200 && res.body.includes(MARKER);
        },
        { timeoutMs: T_HTTP, intervalMs: 10_000 }
      );
      expect(ok, 'La página no respondió por HTTP con el marcador').toBe(true);
    },
    T_HTTP + 30_000
  );

  it(
    'AC-7 · emite certificado Let\'s Encrypt STAGING y sirve HTTPS',
    async () => {
      console.log('→ [AC-7] Emitiendo certificado STAGING vía SslManager (webroot)...');
      const ssl = new SslManager(adaptSshClient(deployClient));
      const result = await ssl.setup({
        domain: DOMAIN,
        email: LE_EMAIL,
        environment: 'staging',
        includeWww: false,
        webrootPath: WEBROOT,
        postRenewalHook: `docker exec ${NGINX_CONTAINER} nginx -s reload`,
      });

      console.log(`   certbotInstall: ${JSON.stringify(result.certbotInstall)}`);
      console.log(`   issuance: ${JSON.stringify(result.certificateIssuance)}`);
      if (result.nginxConfig) {
        // Se espera que falle: NginxSslConfigGenerator opera sobre nginx del host,
        // que no existe en el MVP containerizado (ver cabecera del archivo).
        console.log(`   nginxConfig (host, se ignora): ${JSON.stringify(result.nginxConfig)}`);
      }

      expect(
        result.certbotInstall.success,
        `Instalación de certbot falló: ${result.certbotInstall.error}`
      ).toBe(true);
      expect(
        result.certificateIssuance?.success,
        `Emisión del certificado falló: ${result.certificateIssuance?.error}`
      ).toBe(true);

      const certExists = await deployClient.executeCommand(
        `sudo test -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem && echo ok`,
        { timeoutMs: 30_000 }
      );
      expect(certExists.stdout.trim()).toBe('ok');
      console.log('   ✓ Certificado STAGING emitido');

      // Reconfigurar el contenedor para servir 443 con el cert emitido + redirect.
      console.log('→ [AC-7] Reconfigurando nginx del contenedor para HTTPS...');
      await writeRemoteFile(deployClient, `${PROJECT_DIR}/nginx.conf`, nginxWithSsl(DOMAIN), false);
      const reload = await deployClient.executeCommand(
        `sudo docker exec ${NGINX_CONTAINER} nginx -t && sudo docker exec ${NGINX_CONTAINER} nginx -s reload`,
        { timeoutMs: 60_000 }
      );
      expect(reload.success, `Reload de nginx falló: ${reload.stderr || reload.error}`).toBe(true);

      console.log(`→ [AC-7] Verificando https://${DOMAIN} (insecure, STAGING no es de confianza)...`);
      const httpsOk = await pollUntil(
        `https://${DOMAIN} sirve el marcador`,
        async () => {
          const res = await httpGet(`https://${DOMAIN}/`, { insecure: true });
          return res.status === 200 && res.body.includes(MARKER);
        },
        { timeoutMs: T_HTTP, intervalMs: 10_000 }
      );
      expect(httpsOk, 'La página no respondió por HTTPS con el marcador').toBe(true);

      console.log(`→ [AC-7] Verificando redirect http://${DOMAIN} → https...`);
      const redirect = await httpGet(`http://${DOMAIN}/`);
      expect([301, 302, 308]).toContain(redirect.status);
      expect(redirect.location ?? '').toMatch(/^https:\/\//);
      console.log('   ✓ HTTPS sirve la página y HTTP redirige a HTTPS');
    },
    T_SSL + T_HTTP
  );
});
