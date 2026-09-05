import { resolve } from 'node:path';
import chalk from 'chalk';
import type { NewCommandOptions, ValidatedNewParams } from '../types/new-command.js';
import { isValidTopology, DEFAULT_TOPOLOGY } from '../types/topology.js';
import { validateTargetDirectory } from '../utils/directory-validator.js';
import { promptTopology } from '../utils/prompts.js';

/**
 * Comando `fractal new`.
 * 
 * Valida parámetros, pregunta topología si no está especificada,
 * valida el directorio destino, y prepara los parámetros para generación.
 * 
 * Este ticket NO invoca el adapter real todavía — termina en
 * "parámetros validados, listo para generar".
 */
export async function newCommand(
  projectName: string,
  options: NewCommandOptions
): Promise<void> {
  console.log(chalk.blue('🔷 Fractal — Generador de aplicaciones production-ready\n'));
  
  const targetDir = resolve(process.cwd(), projectName);
  
  const validation = validateTargetDirectory(targetDir, options.force);
  
  if (!validation.canProceed) {
    console.error(chalk.red(`\n❌ Error: ${validation.reason}`));
    process.exit(1);
  }
  
  if (validation.reason) {
    console.log(chalk.yellow(`⚠️  ${validation.reason}\n`));
  }
  
  let topology = options.topology || DEFAULT_TOPOLOGY;
  
  if (!options.topology) {
    topology = await promptTopology();
  } else {
    if (!isValidTopology(options.topology)) {
      console.error(
        chalk.red(
          `\n❌ Error: Topología inválida '${options.topology}'. ` +
          `Opciones válidas: monolith, monorepo, multirepo`
        )
      );
      process.exit(1);
    }
  }
  
  const params: ValidatedNewParams = {
    projectName,
    targetDir,
    topology,
    target: 'default',
  };
  
  console.log(chalk.green('\n✅ Parámetros validados:'));
  console.log(`   Proyecto: ${chalk.bold(params.projectName)}`);
  console.log(`   Directorio: ${chalk.dim(params.targetDir)}`);
  console.log(`   Topología: ${chalk.bold(params.topology)}`);
  
  await generateProject(params);
}

/**
 * Punto de extensión para la generación del proyecto.
 * 
 * TODO: Conectar con el adapter correspondiente cuando SPEC-0006 esté implementado.
 * Por ahora, solo reporta que los parámetros están listos.
 */
async function generateProject(params: ValidatedNewParams): Promise<void> {
  console.log(chalk.blue('\n📦 Generación del proyecto...'));
  console.log(
    chalk.yellow(
      '\n⚠️  Punto de extensión: la generación real se implementará ' +
      'cuando el contrato del adapter esté disponible (SPEC-0006).'
    )
  );
  console.log(chalk.dim('\nParámetros listos para pasar al adapter:'));
  console.log(chalk.dim(JSON.stringify(params, null, 2)));
}
