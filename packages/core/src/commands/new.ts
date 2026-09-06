import { resolve } from 'node:path';
import chalk from 'chalk';
import type { NewCommandOptions, ValidatedNewParams } from '../types/new-command.js';
import { isValidTopology, DEFAULT_TOPOLOGY } from '../types/topology.js';
import { validateTargetDirectory } from '../utils/directory-validator.js';
import { promptTopology } from '../utils/prompts.js';
import { initializeGit } from '../utils/git-initializer.js';

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
 * Genera el proyecto según los parámetros validados.
 * 
 * Inicializa git según la topología:
 * - Monolito / monorepo desacoplado: un único repo con commit inicial
 * - Multirepo: dos repos separados (api/ y web/) con commits iniciales y manifiestos
 * 
 * TODO: Conectar con el adapter correspondiente cuando SPEC-0006 esté implementado
 * para generar la estructura completa del framework.
 */
async function generateProject(params: ValidatedNewParams): Promise<void> {
  console.log(chalk.blue('\n📦 Inicializando estructura del proyecto...'));
  
  // Inicializar repositorio(s) git según topología
  const gitResult = initializeGit(params.projectName, params.targetDir, params.topology);
  
  if (!gitResult.success) {
    console.error(chalk.red(`\n❌ Error al inicializar git: ${gitResult.error}`));
    process.exit(1);
  }
  
  // Reportar éxito
  console.log(chalk.green('\n✅ Repositorio(s) git inicializado(s):'));
  for (const repo of gitResult.repositories) {
    console.log(chalk.dim(`   ${repo}`));
  }
  
  if (params.topology === 'multirepo') {
    console.log(chalk.blue('\n📄 Manifiestos fractal.project.yml generados (no commiteados, en .gitignore)'));
  }
  
  console.log(
    chalk.yellow(
      '\n⚠️  Punto de extensión: la generación de estructura del framework se implementará ' +
      'cuando el contrato del adapter esté disponible (SPEC-0006).'
    )
  );
  
  console.log(chalk.green('\n🎉 Proyecto inicializado exitosamente'));
  console.log(chalk.dim(`\nPróximos pasos:`));
  
  if (params.topology === 'multirepo') {
    console.log(chalk.dim(`  cd ${params.projectName}-api`));
    console.log(chalk.dim(`  # Trabajar en el repositorio API`));
    console.log(chalk.dim(`\n  cd ../${params.projectName}-web`));
    console.log(chalk.dim(`  # Trabajar en el repositorio Web`));
  } else {
    console.log(chalk.dim(`  cd ${params.projectName}`));
    console.log(chalk.dim(`  # El proyecto está listo para desarrollo`));
  }
}
