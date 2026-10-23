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
  SSH_AUTH_GAPS,
} from '../utils/new-wizard.js';
import {
  createGitHubRepository,
  githubHttpsUrl,
  GitHubApiError,
  pushRepositoryToGitHub,
  readPrivateKeyForSecret,
  scanKnownHosts,
  setGitHubActionsSecrets,
  type CreatedGitHubRepo,
} from '../utils/github-repo.js';

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

  let wizard: NewWizardParams | null = null;
  try {
    if (mode !== 'skip') {
      wizard = await collectNewWizardParams(projectName, options);
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
    console.log(`   Servidor: ${chalk.bold(`${wizard.sshUser}@${wizard.serverIp}`)}`);
    console.log(`   Dominio: ${chalk.bold(wizard.domain)}`);
    console.log(`   DNS: ${chalk.bold(wizard.dnsProvider)}`);
    console.log(`   GitHub: ${wizard.githubToken ? chalk.bold('crear repo remoto') : chalk.dim('omitido')}`);
  }

  const gitResult = await generateProject(params);

  let createdRepos: CreatedGitHubRepo[] = [];
  let knownHosts: string | undefined;
  const secretsSet: string[] = [];
  const secretsPrinted: string[] = [];

  if (wizard?.githubToken) {
    const githubOutcome = await provisionGitHub(params, wizard, gitResult.repositories);
    createdRepos = githubOutcome.repos;
    knownHosts = githubOutcome.knownHosts;
    secretsSet.push(...githubOutcome.secretsSet);
    secretsPrinted.push(...githubOutcome.secretsPrinted);

    if (createdRepos[0]) {
      wizard.gitRepository = createdRepos[0].cloneUrl;
    }
  } else if (wizard) {
    console.log(chalk.yellow('\n⚠️  Sin token de GitHub: no se creó el remoto.'));
    console.log(chalk.dim('   Conectá origin a mano antes del pipeline de CI/CD.'));
  }

  printHandoff(params, wizard, createdRepos, secretsSet, secretsPrinted, knownHosts);

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

async function provisionGitHub(
  params: ValidatedNewParams,
  wizard: NewWizardParams,
  localRepos: string[]
): Promise<{
  repos: CreatedGitHubRepo[];
  knownHosts?: string;
  secretsSet: string[];
  secretsPrinted: string[];
}> {
  const token = wizard.githubToken!;
  const secretsSet: string[] = [];
  const secretsPrinted: string[] = [];
  const repos: CreatedGitHubRepo[] = [];

  console.log(chalk.blue('\n🐙 Creando repositorio(s) en GitHub...'));

  const repoSpecs =
    params.topology === 'multirepo'
      ? [
          { name: `${wizard.githubRepo}-api`, dir: localRepos.find((r) => r.endsWith('-api')) },
          { name: `${wizard.githubRepo}-web`, dir: localRepos.find((r) => r.endsWith('-web')) },
        ]
      : [{ name: wizard.githubRepo, dir: localRepos[0] }];

  try {
    for (const spec of repoSpecs) {
      const created = await createGitHubRepository(token, {
        name: spec.name,
        owner: wizard.githubOwner,
        visibility: wizard.githubVisibility,
      });
      repos.push(created);
      console.log(chalk.green(`   ✓ ${created.owner}/${created.name}`));
      console.log(chalk.dim(`     ${created.htmlUrl}`));

      if (spec.dir) {
        try {
          pushRepositoryToGitHub(spec.dir, created.cloneUrl, token, wizard.productionBranch);
          console.log(chalk.green(`   ✓ Push inicial a ${wizard.productionBranch}`));
        } catch (error) {
          console.error(
            chalk.yellow(
              `   ⚠️  Repo creado pero el push falló: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          );
        }
      }
    }
  } catch (error) {
    const message =
      error instanceof GitHubApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(chalk.red(`\n❌ Error al crear el repo en GitHub: ${message}`));
    console.log(chalk.dim('   El proyecto local ya está generado; podés crear el remoto a mano.'));
    return { repos, secretsSet, secretsPrinted };
  }

  console.log(chalk.blue('\n🔐 Secrets del workflow:'));
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

  const secretValues = await buildSecretValues(wizard, knownHosts);

  for (const repo of repos) {
    const result = await setGitHubActionsSecrets(token, repo, secretValues);
    secretsSet.push(...result.set);
    for (const name of result.set) {
      console.log(chalk.green(`   ✓ ${name} seteado en ${repo.owner}/${repo.name}`));
    }
    for (const fail of result.failed) {
      console.log(chalk.yellow(`   ⚠️  ${fail.name} no se pudo setear: ${fail.error}`));
    }
  }

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

  return { repos, knownHosts, secretsSet, secretsPrinted };
}

async function buildSecretValues(
  wizard: NewWizardParams,
  knownHosts?: string
): Promise<Array<{ name: string; value: string }>> {
  const secrets: Array<{ name: string; value: string }> = [
    { name: 'SSH_HOST', value: wizard.serverIp },
    { name: 'SSH_USER', value: 'deploy' },
    { name: 'DOCKER_REGISTRY_USER', value: wizard.githubOwner || '' },
    { name: 'DOCKER_REGISTRY_TOKEN', value: wizard.githubToken || '' },
    { name: 'DB_PASSWORD', value: wizard.dbPassword },
  ];

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

  // DOCKER_REGISTRY_USER: si no se pasó owner, GitHub lo infiere al setear
  // vacío. Mejor dejar el login para setGitHubActionsSecrets callers.
  if (!wizard.githubOwner && wizard.githubToken) {
    try {
      const { getAuthenticatedUser } = await import('../utils/github-repo.js');
      const user = await getAuthenticatedUser(wizard.githubToken);
      const registry = secrets.find((s) => s.name === 'DOCKER_REGISTRY_USER');
      if (registry) {
        registry.value = user.login;
      }
    } catch {
      // se setea vacío y GitHub lo rechazará; el hand-off lo menciona
    }
  }

  return secrets.filter((secret) => secret.value);
}

function printHandoff(
  params: ValidatedNewParams,
  wizard: NewWizardParams | null,
  createdRepos: CreatedGitHubRepo[],
  secretsSet: string[],
  _secretsPrinted: string[],
  knownHosts?: string
): void {
  console.log(chalk.dim('\nPróximos pasos:'));

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

  if (wizard) {
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
        createdRepos[0]?.cloneUrl ?? githubHttpsUrl(wizard.githubOwner || 'OWNER', wizard.githubRepo)
      )) {
        console.log(chalk.dim(`    export ${line}`));
      }
      console.log(chalk.dim('    # DNS token, SSH password y GitHub token no se reimprimen.'));
    }
  }
}

function wizardToDeployParams(wizard: NewWizardParams): DeployParams {
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
    gitRepository: wizard.gitRepository || githubHttpsUrl(wizard.githubOwner || 'OWNER', wizard.githubRepo),
    productionBranch: wizard.productionBranch,
    dbPassword: wizard.dbPassword,
  };
}

async function chainToDeploy(
  params: ValidatedNewParams,
  wizard: NewWizardParams
): Promise<void> {
  if (params.topology === 'multirepo') {
    console.log(
      chalk.yellow(
        '\n⚠️  En multirepo hay que correr fractal deploy una vez en cada repo. No se encadena automáticamente.'
      )
    );
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
      prefilledParams: wizardToDeployParams(wizard),
      dbPassword: wizard.dbPassword,
    });
  } finally {
    process.chdir(previousCwd);
  }
}
