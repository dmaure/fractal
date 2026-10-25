/**
 * Validaciones compartidas entre `fractal new` y `fractal deploy`.
 *
 * Las mismas reglas (IPv4, dominio, email, URL git) se aplican en prompts
 * interactivos y en el modo no interactivo por flags/env. FRA-77 unifica la
 * recolección; no debe haber dos conjuntos de reglas divergentes.
 */

export const IPV4_REGEX =
  /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const DOMAIN_REGEX = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lee la primera variable de entorno no vacía de la lista.
 * Sirve para el mapping FRACTAL_NEW_* → FRACTAL_DEPLOY_* (FRA-77).
 */
export function readTrimmedEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Prefiere el valor de un flag (si vino) y cae a env.
 */
export function flagOrEnv(
  flagValue: string | undefined,
  ...envNames: string[]
): string | undefined {
  if (flagValue && flagValue.trim()) {
    return flagValue.trim();
  }
  return readTrimmedEnv(...envNames);
}

export function validateIpv4(value: string): true | string {
  if (!value.trim()) return 'La dirección IP es requerida';
  if (!IPV4_REGEX.test(value.trim())) {
    return 'Formato de IP inválido (ej: 192.168.1.1)';
  }
  return true;
}

export function validateDomain(value: string): true | string {
  if (!value.trim()) return 'El dominio es requerido';
  if (!DOMAIN_REGEX.test(value.trim())) {
    return 'Formato de dominio inválido (ej: example.com)';
  }
  return true;
}

export function validateEmail(value: string): true | string {
  if (!value.trim()) return 'El email es requerido para Let\'s Encrypt';
  if (!EMAIL_REGEX.test(value.trim())) {
    return 'Formato de email inválido (ej: admin@example.com)';
  }
  return true;
}

export function isGitUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.includes('github.com') ||
    trimmed.includes('gitlab.com') ||
    trimmed.includes('.git')
  );
}

export function validateGitUrl(value: string): true | string {
  if (!value.trim()) return 'La URL del repositorio es requerida';
  if (!isGitUrl(value)) {
    return 'La URL debe ser una URL de repositorio Git válida';
  }
  return true;
}

export function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'si';
}
