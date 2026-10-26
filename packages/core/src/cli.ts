#!/usr/bin/env node

import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { newCommand } from './commands/new.js';
import { deployCommand } from './commands/deploy.js';
import { statusCommand } from './commands/status.js';
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
