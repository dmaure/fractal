#!/usr/bin/env node

import { Command } from 'commander';
import { newCommand } from './commands/new.js';
import type { NewCommandOptions } from './types/new-command.js';

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

program.parse();
