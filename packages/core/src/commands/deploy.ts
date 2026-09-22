import { resolve, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import chalk from 'chalk';
import type { DeployCommandOptions } from '../types/deploy-command.js';
import { promptDeployParams, confirmDeploy, confirmUnknownHost } from '../utils/deploy-prompts.js';
import { 
  SshClient, 
  ServerValidator, 
  ManifestManager, 
  CrossVarWriter,
  SystemHardening,
  RuntimeManager,
  DnsManager,
  StateManager,
  SslManager,
  adaptSshClient,
  CicdManager,
  type TargetType,
  type CicdProvider,
} from '@fractal/deploy';

/**
 * Deriva la clave pública SSH desde una clave privada usando ssh-keygen.
 * Implementa decisión de producto #1.
 */
async function deriveSshPublicKey(privateKeyPath: string): Promise<string | null> {
  try {
    const expandedPath = privateKeyPath.replace('~', homedir());
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    
    const { stdout, stderr } = await execFileAsync('ssh-keygen', ['-y', '-f', expandedPath]);
    
    if (stderr && !stdout) {
      return null;
    }
    
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Determina el nombre del proyecto desde package.json o el nombre del directorio.
 * Implementa decisión de producto #2.
 */
async function determineProjectName(projectDir: string): Promise<string> {
  try {
    const packageJsonPath = resolve(projectDir, 'package.json');
    const content = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    if (packageJson.name) {
      // Eliminar el scope si existe (@scope/name -> name)
      return packageJson.name.replace(/^@[^/]+\//, '');
    }
  } catch {
    // Si no hay package.json o no tiene nombre, usar el basename del directorio
  }
  
  return basename(projectDir);
}

/**
 * Determina el tipo de target según el rol del manifiesto.
 * Implementa decisión de producto #3.
 */
function determineTargetType(role?: 'api' | 'web'): TargetType {
  if (!role) {
    return 'backend-full';
  }
  
  if (role === 'web') {
    return 'frontend-static';
  }
  
  if (role === 'api') {
    return 'backend-full';
  }
  
  return 'backend-full';
}

/**
 * Infiere el proveedor de CI/CD desde la URL del repositorio git.
 * Implementa decisión de producto FRA-36 #1.
 */
async function inferCiProvider(gitRepository: string): Promise<CicdProvider | null> {
  const repoLower = gitRepository.toLowerCase();
  
  if (repoLower.includes('github.com')) {
    return 'github-actions';
  }
  
  if (repoLower.includes('gitlab.com')) {
    return 'gitlab-ci';
  }
  
  return null;
}

/**
 * Solicita al usuario que seleccione un proveedor de CI/CD.
 * Implementa decisión de producto FRA-36 #1 (fallback cuando no se puede inferir).
 */
async function promptCiProvider(): Promise<CicdProvider> {
  const { select } = await import('@inquirer/prompts');
  
  return select<CicdProvider>({
    message: 'Proveedor de CI/CD:',
    choices: [
      {
        value: 'github-actions',
        name: 'GitHub Actions',
        description: 'Workflows en .github/workflows/',
      },
      {
        value: 'gitlab-ci',
        name: 'GitLab CI',
        description: 'Pipeline en .gitlab-ci.yml',
      },
    ],
  });
}

/**
 * Escribe las variables cruzadas al disco en los archivos apropiados.
 * Implementa decisión de producto #8.
 */
async function writeCrossVarsToDisk(
  role: 'api' | 'web',
  vars: Record<string, string>,
  projectDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { writeFile, mkdir } = await import('node:fs/promises');
    
    // Validar keys y valores (prevenir inyección)
    for (const [key, value] of Object.entries(vars)) {
      // Validar el key
      if (key.includes('\n') || key.includes('\r') || key.includes('=')) {
        return {
          success: false,
          error: `La clave "${key}" contiene caracteres no permitidos (nueva línea o =), lo cual no está permitido en archivos .env`,
        };
      }
      
      // Validar formato de key (debe ser un identificador válido)
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
        return {
          success: false,
          error: `La clave "${key}" no es un nombre de variable válido. Debe comenzar con letra o guión bajo y contener solo letras, números y guiones bajos`,
        };
      }
      
      // Validar el valor
      if (value.includes('\n') || value.includes('\r')) {
        return {
          success: false,
          error: `El valor de ${key} contiene caracteres de nueva línea, lo cual no está permitido en archivos .env`,
        };
      }
    }
    
    const envPath = role === 'web' ? resolve(projectDir, '.env.production') : resolve(projectDir, '.env');
    
    // Leer el archivo existente si existe
    let existingContent = '';
    try {
      existingContent = await readFile(envPath, 'utf-8');
    } catch {
      // Si no existe, está bien
    }
    
    // Agregar o actualizar las variables
    const lines = existingContent.split('\n');
    const varsToWrite = { ...vars };
    
    // Actualizar variables existentes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      for (const key of Object.keys(varsToWrite)) {
        if (line.startsWith(`${key}=`)) {
          lines[i] = `${key}=${varsToWrite[key]}`;
          delete varsToWrite[key];
        }
      }
    }
    
    // Agregar variables nuevas al final
    for (const [key, value] of Object.entries(varsToWrite)) {
      lines.push(`${key}=${value}`);
    }
    
    await writeFile(envPath, lines.join('\n'), 'utf-8');
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

/**
 * Comando `fractal deploy`.
 * 
 * Recolecta datos del servidor, valida conectividad SSH,
 * distribución compatible y recursos mínimos.
 * Ejecuta hardening, runtime setup y DNS.
 * 
 * Cumple SPEC-0003 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 y AC-13 (coordinación multirepo).
 */
export async function deployCommand(
  options: DeployCommandOptions
): Promise<void> {
  console.log(chalk.blue('🚀 Fractal Deploy — Provisioning de VPS production-ready\n'));
  
  const projectDir = resolve(process.cwd());
  
  // AC-13: Verificar si hay manifiesto de multirepo
  const manifestManager = new ManifestManager(projectDir);
  const manifestResult = manifestManager.read();
  
  let askSiblingInfo = false;
  let currentRole: 'api' | 'web' | undefined;
  
  if (manifestResult.exists && manifestResult.manifest) {
    currentRole = manifestResult.manifest.role;
    
    // Preguntar info del hermano si:
    // - El estado es pending (primer deploy), O
    // - El flag --reconfigure está presente
    if (manifestResult.manifest.orchestration_state === 'pending') {
      askSiblingInfo = true;
      console.log(chalk.yellow('📝 Primer deploy en multirepo detectado'));
      console.log(chalk.dim('   Se solicitará información del repositorio hermano para configurar variables cruzadas.\n'));
    } else if (options.reconfigure) {
      askSiblingInfo = true;
      console.log(chalk.yellow('🔄 Modo reconfiguración activado'));
      console.log(chalk.dim('   Se solicitará nuevamente la información del repositorio hermano.\n'));
    }
  }
  
  // AC-1: Recolección de datos
  const params = await promptDeployParams(askSiblingInfo, currentRole);
  
  // Confirmación antes de proceder
  const confirmed = await confirmDeploy(params);
  
  if (!confirmed) {
    console.log(chalk.yellow('\n⚠️  Deploy cancelado por el usuario'));
    process.exit(0);
  }
  
  // Decisión de producto #4: Abortar si Route53 (antes de hacer cualquier trabajo)
  if (params.dnsProvider === 'route53') {
    console.error(chalk.red('\n❌ Error: Route53 no está soportado en esta versión'));
    console.log(chalk.yellow('\nProveedores DNS soportados:'));
    console.log(chalk.dim('  • Cloudflare (automatizado)'));
    console.log(chalk.dim('  • Manual (configuración manual)'));
    console.log(chalk.yellow('\nPor favor, ejecuta nuevamente el comando y selecciona un proveedor soportado.'));
    process.exit(1);
  }
  
  // AC-13: Actualizar manifiesto si se recolectó info del hermano
  let crossVarResult: Awaited<ReturnType<CrossVarWriter['write']>> | undefined;
  
  if (manifestResult.exists && manifestResult.manifest && params.siblingInfo) {
    console.log(chalk.dim('\n→ Actualizando manifiesto de coordinación multirepo...'));
    
    const updateResult = manifestManager.updateWithSiblingInfo({
      gitUrl: params.siblingInfo.gitUrl,
      domain: params.siblingInfo.domain,
    });
    
    if (!updateResult.success) {
      console.error(chalk.red(`\n❌ Error al actualizar el manifiesto: ${updateResult.error}`));
      process.exit(1);
    }
    
    console.log(chalk.green('✓ Manifiesto actualizado con información del hermano'));
    console.log(chalk.dim(`   Estado: resolved (deploys posteriores no volverán a preguntar)`));
    
    // Escribir variables cruzadas (ADR-0012 y AC-13)
    console.log(chalk.dim('\n→ Configurando variables cruzadas para comunicación entre repos...'));
    
    const crossVarWriter = new CrossVarWriter();
    crossVarResult = crossVarWriter.write({
      role: manifestResult.manifest.role,
      currentDomain: params.domain,
      siblingDomain: params.siblingInfo.domain,
    });
    
    if (!crossVarResult.success) {
      console.error(chalk.red(`\n❌ Error al configurar variables cruzadas: ${crossVarResult.error}`));
      process.exit(1);
    }
    
    console.log(chalk.green('✓ Variables cruzadas configuradas'));
    
    if (crossVarResult.writtenVars) {
      console.log(chalk.blue('\n📝 Variables configuradas para este repositorio:'));
      for (const [key, value] of Object.entries(crossVarResult.writtenVars)) {
        console.log(chalk.dim(`   ${key}=${value}`));
      }
    }
    
    // Mostrar instrucciones para el repo hermano (AC-8 extensión)
    if (crossVarResult.siblingInstructions) {
      console.log(chalk.yellow(crossVarResult.siblingInstructions.message));
    }
  }
  
  console.log(chalk.blue('\n🔍 Validando servidor...\n'));
  
  // AC-2: Validación previa — conectividad SSH (con verificación de host)
  const sshClient = new SshClient({
    host: params.serverIp,
    username: params.sshUser,
    password: params.authMethod === 'password' ? params.sshPassword : undefined,
    privateKeyPath: params.authMethod === 'key' ? params.sshKeyPath : undefined,
    // El handshake espera la confirmación TOFU interactiva si el host es nuevo.
    timeout: 120_000,
    onUnknownHost: (info) => confirmUnknownHost(info),
  });
  
  console.log(chalk.dim('→ Probando conectividad SSH...'));
  const connectionResult = await sshClient.testConnection();
  
  if (!connectionResult.success) {
    console.error(
      chalk.red(`\n❌ Error de conectividad SSH:\n   ${connectionResult.error}`)
    );
    console.log(chalk.yellow('\nVerifica que:'));
    console.log(chalk.dim('  • La dirección IP sea correcta'));
    console.log(chalk.dim('  • El servidor esté encendido y accesible'));
    console.log(chalk.dim('  • Las credenciales SSH sean válidas'));
    console.log(chalk.dim('  • El firewall permita conexiones SSH (puerto 22)'));
    console.log(chalk.dim('  • La clave del host coincida con known_hosts (o sea un VPS nuevo)'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Conectividad SSH verificada'));
  
  // AC-2: Validación previa — distribución y recursos
  const validator = new ServerValidator(sshClient);
  
  console.log(chalk.dim('→ Detectando información del servidor...'));
  const validationResult = await validator.validate();
  
  if (!validationResult.valid) {
    console.error(chalk.red('\n❌ El servidor no cumple con los requisitos mínimos:\n'));
    
    for (const error of validationResult.errors) {
      console.error(chalk.red(`   • ${error}`));
    }
    
    if (validationResult.serverInfo) {
      const info = validationResult.serverInfo;
      console.log(chalk.yellow('\n📊 Información detectada del servidor:'));
      console.log(chalk.dim(`   Sistema: ${info.os} ${info.osVersion}`));
      console.log(chalk.dim(`   CPUs: ${info.cpuCount}`));
      console.log(chalk.dim(`   RAM: ${info.ramGb.toFixed(1)} GB`));
      console.log(chalk.dim(`   Disco disponible: ${info.diskAvailableGb.toFixed(1)} GB / ${info.diskTotalGb.toFixed(1)} GB`));
    }
    
    console.log(chalk.yellow('\nRequisitos mínimos (SPEC-0003):'));
    console.log(chalk.dim('  • Ubuntu 22.04 LTS o 24.04 LTS'));
    console.log(chalk.dim('  • 1 vCPU'));
    console.log(chalk.dim('  • 2 GB RAM'));
    console.log(chalk.dim('  • 20 GB disco disponible'));
    
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Distribución compatible'));
  console.log(chalk.green('✓ Recursos suficientes'));
  
  // Mostrar información del servidor
  if (validationResult.serverInfo) {
    const info = validationResult.serverInfo;
    console.log(chalk.blue('\n📊 Información del servidor:'));
    console.log(chalk.dim(`   Sistema: ${info.os} ${info.osVersion}`));
    console.log(chalk.dim(`   CPUs: ${info.cpuCount}`));
    console.log(chalk.dim(`   RAM: ${info.ramGb.toFixed(1)} GB`));
    console.log(chalk.dim(`   Disco: ${info.diskAvailableGb.toFixed(1)} GB disponibles de ${info.diskTotalGb.toFixed(1)} GB`));
  }
  
  // Mostrar advertencias no bloqueantes
  if (validationResult.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Advertencias:'));
    for (const warning of validationResult.warnings) {
      console.log(chalk.yellow(`   • ${warning}`));
    }
  }
  
  // AC-14: Validación de puertos (servicios preexistentes)
  console.log(chalk.dim('\n→ Verificando puertos requeridos (80, 443)...'));
  const portsResult = await validator.validatePorts();
  
  if (!portsResult.available) {
    console.error(chalk.red('\n❌ Error: El servidor tiene servicios preexistentes en puertos requeridos:\n'));
    
    for (const port of portsResult.occupiedPorts) {
      console.error(chalk.red(`   • Puerto ${port} ocupado`));
    }
    
    console.log(chalk.yellow('\nEl servidor debe tener los puertos 80 y 443 disponibles.'));
    console.log(chalk.yellow('Fractal requiere control completo del servidor para provisioning seguro.'));
    console.log(chalk.dim('\nSi deseas usar este VPS, detén los servicios que ocupan estos puertos.'));
    
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Puertos 80 y 443 disponibles'));
  
  // AC-3: Hardening del sistema
  console.log(chalk.blue('\n🔐 Endureciendo el sistema...\n'));
  
  // Decisión de producto #1: Derivar clave pública o solicitarla
  let sshPublicKey: string | null = null;
  let deployPrivateKeyPath: string | undefined;
  
  if (params.authMethod === 'key' && params.sshKeyPath) {
    console.log(chalk.dim('→ Derivando clave pública SSH...'));
    sshPublicKey = await deriveSshPublicKey(params.sshKeyPath);
    
    if (!sshPublicKey) {
      console.error(chalk.red('\n❌ Error: No se pudo derivar la clave pública desde la clave privada'));
      console.log(chalk.yellow('\nVerifica que:'));
      console.log(chalk.dim('  • La ruta a la clave privada sea correcta'));
      console.log(chalk.dim('  • La clave privada tenga el formato correcto'));
      process.exit(1);
    }
    
    // Usar la misma clave privada para reconectar como deploy
    deployPrivateKeyPath = params.sshKeyPath;
  } else if (params.authMethod === 'password') {
    // Solicitar clave pública y clave privada para el usuario deploy
    const { input } = await import('@inquirer/prompts');
    console.log(chalk.yellow('\n⚠️  Autenticación por contraseña detectada'));
    console.log(chalk.dim('   Después del hardening, la autenticación por contraseña se deshabilitará.'));
    console.log(chalk.dim('   Se necesita un par de claves SSH para el usuario deploy.\n'));
    
    sshPublicKey = await input({
      message: 'Clave pública SSH para el usuario deploy:',
      validate: (value) => {
        if (!value.trim()) return 'La clave pública es requerida';
        if (!value.startsWith('ssh-')) return 'La clave debe comenzar con ssh-rsa, ssh-ed25519, etc.';
        if (value.includes('\n') || value.includes('\r')) return 'La clave pública no puede contener saltos de línea';
        // Verificar que sea una sola línea (las claves SSH válidas son de una sola línea)
        if (value.trim().split(/\r?\n/).length > 1) return 'La clave pública debe ser una sola línea';
        return true;
      },
    });
    
    deployPrivateKeyPath = await input({
      message: 'Ruta a la clave privada SSH correspondiente (para reconectar como deploy):',
      default: '~/.ssh/id_rsa',
      validate: (value) => {
        if (!value.trim()) return 'La ruta a la clave privada es requerida';
        return true;
      },
    });
  }
  
  if (!sshPublicKey) {
    console.error(chalk.red('\n❌ Error: No se pudo obtener la clave pública SSH'));
    process.exit(1);
  }
  
  if (!deployPrivateKeyPath) {
    console.error(chalk.red('\n❌ Error: No se pudo obtener la ruta a la clave privada para reconexión'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Clave pública SSH obtenida'));
  
  const hardening = new SystemHardening(sshClient);
  
  const hardeningResult = await hardening.harden({
    deployUser: 'deploy',
    sshPublicKey,
    allowedPorts: [22, 80, 443],
  });
  
  if (!hardeningResult.success) {
    console.error(chalk.red(`\n❌ Error en hardening del sistema:\n   ${hardeningResult.error}`));
    console.log(chalk.yellow('\nPasos completados antes del error:'));
    for (const step of hardeningResult.steps) {
      console.log(chalk.dim(`   • ${step}`));
    }
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Hardening completado'));
  for (const step of hardeningResult.steps) {
    console.log(chalk.dim(`   • ${step}`));
  }
  
  // Decisión de producto #5: Reconectar como usuario deploy
  console.log(chalk.blue('\n🔄 Reconectando como usuario deploy...\n'));
  
  const deployClient = new SshClient({
    host: params.serverIp,
    username: 'deploy',
    privateKeyPath: deployPrivateKeyPath,
    timeout: 120_000,
    onUnknownHost: (info) => confirmUnknownHost(info),
  });
  
  const deployConnectionResult = await deployClient.testConnection();
  
  if (!deployConnectionResult.success) {
    console.error(chalk.red(`\n❌ Error al reconectar como usuario deploy:\n   ${deployConnectionResult.error}`));
    console.log(chalk.yellow('\nEl hardening fue completado, pero no se pudo establecer la conexión con el usuario deploy.'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Conectado como usuario deploy'));
  
  // AC-4: Runtime setup
  console.log(chalk.blue('\n🐳 Configurando runtime de Docker...\n'));
  
  // Decisión de producto #2: Determinar projectName
  const projectName = await determineProjectName(projectDir);
  console.log(chalk.dim(`   Nombre del proyecto: ${projectName}`));
  
  // Decisión de producto #3: Determinar targetType
  const targetType = determineTargetType(currentRole);
  console.log(chalk.dim(`   Tipo de target: ${targetType}`));
  
  const runtimeManager = new RuntimeManager(deployClient);
  
  const runtimeResult = await runtimeManager.setup({
    dockerInstall: {
      checkPrerequisites: true,
    },
    compose: {
      targetType,
      projectName,
      outputPath: '/home/deploy/docker-compose.yml',
    },
  });
  
  if (!runtimeResult.success) {
    console.error(chalk.red(`\n❌ Error en setup del runtime:\n   ${runtimeResult.error}`));
    
    if (runtimeResult.dockerInstall) {
      console.log(chalk.yellow('\nPasos de Docker completados antes del error:'));
      for (const step of runtimeResult.dockerInstall.steps) {
        console.log(chalk.dim(`   • ${step}`));
      }
    }
    
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Runtime configurado'));
  if (runtimeResult.dockerInstall) {
    for (const step of runtimeResult.dockerInstall.steps) {
      console.log(chalk.dim(`   • ${step}`));
    }
  }
  
  if (runtimeResult.composeGeneration) {
    console.log(chalk.dim(`   • docker-compose.yml generado en ${runtimeResult.composeGeneration.filePath}`));
    if (runtimeResult.composeGeneration.services) {
      console.log(chalk.dim(`   • Servicios: ${runtimeResult.composeGeneration.services.join(', ')}`));
    }
  }
  
  // Decisión de producto #6: Ejecutar docker compose up
  console.log(chalk.dim('\n→ Iniciando contenedores...'));
  
  const composeUpResult = await deployClient.executeCommand(
    'cd /home/deploy && docker compose up -d',
    { timeoutMs: 600_000 } // 10 minutos timeout
  );
  
  if (!composeUpResult.success) {
    console.error(chalk.red('\n❌ Error al iniciar contenedores con docker compose'));
    console.error(chalk.dim(`   ${composeUpResult.stderr || composeUpResult.error}`));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Contenedores iniciados'));
  
  // AC-5 y AC-6: DNS setup
  console.log(chalk.blue('\n🌐 Configurando DNS...\n'));
  
  // Decisión de producto #7: Wrap DNS con StateManager
  const dnsStateManager = new StateManager(deployClient);
  
  const dnsConfigHash = StateManager.generateConfigHash({
    provider: params.dnsProvider,
    domain: params.domain,
    serverIp: params.serverIp,
  });
  
  const shouldRunDns = await dnsStateManager.shouldRerunStep('dns', dnsConfigHash);
  
  let dnsResult;
  
  if (!shouldRunDns) {
    console.log(chalk.green('✓ DNS ya configurado (idempotencia)'));
    dnsResult = {
      success: true,
      records: [],
      propagated: true,
      steps: ['DNS ya configurado (idempotencia)'],
    };
  } else {
    await dnsStateManager.markStep('dns', 'pending', dnsConfigHash);
    
    if (params.dnsProvider === 'cloudflare') {
      console.log(chalk.dim('→ Configurando DNS en Cloudflare...'));
      
      dnsResult = await DnsManager.setup({
        provider: 'cloudflare',
        domain: params.domain,
        serverIp: params.serverIp,
        apiToken: params.dnsApiToken!,
      });
    } else {
      // manual
      console.log(chalk.yellow('→ Configuración DNS manual requerida\n'));
      console.log(chalk.dim('Crea los siguientes registros DNS en tu proveedor:\n'));
      console.log(chalk.white(`   Tipo: A`));
      console.log(chalk.white(`   Nombre: @`));
      console.log(chalk.white(`   Valor: ${params.serverIp}`));
      console.log(chalk.white(`   TTL: 300\n`));
      console.log(chalk.white(`   Tipo: A`));
      console.log(chalk.white(`   Nombre: www`));
      console.log(chalk.white(`   Valor: ${params.serverIp}`));
      console.log(chalk.white(`   TTL: 300\n`));
      
      dnsResult = await DnsManager.setup({
        provider: 'manual',
        domain: params.domain,
        serverIp: params.serverIp,
      });
    }
    
    if (!dnsResult.success) {
      await dnsStateManager.markStep('dns', 'failed', dnsConfigHash, dnsResult.error);
      console.error(chalk.red(`\n❌ Error en configuración DNS:\n   ${dnsResult.error}`));
      
      if (dnsResult.steps.length > 0) {
        console.log(chalk.yellow('\nPasos completados antes del error:'));
        for (const step of dnsResult.steps) {
          console.log(chalk.dim(`   • ${step}`));
        }
      }
      
      if (dnsResult.canContinueLater) {
        console.log(chalk.yellow('\n⚠️  Puedes continuar el proceso más tarde ejecutando el comando nuevamente.'));
      }
      
      process.exit(1);
    }
    
    await dnsStateManager.markStep('dns', 'completed', dnsConfigHash);
  }
  
  console.log(chalk.green('✓ DNS configurado'));
  for (const step of dnsResult.steps) {
    console.log(chalk.dim(`   • ${step}`));
  }
  
  if (dnsResult.propagated) {
    console.log(chalk.green('✓ Propagación DNS confirmada'));
  }
  
  // Decisión de producto #8: Escribir variables cruzadas al disco si aplica
  if (manifestResult.exists && manifestResult.manifest && params.siblingInfo && crossVarResult?.writtenVars) {
    console.log(chalk.dim('\n→ Escribiendo variables cruzadas al disco...'));
    
    const writeResult = await writeCrossVarsToDisk(
      manifestResult.manifest.role,
      crossVarResult.writtenVars,
      projectDir
    );
    
    if (!writeResult.success) {
      console.error(chalk.red(`\n❌ Error al escribir variables cruzadas al disco: ${writeResult.error}`));
      console.log(chalk.yellow('Las variables fueron configuradas en memoria pero no se pudieron persistir al disco.'));
    } else {
      console.log(chalk.green('✓ Variables cruzadas escritas al disco'));
      
      const envFile = manifestResult.manifest.role === 'web' ? '.env.production' : '.env';
      console.log(chalk.dim(`   Archivo: ${envFile}`));
    }
  }

  // AC-7: SSL con Let's Encrypt
  console.log(chalk.blue('\n🔒 Configurando SSL...\n'));
  
  // Decisión de producto #2: includeWww desde DNS result
  const includeWww = dnsResult.records.some(record => record.name === 'www');
  
  // Decisión de producto #3: postRenewalHook para Docker
  const postRenewalHook = `docker exec ${projectName}_nginx nginx -s reload`;
  
  const sslStateManager = new StateManager(deployClient);
  
  const sslConfigHash = StateManager.generateConfigHash({
    domain: params.domain,
    email: params.email,
    includeWww,
    postRenewalHook,
  });
  
  // Decisión de producto #4: Idempotencia + validación de certificado existente
  const shouldRunSsl = await sslStateManager.shouldRerunStep('ssl', sslConfigHash);
  
  let sslResult;
  
  if (!shouldRunSsl) {
    // Verificar si el certificado aún es válido
    const sslManager = new SslManager(adaptSshClient(deployClient));
    const certCheck = await sslManager.checkCertificate(params.domain);
    
    if (certCheck.exists && certCheck.daysRemaining && certCheck.daysRemaining > 30) {
      console.log(chalk.green('✓ SSL ya configurado (certificado válido)'));
      console.log(chalk.dim(`   Certificado expira en ${certCheck.daysRemaining} días`));
      sslResult = {
        success: true,
        certbotInstall: { success: true, steps: ['Certificado ya configurado'], version: 'n/a' },
      };
    } else {
      // El certificado expira pronto o no existe, re-emitir
      console.log(chalk.yellow('⚠️  Certificado expira pronto o no válido, renovando...'));
      await sslStateManager.markStep('ssl', 'pending', sslConfigHash);
      
      const sslManager = new SslManager(adaptSshClient(deployClient));
      sslResult = await sslManager.setup({
        domain: params.domain,
        email: params.email,
        environment: 'production',
        includeWww,
        postRenewalHook,
      });
    }
  } else {
    await sslStateManager.markStep('ssl', 'pending', sslConfigHash);
    
    console.log(chalk.dim('→ Instalando Certbot y emitiendo certificado...'));
    
    const sslManager = new SslManager(adaptSshClient(deployClient));
    sslResult = await sslManager.setup({
      domain: params.domain,
      email: params.email,
      environment: 'production',
      includeWww,
      postRenewalHook,
    });
  }
  
  if (!sslResult.success) {
    await sslStateManager.markStep('ssl', 'failed', sslConfigHash, sslResult.error);
    console.error(chalk.red(`\n❌ Error en configuración SSL:\n   ${sslResult.error}`));
    
    if (sslResult.certbotInstall?.steps.length) {
      console.log(chalk.yellow('\nPasos completados antes del error:'));
      for (const step of sslResult.certbotInstall.steps) {
        console.log(chalk.dim(`   • ${step}`));
      }
    }
    
    process.exit(1);
  }
  
  await sslStateManager.markStep('ssl', 'completed', sslConfigHash);
  
  console.log(chalk.green('✓ SSL configurado exitosamente'));
  if (sslResult.certbotInstall?.steps.length) {
    for (const step of sslResult.certbotInstall.steps) {
      console.log(chalk.dim(`   • ${step}`));
    }
  }
  if (sslResult.certificateIssuance?.domain) {
    console.log(chalk.green(`✓ Certificado emitido para ${sslResult.certificateIssuance.domain}`));
    if (!includeWww) {
      console.log(chalk.dim('   (sin subdominio www)'));
    }
  }
  if (sslResult.renewalSetup?.mechanism) {
    console.log(chalk.green(`✓ Renovación automática configurada (${sslResult.renewalSetup.mechanism})`));
    console.log(chalk.dim(`   Hook: ${postRenewalHook}`));
  }
  
  // FRA-36: Generar CI/CD workflow
  console.log(chalk.blue('\n🔄 Generando workflow de CI/CD...\n'));
  
  // Inferir proveedor de CI/CD desde la URL del repositorio
  let ciProvider = await inferCiProvider(params.gitRepository);
  
  if (!ciProvider) {
    console.log(chalk.yellow('→ No se pudo inferir el proveedor de CI/CD desde la URL del repositorio'));
    ciProvider = await promptCiProvider();
  } else {
    const providerName = ciProvider === 'github-actions' ? 'GitHub Actions' : 'GitLab CI';
    console.log(chalk.dim(`→ Proveedor detectado: ${providerName}`));
  }
  
  // Determinar outputPath según el proveedor
  const outputPath = ciProvider === 'github-actions'
    ? resolve(projectDir, '.github/workflows/deploy.yml')
    : resolve(projectDir, '.gitlab-ci.yml');
  
  // Construir configuración de deploy
  const cicdManager = new CicdManager();
  const deployConfig = {
    provider: ciProvider,
    targetType,
    projectName,
    productionBranch: params.productionBranch,
    domain: params.domain,
    outputPath,
    multiRepo: manifestResult.exists && manifestResult.manifest?.sibling ? {
      role: manifestResult.manifest.role,
      siblingGitUrl: manifestResult.manifest.sibling.git_url ?? undefined,
      siblingDomain: manifestResult.manifest.sibling.domain ?? undefined,
    } : undefined,
  };
  
  // Validar configuración
  const validation = cicdManager.validateConfig(deployConfig);
  
  if (!validation.valid) {
    console.error(chalk.red(`\n❌ Error en validación de configuración CI/CD: ${validation.error}`));
    console.log(chalk.yellow('El workflow no fue generado. Verifica la configuración e intenta nuevamente.'));
  } else {
    // Generar workflow
    console.log(chalk.dim('→ Generando workflow...'));
    const generationResult = await cicdManager.generate(deployConfig);
    
    if (!generationResult.success) {
      console.error(chalk.red(`\n❌ Error al generar workflow: ${generationResult.error}`));
    } else {
      console.log(chalk.green(`✓ Workflow generado: ${generationResult.filePath}`));
      
      // Imprimir secrets requeridos
      if (generationResult.secrets.length > 0) {
        console.log(chalk.blue('\n🔐 Secrets requeridos para este repositorio:'));
        for (const secret of generationResult.secrets) {
          console.log(chalk.white(`   ${secret.name}`));
          console.log(chalk.dim(`      ${secret.description}`));
        }
      }
      
      // Imprimir cross-repo secrets si aplica
      if (generationResult.crossRepoSecrets && generationResult.crossRepoSecrets.length > 0) {
        console.log(chalk.blue('\n🔗 Secrets que deben cargarse en el repositorio hermano:'));
        for (const secret of generationResult.crossRepoSecrets) {
          console.log(chalk.white(`   ${secret.name}`));
          console.log(chalk.dim(`      ${secret.description}`));
          if (secret.targetRepo) {
            console.log(chalk.dim(`      Repositorio: ${secret.targetRepo}`));
          }
        }
      }
    }
  }
  
  console.log(chalk.green('\n✅ Deploy completado exitosamente'));
  console.log(chalk.blue('\n📊 Resumen:'));
  console.log(chalk.dim('   • Sistema endurecido (usuario deploy, SSH hardening, firewall)'));
  console.log(chalk.dim('   • Runtime configurado (Docker + Compose)'));
  console.log(chalk.dim('   • Contenedores iniciados'));
  console.log(chalk.dim('   • DNS configurado'));
  console.log(chalk.dim('   • SSL/HTTPS configurado con renovación automática'));
  console.log(chalk.dim(`\n   Tu aplicación está disponible en: https://${params.domain}\n`));
}

// Exportar funciones helper para testing
export {
  deriveSshPublicKey,
  determineProjectName,
  determineTargetType,
  writeCrossVarsToDisk,
  inferCiProvider,
  promptCiProvider,
};
