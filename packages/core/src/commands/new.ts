import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { NewCommandOptions, ValidatedNewParams } from '../types/new-command.js';
import { isValidTopology, DEFAULT_TOPOLOGY } from '../types/topology.js';
import { validateTargetDirectory } from '../utils/directory-validator.js';
import { promptTopology } from '../utils/prompts.js';
import { initializeGit } from '../utils/git-initializer.js';
import { resolveSingleAdapter } from '../adapter-resolver.js';
import { invokeAdapter } from '../adapter-bridge.js';
import { checkRuntimeRequirements } from '../bridge/binary-check.js';
import type { AdapterContract, CreateProjectPayload } from '../types/adapter-contract.js';

/**
 * Comando `fractal new`.
 * 
 * Flujo completo:
 * 1. Valida parámetros y directorio destino
 * 2. Pregunta topología si no está especificada
 * 3. Resuelve el adapter disponible
 * 4. Verifica requisitos de runtime (versiones mínimas de binarios)
 * 5. Invoca al adapter para generar la estructura del proyecto
 * 6. Inicializa git según la topología
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
    projectName: basename(targetDir),
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
 * Flujo (SPEC-0006 AC-1):
 * 1. Resolver adapter
 * 2. Obtener contrato del adapter
 * 3. Verificar requisitos de runtime (versiones mínimas de binarios)
 * 4. Invocar generación de proyecto vía adapter
 * 5. Inicializar git según topología
 */
async function generateProject(params: ValidatedNewParams): Promise<void> {
  console.log(chalk.blue('\n📦 Inicializando proyecto...'));
  
  // 1. Resolver adapter
  const cliPath = dirname(fileURLToPath(import.meta.url));
  let adapter;
  
  try {
    adapter = resolveSingleAdapter(cliPath);
    console.log(chalk.dim(`   Adapter: ${adapter.target}`));
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Error al resolver adapter: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
  
  // 2. Obtener contrato del adapter
  console.log(chalk.blue('\n🔍 Verificando requisitos...'));
  
  const contractResult = await invokeAdapter(
    adapter.command,
    { action: 'get-contract' }
  );
  
  if (!contractResult.success) {
    console.error(
      chalk.red(
        `\n❌ Error al obtener contrato del adapter: ${contractResult.error.message}`
      )
    );
    if (contractResult.error.step) {
      console.error(chalk.dim(`   Paso: ${contractResult.error.step}`));
    }
    process.exit(1);
  }
  
  const contract = contractResult.data as AdapterContract;
  
  // 3. Verificar requisitos de runtime
  const requirementsCheck = checkRuntimeRequirements(contract.runtimeRequirements);
  
  if (!requirementsCheck.allSatisfied) {
    console.error(chalk.red('\n❌ Requisitos de runtime no satisfechos:\n'));
    
    for (const result of requirementsCheck.results) {
      if (!result.satisfied) {
        const displayName = result.displayName || result.binaryName;
        const installed = result.installedVersion 
          ? `versión ${result.installedVersion} instalada`
          : 'no encontrado';
        
        console.error(
          chalk.red(
            `   • ${displayName}: ${installed}, se requiere ${result.requiredVersion} o superior`
          )
        );
      }
    }
    
    process.exit(1);
  }
  
  // 4. Invocar generación de proyecto
  console.log(chalk.blue('\n🏗️  Generando estructura del proyecto...'));
  
  const destinationPath = dirname(params.targetDir);
  
  const createProjectPayload: CreateProjectPayload = {
    name: params.projectName,
    topology: params.topology,
    destinationPath,
    target: adapter.target,
    contractVersion: '0',
  };
  
  const createResult = await invokeAdapter(
    adapter.command,
    { action: 'create-project', ...createProjectPayload }
  );
  
  if (!createResult.success) {
    console.error(
      chalk.red(
        `\n❌ Error en ${createResult.error.step || 'generación'}: ${createResult.error.message}`
      )
    );
    process.exit(1);
  }
  
  console.log(chalk.green('   ✓ Estructura generada'));
  
  // 5. Inicializar git según topología
  console.log(chalk.blue('\n📂 Inicializando repositorio(s) git...'));
  
  const gitResult = initializeGit(params.projectName, params.targetDir, params.topology);
  
  if (!gitResult.success) {
    console.error(chalk.red(`\n❌ Error al inicializar git: ${gitResult.error}`));
    process.exit(1);
  }
  
  console.log(chalk.green('   ✓ Repositorio(s) inicializado(s)'));
  for (const repo of gitResult.repositories) {
    console.log(chalk.dim(`     ${repo}`));
  }
  
  if (params.topology === 'multirepo') {
    console.log(chalk.dim('\n   📄 Manifiestos fractal.project.yml generados (excluidos de git)'));
  }
  
  // Reportar éxito
  console.log(chalk.green('\n🎉 Proyecto creado exitosamente'));
  console.log(chalk.dim('\nPróximos pasos:'));
  
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
