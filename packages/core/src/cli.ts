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
  .command('new <project-name>')
  .description('Genera un nuevo proyecto Fractal')
  .option(
    '-t, --topology <topology>',
    'Topología del proyecto (monolith, monorepo, multirepo)'
  )
  .option(
    '-f, --force',
    'Fuerza la generación sobre un directorio no vacío'
  )
  .action(async (projectName: string, options: NewCommandOptions) => {
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
