import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { DeployParams } from '../types/deploy-command.js';
import type { NewCommandOptions, NewWizardParams, ValidatedNewParams } from '../types/new-command.js';
import { isValidTopology, DEFAULT_TOPOLOGY } from '../types/topology.js';
import { validateTargetDirectory } from '../utils/directory-validator.js';
import { promptTopology } from '../utils/prompts.js';
import { initializeGit } from '../utils/git-initializer.js';
import { resolveSingleAdapter } from '../adapter-resolver.js';
import { invokeAdapter } from '../adapter-bridge.js';
import { checkRuntimeRequirements } from '../bridge/binary-check.js';
import type { AdapterContract, CreateProjectPayload } from '../types/adapter-contract.js';
import {
  collectNewWizardParams,
  formatDeployEnvExports,
  NonInteractiveConfigError,
  promptProjectName,
  resolveProjectName,
  resolveWizardMode,
  resolveWizardRemoteUrl,
  SSH_AUTH_GAPS,
} from '../utils/new-wizard.js';
import {
  readPrivateKeyForSecret,
  scanKnownHosts,
  setGitHubActionsSecrets,
  type CreatedGitHubRepo,
} from '../utils/github-repo.js';
import { GitHubArm } from '../wizard/arms/github-arm.js';
import type { WizardContext } from '../types/wizard-arm.js';

/**
 * Comando `fractal new`.
 *
 * Flujo:
 * 1. Valida parámetros y directorio destino
 * 2. Wizard de valores no-defaultables (TTY o --non-interactive). En no-TTY
 *    sin --non-interactive conserva la generación mínima (nombre + topología)
 *    para no romper CI/e2e.
 * 3. Resuelve el adapter, verifica runtime, genera, inicializa git
 * 4. Con token de GitHub: crea el remoto, pushea y setea secrets
 * 5. Hand-off a `fractal deploy`, o lo encadena si se pidió
 */
