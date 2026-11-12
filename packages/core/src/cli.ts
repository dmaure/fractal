#!/usr/bin/env node

import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { newCommand } from './commands/new.js';
import { deployCommand } from './commands/deploy.js';
import { statusCommand } from './commands/status.js';
import { fdlCheckCommand } from './commands/fdl-check.js';
import { doctorCommand } from './commands/doctor.js';
import type { NewCommandOptions } from './types/new-command.js';
import type { DeployCommandOptions } from './types/deploy-command.js';
import type { StatusCommandOptions } from './types/status-command.js';

const program = new Command();

program
  .name('fractal')
  .description('Generador de aplicaciones production-ready, multi-framework')
  .version('0.0.0');

program
  .command('new [project-name]')
  .description('Genera un nuevo proyecto Fractal')
  .option(
    '-t, --topology <topology>',
    'Topología del proyecto (monolith, monorepo, multirepo)'
  )
  .option(
    '-f, --force',
    'Fuerza la generación sobre un directorio no vacío'
  )
  .option(
    '--non-interactive',
    'Sin prompts: lee flags y FRACTAL_NEW_* / FRACTAL_DEPLOY_*'
  )
  .option('--name <name>', 'Nombre del proyecto (alternativa al argumento posicional)')
  .option('--framework <framework>', 'Framework del backend (opción del adapter; default: la única disponible)')
  .option('--database <database>', 'Base de datos (default: postgresql)')
  .option('--frontend <frontend>', 'Framework del frontend (default: react-vite)')
  .option('--server-ip <ip>', 'IPv4 del VPS')
  .option('--ssh-user <user>', 'Usuario SSH de provisioning (default: root)')
  .option('--auth-method <method>', 'Autenticación SSH: key | password')
  .option('--ssh-key-path <path>', 'Ruta a la clave privada SSH')
  .option('--ssh-password <password>', 'Contraseña SSH (si --auth-method password)')
  .option('--domain <domain>', 'Dominio de la aplicación')
  .option('--email <email>', 'Email para Let\'s Encrypt')
  .option('--dns-provider <provider>', 'Proveedor DNS: cloudflare | route53 | manual')
  .option('--dns-api-token <token>', 'Token/credenciales del proveedor DNS')
  .option('--production-branch <branch>', 'Rama de producción (default: main)')
  .option('--github-token <token>', 'Token de GitHub para crear el repo y setear secrets')
  .option('--github-owner <owner>', 'Usuario u organización de GitHub')
  .option('--github-repo <repo>', 'Nombre del repo remoto (default: nombre del proyecto)')
  .option('--github-visibility <visibility>', 'Visibilidad del repo: private | public')
  .option('--db-password <password>', 'Contraseña de la base de datos de producción')
  .option('--generate-db-password', 'Genera la contraseña de la base (default en --non-interactive)')
  .option('--deploy', 'Encadena a fractal deploy al terminar')
  .option('--dry-run', 'Muestra los paths del pack de convenciones que se escribirían, sin tocar disco')
  .action(async (projectName: string | undefined, options: NewCommandOptions) => {
    try {
      await newCommand(projectName, options);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('deploy')
  .description('Despliega la aplicación en un VPS')
  .option(
    '--reconfigure',
    'Reconfigura las variables cruzadas en multirepo'
  )
  .option(
    '--non-interactive',
    'Ejecuta el deploy sin prompts, leyendo los parámetros de variables de entorno (FRACTAL_DEPLOY_*)'
  )
  .option(
    '--ssh-known-hosts <path>',
    'Ruta a known_hosts con la host key pineada (también FRACTAL_DEPLOY_SSH_KNOWN_HOSTS)'
  )
  .action(async (options: DeployCommandOptions) => {
    try {
      await deployCommand(options);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Muestra el estado del proyecto según progress.json')
  .option(
    '--write',
    'Regenera los diagramas de docs/MAPA_DE_PROGRESO.md desde progress.json'
  )
  .option(
    '--check',
    'Valida (sin escribir) que docs/MAPA_DE_PROGRESO.md esté sincronizado; ' +
      'sale con código != 0 si está desactualizado (guardia de CI)'
  )
  .option(
    '--export',
    'Exporta los diagramas del mapa de progreso a imágenes (SVG/PNG). ' +
      'Independiente de --write/--check: no modifica el mapa ni la guardia de CI'
  )
  .option(
    '--out <dir>',
    'Directorio de salida para --export (por defecto docs/progress-map/)'
  )
  .option(
    '--format <format>',
    'Formato de --export: svg | png | both (por defecto both)'
  )
  .action(async (options: StatusCommandOptions) => {
    try {
      await statusCommand(options);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

const fdl = program
  .command('fdl')
  .description('Operaciones sobre el FDL (Fractal Definition Language)');

fdl
  .command('check <path>')
  .description('Valida un archivo FDL como contrato (VR-1..VR-12); sale != 0 si es inválido')
  .action(async (path: string) => {
    try {
      await fdlCheckCommand(path);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

/**
 * Parsea una opción numérica entera no negativa. Devuelve `null` si es inválida
 * (no numérica, negativa o no entera), para que el comando pueda salir con un
 * error de uso.
 */
function parseNonNegativeInt(raw: unknown, name: string): number | null {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`❌ Opción --${name} inválida: se esperaba un entero no negativo (recibido: ${String(raw)}).`);
    return null;
  }
  return value;
}

/**
 * Parsea una opción numérica entera positiva (>= 1). Devuelve `null` si es
 * inválida (no numérica, no entera o < 1), para que el comando pueda salir con
 * un error de uso. Se usa para `--timeout` y `--retries`, donde 0 sería un
 * footgun (`--timeout 0` = sin timeout en node:http; `--retries 0` colapsa a un
 * único intento).
 */
function parsePositiveInt(raw: unknown, name: string): number | null {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`❌ Opción --${name} inválida: se esperaba un entero >= 1 (recibido: ${String(raw)}).`);
    return null;
  }
  return value;
}

interface DoctorCliOptions {
  expectContent?: string;
  timeout?: string;
  retries?: string;
  retryDelay?: string;
  insecure?: boolean;
  checkRedirect?: boolean;
  json?: boolean;
}

program
  .command('doctor <target>')
  .description('Chequeo determinista post-deploy: HTTPS, app levantada y página base')
  .option('--expect-content <text>', 'Substring que debe aparecer en la página base (señal de app arriba)')
  .option('--timeout <ms>', 'Timeout por request en ms, entero >= 1 (default 10000)')
  .option('--retries <n>', 'Máximo de intentos TOTALES (incluye el primero) ante fallos transitorios, entero >= 1 (default 10)')
  .option('--retry-delay <ms>', 'Delay base entre intentos en ms (default 5000)')
  .option('--insecure', 'Omite la validación del certificado TLS (staging / self-signed)')
  .option('--check-redirect', 'Verifica también la redirección HTTP→HTTPS')
  .option('--json', 'Salida machine-readable en JSON')
  .action(async (target: string, opts: DoctorCliOptions) => {
    try {
      const timeout = opts.timeout === undefined ? 10000 : parsePositiveInt(opts.timeout, 'timeout');
      const retries = opts.retries === undefined ? 10 : parsePositiveInt(opts.retries, 'retries');
      const retryDelay =
        opts.retryDelay === undefined ? 5000 : parseNonNegativeInt(opts.retryDelay, 'retry-delay');

      if (timeout === null || retries === null || retryDelay === null) {
        process.exit(1);
      }

      const code = await doctorCommand(target, {
        expectContent: opts.expectContent,
        timeout,
        retries,
        retryDelay,
        insecure: opts.insecure ?? false,
        checkRedirect: opts.checkRedirect ?? false,
        json: opts.json ?? false,
      });
      process.exit(code);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

export { program };

// Ejecutar solo si se invoca directamente (no al importar desde los tests).
// Esto permite testear que cargar el CLI no arrastra `ssh2` sin disparar el
// parseo de argumentos (FRA-46). Se resuelve `argv[1]` con `realpathSync` para
// que la detección funcione también cuando se invoca vía el bin `fractal`
// (symlink en node_modules/.bin apuntando a dist/cli.js).
function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  program.parse();
}
