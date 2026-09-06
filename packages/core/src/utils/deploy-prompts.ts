import { input, select, password, confirm } from '@inquirer/prompts';
import type { DeployParams, DnsProvider, SshAuthMethod } from '../types/deploy-command.js';

const DNS_PROVIDER_OPTIONS = [
  {
    value: 'cloudflare' as const,
    name: 'Cloudflare',
    description: 'Automatización vía API (requiere token)',
  },
  {
    value: 'route53' as const,
    name: 'AWS Route53',
    description: 'Automatización vía API (requiere credenciales AWS)',
  },
  {
    value: 'manual' as const,
    name: 'Configuración manual',
    description: 'Te mostraremos los registros DNS a crear',
  },
];

const SSH_AUTH_OPTIONS = [
  {
    value: 'key' as const,
    name: 'Clave SSH (recomendado)',
    description: 'Autenticación con archivo de clave privada',
  },
  {
    value: 'password' as const,
    name: 'Contraseña',
    description: 'Autenticación con contraseña (menos seguro)',
  },
];

/**
 * Recolecta todos los datos necesarios para el deploy vía prompts interactivos.
 */
export async function promptDeployParams(): Promise<DeployParams> {
  console.log('Configuración del servidor VPS\n');
  
  const serverIp = await input({
    message: 'Dirección IP del VPS:',
    validate: (value) => {
      if (!value.trim()) return 'La dirección IP es requerida';
      // Validación básica de formato IPv4
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(value.trim())) {
        return 'Formato de IP inválido (ej: 192.168.1.1)';
      }
      return true;
    },
  });

  const sshUser = await input({
    message: 'Usuario SSH:',
    default: 'root',
    validate: (value) => {
      if (!value.trim()) return 'El usuario SSH es requerido';
      return true;
    },
  });

  const authMethod = await select<SshAuthMethod>({
    message: 'Método de autenticación SSH:',
    choices: SSH_AUTH_OPTIONS,
    default: 'key',
  });

  let sshPassword: string | undefined;
  let sshKeyPath: string | undefined;

  if (authMethod === 'password') {
    sshPassword = await password({
      message: 'Contraseña SSH:',
      mask: '*',
      validate: (value) => {
        if (!value) return 'La contraseña es requerida';
        return true;
      },
    });
  } else {
    sshKeyPath = await input({
      message: 'Ruta a la clave privada SSH:',
      default: '~/.ssh/id_rsa',
      validate: (value) => {
        if (!value.trim()) return 'La ruta a la clave es requerida';
        return true;
      },
    });
  }

  console.log('\nConfiguración del dominio y DNS\n');

  const domain = await input({
    message: 'Dominio de la aplicación:',
    validate: (value) => {
      if (!value.trim()) return 'El dominio es requerido';
      // Validación básica de formato de dominio
      const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
      if (!domainRegex.test(value.trim())) {
        return 'Formato de dominio inválido (ej: example.com)';
      }
      return true;
    },
  });

  const dnsProvider = await select<DnsProvider>({
    message: 'Proveedor DNS:',
    choices: DNS_PROVIDER_OPTIONS,
    default: 'manual',
  });

  let dnsApiToken: string | undefined;

  if (dnsProvider === 'cloudflare') {
    dnsApiToken = await password({
      message: 'Cloudflare API Token:',
      mask: '*',
      validate: (value) => {
        if (!value) return 'El API token es requerido para Cloudflare';
        return true;
      },
    });
  } else if (dnsProvider === 'route53') {
    dnsApiToken = await password({
      message: 'AWS Access Key (formato: ACCESS_KEY:SECRET_KEY):',
      mask: '*',
      validate: (value) => {
        if (!value) return 'Las credenciales AWS son requeridas para Route53';
        if (!value.includes(':')) {
          return 'Formato esperado: ACCESS_KEY:SECRET_KEY';
        }
        return true;
      },
    });
  }

  console.log('\nConfiguración del repositorio Git\n');

  const gitRepository = await input({
    message: 'URL del repositorio Git:',
    validate: (value) => {
      if (!value.trim()) return 'La URL del repositorio es requerida';
      // Validación básica de URL git
      if (!value.includes('github.com') && !value.includes('gitlab.com') && !value.includes('.git')) {
        return 'La URL debe ser una URL de repositorio Git válida';
      }
      return true;
    },
  });

  const productionBranch = await input({
    message: 'Rama de producción:',
    default: 'main',
    validate: (value) => {
      if (!value.trim()) return 'La rama de producción es requerida';
      return true;
    },
  });

  return {
    serverIp: serverIp.trim(),
    sshUser: sshUser.trim(),
    authMethod,
    sshPassword,
    sshKeyPath: sshKeyPath?.trim(),
    domain: domain.trim().toLowerCase(),
    dnsProvider,
    dnsApiToken,
    gitRepository: gitRepository.trim(),
    productionBranch: productionBranch.trim(),
  };
}

/**
 * Prompt para confirmar que el usuario quiere proceder con el deploy.
 */
export async function confirmDeploy(params: DeployParams): Promise<boolean> {
  console.log('\n📋 Resumen de la configuración:');
  console.log(`   Servidor: ${params.sshUser}@${params.serverIp}`);
  console.log(`   Dominio: ${params.domain}`);
  console.log(`   DNS: ${params.dnsProvider}`);
  console.log(`   Repositorio: ${params.gitRepository}`);
  console.log(`   Rama: ${params.productionBranch}`);
  console.log();

  return await confirm({
    message: '¿Proceder con la validación del servidor?',
    default: true,
  });
}