export async function newCommand(
  projectNameArg: string | undefined,
  options: NewCommandOptions
): Promise<void> {
  console.log(chalk.blue('🔷 Fractal — Generador de aplicaciones production-ready\n'));

  const mode = resolveWizardMode(options);

  let projectName: string | undefined;
  try {
    projectName = resolveProjectName(projectNameArg, options);
  } catch (error) {
    if (error instanceof NonInteractiveConfigError) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }

  if (mode === 'interactive' && !projectName) {
    projectName = await promptProjectName();
  }

  if (!projectName) {
    console.error(
      chalk.red(
        '\n❌ Error: El nombre del proyecto es requerido ' +
          '(argumento, --name o FRACTAL_NEW_PROJECT_NAME).'
      )
    );
    process.exit(1);
  }

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

  if (mode === 'skip') {
    if (!options.topology) {
      topology = await promptTopology();
    } else if (!isValidTopology(options.topology)) {
      console.error(
        chalk.red(
          `\n❌ Error: Topología inválida '${options.topology}'. ` +
            `Opciones válidas: monolith, monorepo, multirepo`
        )
      );
      process.exit(1);
    }
  }

  // Resolver el adapter antes del wizard para obtener framework options (FRA-84, AC-6)
  // Solo si vamos a ejecutar el wizard
  let frameworkOptions: Array<{ value: string; name: string; description: string }> = [];
  let defaultFramework: string | undefined;
  
  if (mode !== 'skip') {
    const cliPath = dirname(fileURLToPath(import.meta.url));
    let adapter;
    try {
      adapter = resolveSingleAdapter(cliPath);
      console.log(chalk.dim(`   Adapter: ${adapter.target}`));
      
      // Framework options del adapter (Art. II: el core no hardcodea frameworks)
      frameworkOptions = [
        {
          value: adapter.target,
          name: adapter.target.charAt(0).toUpperCase() + adapter.target.slice(1),
          description: `Framework ${adapter.target}`,
        },
      ];
      defaultFramework = adapter.target;
    } catch (error) {
      console.error(
        chalk.red(
          `\n❌ Error al resolver adapter: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  }

  let wizard: NewWizardParams | null = null;
  try {
    if (mode !== 'skip') {
      wizard = await collectNewWizardParams(projectName, options, frameworkOptions, defaultFramework);
      if (wizard) {
        projectName = wizard.projectName;
        topology = wizard.topology;
      }
    }
  } catch (error) {
    if (error instanceof NonInteractiveConfigError) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }

  if (wizard?.dnsProvider === 'route53') {
    console.error(chalk.red('\n❌ Error: Route53 no está soportado en esta versión'));
    console.log(chalk.yellow('\nProveedores DNS soportados:'));
    console.log(chalk.dim('  • Cloudflare (automatizado)'));
    console.log(chalk.dim('  • Manual (configuración manual)'));
    process.exit(1);
  }

  const params: ValidatedNewParams = {
    projectName: basename(resolve(process.cwd(), projectName)),
    targetDir: resolve(process.cwd(), projectName),
    topology,
    target: 'default',
  };

  console.log(chalk.green('\n✅ Parámetros validados:'));
  console.log(`   Proyecto: ${chalk.bold(params.projectName)}`);
  console.log(`   Directorio: ${chalk.dim(params.targetDir)}`);
  console.log(`   Topología: ${chalk.bold(params.topology)}`);
  if (wizard) {
    // FRA-85: solo mostrar datos de infra si el usuario los proveyó
    if (wizard.serverIp && wizard.domain) {
      console.log(`   Servidor: ${chalk.bold(`${wizard.sshUser}@${wizard.serverIp}`)}`);
      console.log(`   Dominio: ${chalk.bold(wizard.domain)}`);
      console.log(`   DNS: ${chalk.bold(wizard.dnsProvider)}`);
    } else {
      console.log(`   Deploy: ${chalk.dim('local-only (sin servidor)')}`);
    }
    console.log(`   GitHub: ${wizard.githubToken ? chalk.bold('crear repo remoto') : chalk.dim('omitido')}`);
  }

  const gitResult = await generateProject(params);

  let createdRepos: CreatedGitHubRepo[] = [];
  let knownHosts: string | undefined;
  const secretsSet: string[] = [];
  const secretsPrinted: string[] = [];
  let pushWarnings: Array<{ repo: string; error: string }> = [];

  // FRA-86: GitHub es brazo independiente, habilitado por su propio token
  if (wizard?.githubToken) {
    const githubOutcome = await provisionGitHub(params, wizard, gitResult.repositories);
    createdRepos = githubOutcome.repos;
    secretsSet.push(...githubOutcome.secretsSet);
    secretsPrinted.push(...githubOutcome.secretsPrinted);
    pushWarnings = githubOutcome.pushWarnings;

    if (createdRepos[0]) {
      wizard.gitRepository = createdRepos[0].cloneUrl;
    }
  } else if (wizard) {
    console.log(chalk.yellow('\n⚠️  Sin token de GitHub: no se creó el remoto.'));
    console.log(chalk.dim('   Conectá origin a mano antes del pipeline de CI/CD.'));
  }

  // FRA-86: secrets de infraestructura solo si hay servidor
  if (wizard?.serverIp) {
    const infraOutcome = await provisionInfrastructureSecrets(wizard, createdRepos);
    knownHosts = infraOutcome.knownHosts;
    secretsSet.push(...infraOutcome.secretsSet);
    secretsPrinted.push(...infraOutcome.secretsPrinted);
  }

  printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted, knownHosts, pushWarnings);

  if (wizard?.chainDeploy) {
    await chainToDeploy(params, wizard);
  }
}

async function generateProject(
  params: ValidatedNewParams
): Promise<{ repositories: string[] }> {
  console.log(chalk.blue('\n📦 Inicializando proyecto...'));

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

  console.log(chalk.green('\n🎉 Proyecto creado exitosamente'));

  return { repositories: gitResult.repositories };
}

/**
 * FRA-86: brazo GitHub independiente (crear repos + secrets de GitHub).
 * No toca infraestructura: solo DOCKER_REGISTRY_USER/TOKEN.
 */
async function provisionGitHub(
  params: ValidatedNewParams,
  wizard: NewWizardParams,
  localRepos: string[]
): Promise<{
  repos: CreatedGitHubRepo[];
  secretsSet: string[];
  secretsPrinted: string[];
  pushWarnings: Array<{ repo: string; error: string }>;
}> {
  const githubArm = new GitHubArm({ localRepositories: localRepos });

  const context: WizardContext = {
    topology: params.topology,
    github: {
      token: wizard.githubToken!,
      owner: wizard.githubOwner,
      repo: wizard.githubRepo,
      visibility: wizard.githubVisibility,
      productionBranch: wizard.productionBranch,
    },
  };

  console.log(chalk.blue('\n🐙 Creando repositorio(s) en GitHub...'));

  const result = await githubArm.execute(context);

  if (!result.success) {
    console.error(chalk.red(`\n❌ ${result.error}`));
    console.log(chalk.dim('   El proyecto local ya está generado; podés crear el remoto a mano.'));
    return { repos: [], secretsSet: [], secretsPrinted: [], pushWarnings: [] };
  }

  const githubOutcome = result.context.githubOutcome!;

  // Mostrar repos creados
  for (const repo of githubOutcome.repos) {
    console.log(chalk.green(`   ✓ ${repo.owner}/${repo.name}`));
    console.log(chalk.dim(`     ${repo.htmlUrl}`));
  }

  // Mostrar push exitoso o warnings
  if (githubOutcome.pushWarnings && githubOutcome.pushWarnings.length > 0) {
    for (const warning of githubOutcome.pushWarnings) {
      const { repo, error } = warning;
      console.error(chalk.yellow(`   ⚠️  Repo ${repo} creado pero el push falló: ${error}`));
      console.error(chalk.yellow(`   ⚠️  El remoto ${repo} quedó vacío (sin código).`));
      console.log(chalk.dim('      Recuperá el push con:'));
      const localRepo = localRepos.find((r) => r.includes(repo));
      if (localRepo) {
        console.log(chalk.dim(`        cd ${localRepo}`));
        console.log(chalk.dim(`        git push -u origin ${wizard.productionBranch}`));
      }
    }
  } else {
    console.log(chalk.green(`   ✓ Push inicial a ${wizard.productionBranch}`));
  }

  // Mostrar secrets de GitHub seteados
  if (githubOutcome.secretsSet && githubOutcome.secretsSet.length > 0) {
    console.log(chalk.blue('\n🔐 Secrets de GitHub seteados:'));
    for (const name of githubOutcome.secretsSet) {
      console.log(chalk.green(`   ✓ ${name}`));
    }
  }

  if (githubOutcome.secretsFailed && githubOutcome.secretsFailed.length > 0) {
    for (const fail of githubOutcome.secretsFailed) {
      console.log(chalk.yellow(`   ⚠️  ${fail.name} no se pudo setear: ${fail.error}`));
    }
  }

  return {
    repos: githubOutcome.repos,
    secretsSet: githubOutcome.secretsSet || [],
    secretsPrinted: githubOutcome.secretsSet || [],
    pushWarnings: githubOutcome.pushWarnings || [],
  };
}

/**
 * FRA-86: secrets de infraestructura (SSH, DB) solo si hay servidor.
 * Separado del brazo GitHub para que GitHub funcione sin infraestructura (AC-5).
 */
async function provisionInfrastructureSecrets(
  wizard: NewWizardParams,
  repos: CreatedGitHubRepo[]
): Promise<{
  knownHosts?: string;
  secretsSet: string[];
  secretsPrinted: string[];
}> {
  if (repos.length === 0) {
    return { secretsSet: [], secretsPrinted: [] };
  }

  console.log(chalk.blue('\n🔐 Secrets de infraestructura:'));
  console.log(chalk.dim('   SSH_USER del pipeline es `deploy` (usuario post-hardening), no el de provisioning.'));
  for (const gap of SSH_AUTH_GAPS) {
    console.log(chalk.dim(`   • ${gap}`));
  }

  const knownHosts = await scanKnownHosts(wizard.serverIp);
  if (!knownHosts) {
    console.log(
      chalk.yellow(
        `   ⚠️  No se pudo obtener SSH_KNOWN_HOSTS (ssh-keyscan ${wizard.serverIp}).`
      )
    );
    console.log(chalk.dim(`      Obtené el valor con: ssh-keyscan -t ed25519,rsa,ecdsa ${wizard.serverIp}`));
  }

  const secretValues = await buildInfrastructureSecretValues(wizard, knownHosts);
  const secretsSet: string[] = [];

  for (const repo of repos) {
    const result = await setGitHubActionsSecrets(wizard.githubToken!, repo, secretValues);
    secretsSet.push(...result.set);
    for (const name of result.set) {
      console.log(chalk.green(`   ✓ ${name} seteado en ${repo.owner}/${repo.name}`));
    }
    for (const fail of result.failed) {
      console.log(chalk.yellow(`   ⚠️  ${fail.name} no se pudo setear: ${fail.error}`));
    }
  }

  const secretsPrinted: string[] = [];
  for (const secret of secretValues) {
    if (secret.name === 'SSH_KNOWN_HOSTS' && knownHosts) {
      console.log(chalk.white(`   SSH_KNOWN_HOSTS`));
      console.log(chalk.dim(`      ${knownHosts.split('\n')[0]}`));
    }
    secretsPrinted.push(secret.name);
  }

  if (!knownHosts) {
    secretsPrinted.push('SSH_KNOWN_HOSTS');
  }

  return { knownHosts, secretsSet, secretsPrinted };
}

/**
 * FRA-86: construir secrets de infraestructura (SSH, DB).
 * NO incluye DOCKER_REGISTRY_* (esos son del brazo GitHub).
 */
async function buildInfrastructureSecretValues(
  wizard: NewWizardParams,
  knownHosts?: string
): Promise<Array<{ name: string; value: string }>> {
  const secrets: Array<{ name: string; value: string }> = [
    { name: 'SSH_HOST', value: wizard.serverIp },
    { name: 'SSH_USER', value: 'deploy' },
  ];

  // FRA-87: DB_PASSWORD solo si el brazo DB corrió (hay deploy); sin secret huérfano
  if (wizard.dbPassword) {
    secrets.push({ name: 'DB_PASSWORD', value: wizard.dbPassword });
  }

  if (wizard.sshKeyPath && wizard.authMethod === 'key') {
    const key = await readPrivateKeyForSecret(wizard.sshKeyPath);
    if (key.value) {
      secrets.push({ name: 'SSH_PRIVATE_KEY', value: key.value });
    } else if (key.warning) {
      console.log(chalk.yellow(`   ⚠️  ${key.warning}`));
    }
  } else {
    console.log(
      chalk.dim(
        '   SSH_PRIVATE_KEY no se setea con autenticación por contraseña: hace falta el par de claves del usuario deploy (se pide en fractal deploy).'
      )
    );
  }

  if (knownHosts) {
    secrets.push({ name: 'SSH_KNOWN_HOSTS', value: knownHosts });
  }

  return secrets.filter((secret) => secret.value);
}

export function printHandoff(
  params: ValidatedNewParams,
  wizard: NewWizardParams | null,
  createdRepos: CreatedGitHubRepo[],
  secretsSet: string[],
  _secretsPrinted: string[],
  knownHosts?: string,
  _pushWarnings?: Array<{ repo: string; error: string }>
): void {
  console.log(chalk.dim('\nPróximos pasos:'));

  // FRA-85: detectar camino local-only (sin datos de infraestructura)
  const hasInfrastructure = Boolean(wizard?.serverIp && wizard.domain);

  if (!hasInfrastructure) {
    // Camino local-only (FRA-85, AC-3, AC-11)
    // FRA-85: contemplar topología multirepo (bug fix ronda 1)
    if (params.topology === 'multirepo') {
      console.log(chalk.dim(`  cd ${params.projectName}-api`));
      console.log(chalk.dim('  # Configurar dependencias y correr el servidor de desarrollo'));
      console.log(chalk.dim('  # Ver README.md para instrucciones específicas del framework'));
      console.log();
      console.log(chalk.dim(`  cd ../${params.projectName}-web`));
      console.log(chalk.dim('  # Configurar dependencias y correr el servidor de desarrollo'));
      console.log(chalk.dim('  # Ver README.md para instrucciones específicas del framework'));
    } else {
      console.log(chalk.dim(`  cd ${params.projectName}`));
      console.log(chalk.dim('  # Configurar dependencias y correr el servidor de desarrollo'));
      console.log(chalk.dim('  # Ver README.md para instrucciones específicas del framework'));
    }
    console.log();
    console.log(chalk.yellow('💡 Para desplegar más adelante:'));
    console.log(chalk.dim('  fractal deploy'));
    return;
  }

  // Camino con infraestructura
  if (params.topology === 'multirepo') {
    console.log(chalk.dim(`  cd ${params.projectName}-api`));
    console.log(chalk.dim(`  fractal deploy`));
    console.log(chalk.dim(`\n  cd ../${params.projectName}-web`));
    console.log(chalk.dim(`  fractal deploy`));
  } else {
    console.log(chalk.dim(`  cd ${params.projectName}`));
    if (wizard?.chainDeploy) {
      console.log(chalk.dim('  # fractal deploy se ejecuta a continuación'));
    } else {
      console.log(chalk.dim('  fractal deploy'));
    }
  }

  if (createdRepos.length > 0) {
    console.log(chalk.dim('\n  Remotos:'));
    for (const repo of createdRepos) {
      console.log(chalk.dim(`    ${repo.htmlUrl}`));
    }
  }

  // FRA-85: información adicional solo cuando hay infraestructura
  if (wizard && hasInfrastructure) {
    console.log(chalk.dim('\n  El .env local NO se sube al VPS (FRA-76): DB_PASSWORD vive en /home/deploy/.env.'));
    if (wizard.dbPasswordGenerated) {
      console.log(chalk.dim('  Se generó una DB_PASSWORD; quedó como secret de GitHub (no se commitea).'));
    }
    if (!knownHosts) {
      console.log(
        chalk.dim(
          `  SSH_KNOWN_HOSTS: ssh-keyscan -t ed25519,rsa,ecdsa ${wizard.serverIp}`
        )
      );
    }
    if (secretsSet.length > 0) {
      console.log(chalk.dim(`  Secrets seteados: ${[...new Set(secretsSet)].join(', ')}`));
    }

    if (!wizard.chainDeploy) {
      console.log(chalk.dim('\n  Para reusar estos valores en fractal deploy --non-interactive:'));
      for (const line of formatDeployEnvExports(
        wizard,
        createdRepos[0]?.cloneUrl ?? resolveWizardRemoteUrl(wizard)
      )) {
        console.log(chalk.dim(`    export ${line}`));
      }
      console.log(chalk.dim('    # DNS token, SSH password y GitHub token no se reimprimen.'));
    }
  }
}

function wizardToDeployParams(wizard: NewWizardParams): DeployParams | undefined {
  const gitRepository = resolveWizardRemoteUrl(wizard);
  if (!gitRepository) {
    return undefined;
  }
  return {
    serverIp: wizard.serverIp,
    sshUser: wizard.sshUser,
    authMethod: wizard.authMethod,
    sshPassword: wizard.sshPassword,
    sshKeyPath: wizard.sshKeyPath,
    domain: wizard.domain,
    email: wizard.email,
    dnsProvider: wizard.dnsProvider,
    dnsApiToken: wizard.dnsApiToken,
    gitRepository,
    productionBranch: wizard.productionBranch,
    dbPassword: wizard.dbPassword,
  };
}

async function chainToDeploy(
  params: ValidatedNewParams,
  wizard: NewWizardParams
): Promise<void> {
  // FRA-85: no encadenar deploy si no hay datos de infraestructura
  if (!wizard.serverIp || !wizard.domain) {
    console.log(
      chalk.yellow(
        '\n⚠️  No se encadena fractal deploy: proyecto configurado como local-only.'
      )
    );
    console.log(chalk.dim('   Ejecutá fractal deploy cuando tengas un servidor disponible.'));
    return;
  }

  if (params.topology === 'multirepo') {
    console.log(
      chalk.yellow(
        '\n⚠️  En multirepo hay que correr fractal deploy una vez en cada repo. No se encadena automáticamente.'
      )
    );
    return;
  }

  const deployParams = wizardToDeployParams(wizard);
  if (!deployParams) {
    console.log(
      chalk.yellow(
        '\n⚠️  No se encadena fractal deploy: falta owner o URL del repositorio Git.'
      )
    );
    console.log(chalk.dim('   Pasá --github-owner o conectá origin a mano y corré fractal deploy.'));
    return;
  }

  const projectDir = params.targetDir;
  const previousCwd = process.cwd();
  process.chdir(projectDir);

  try {
    console.log(chalk.blue('\n🚀 Encadenando a fractal deploy...\n'));
    const { deployCommand } = await import('./deploy.js');
    await deployCommand({
      nonInteractive: true,
      prefilledParams: deployParams,
      dbPassword: wizard.dbPassword,
    });
  } finally {
    process.chdir(previousCwd);
  }
}
