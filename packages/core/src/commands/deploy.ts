import { resolve } from 'node:path';
import chalk from 'chalk';
import type { DeployCommandOptions } from '../types/deploy-command.js';
import { promptDeployParams, confirmDeploy } from '../utils/deploy-prompts.js';
import { SshClient, ServerValidator } from '@fractal/deploy';

/**
 * Comando `fractal deploy`.
 * 
 * Recolecta datos del servidor, valida conectividad SSH,
 * distribución compatible y recursos mínimos.
 * 
 * Cumple SPEC-0003 AC-1 y AC-2.
 */
export async function deployCommand(
  options: DeployCommandOptions
): Promise<void> {
  console.log(chalk.blue('🚀 Fractal Deploy — Provisioning de VPS production-ready\n'));
  
  const projectDir = resolve(process.cwd());
  
  // AC-1: Recolección de datos
  const params = await promptDeployParams();
  
  // Confirmación antes de proceder
  const confirmed = await confirmDeploy(params);
  
  if (!confirmed) {
    console.log(chalk.yellow('\n⚠️  Deploy cancelado por el usuario'));
    process.exit(0);
  }
  
  console.log(chalk.blue('\n🔍 Validando servidor...\n'));
  
  // AC-2: Validación previa — conectividad SSH
  const sshClient = new SshClient({
    host: params.serverIp,
    username: params.sshUser,
    password: params.authMethod === 'password' ? params.sshPassword : undefined,
    privateKeyPath: params.authMethod === 'key' ? params.sshKeyPath : undefined,
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
  
  // Punto de extensión: aquí continuaría el provisioning real
  console.log(
    chalk.yellow(
      '\n⚠️  Punto de extensión: el provisioning completo (AC-3 a AC-11) se ' +
      'implementará en tickets posteriores.'
    )
  );
  
  console.log(chalk.green('\n✅ Validación del servidor completada exitosamente'));
  console.log(chalk.dim('\nEl servidor cumple todos los requisitos para provisioning.'));
}
