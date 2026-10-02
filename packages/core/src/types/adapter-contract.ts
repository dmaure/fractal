/**
 * Contrato del adapter v0 — Tipos compartidos entre core y adapters.
 * 
 * Define la interfaz mínima que un adapter debe cumplir para que el core
 * pueda invocarlo vía el bridge (SPEC-0002) y generar un proyecto base.
 * 
 * Este contrato es agnóstico de framework (Artículo II, ADR-0002).
 * Todo conocimiento específico vive exclusivamente en packages/adapter-*.
 * 
 * @see docs/specs/0006-contrato-adapter-v0.md
 * @version 0
 */

import type { ProjectTopology } from './topology.js';

/**
 * Versión del contrato del adapter.
 * 
 * Se incluye como gancho para versionado futuro, aunque v0 no formaliza
 * todavía una estrategia de migración entre versiones.
 */
export type AdapterContractVersion = '0';

/**
 * Payload para el comando "crear proyecto base".
 * 
 * El core invoca al adapter con este payload para generar un proyecto
 * en la topología elegida.
 * 
 * @see SPEC-0006 AC-1
 */
export interface CreateProjectPayload {
  /**
   * Nombre del proyecto a generar.
   * Usado como nombre de directorio y en metadatos del proyecto.
   */
  name: string;

  /**
   * Topología del proyecto a generar.
   * 
   * @see docs/adr/0010-topologia-proyecto-generado-sin-inertia.md
   */
  topology: ProjectTopology;

  /**
   * Path absoluto donde generar el proyecto.
   * El directorio debe existir y estar vacío.
   */
  destinationPath: string;

  /**
   * Framework/adapter destino.
   * En v0, el único adapter disponible es el default.
   * Se incluye para extensibilidad futura cuando haya múltiples adapters.
   */
  target: string;

  /**
   * Versión del contrato que usa el core.
   * Permite al adapter validar compatibilidad si es necesario.
   */
  contractVersion?: AdapterContractVersion;
}

/**
 * Datos de respuesta exitosa del comando "crear proyecto base".
 * 
 * Estos datos se envuelven en el envelope del bridge como `{success: true, data: CreateProjectData}`.
 * 
 * @see SPEC-0002 — Bridge envelope format
 */
export interface CreateProjectData {
  /**
   * Path absoluto del proyecto generado.
   * Normalmente coincide con destinationPath del payload.
   */
  projectPath: string;

  /**
   * Mensaje opcional para mostrar al usuario.
   */
  message?: string;
}

/**
 * Respuesta completa del adapter para "crear proyecto base".
 * 
 * El adapter debe retornar este formato, que coincide con el envelope
 * esperado por el bridge (SPEC-0002):
 * - Éxito: `{success: true, data: CreateProjectData}`
 * - Error: `{success: false, error: {message: string, step?: string}}`
 * 
 * @see SPEC-0002 AC-2, AC-3 — Bridge envelope format
 */
export type CreateProjectResponse =
  | { success: true; data: CreateProjectData }
  | { success: false; error: { message: string; step?: string } };

/**
 * Declaración de un binario requerido con su versión mínima.
 * 
 * @see SPEC-0006 AC-2
 */
export interface BinaryRequirement {
  /**
   * Nombre del binario (e.g., "node", "npm").
   * Debe ser el nombre exacto del comando en el PATH.
   */
  name: string;

  /**
   * Versión mínima requerida en formato semver (e.g., "8.2.0", "2.5.0").
   */
  minVersion: string;

  /**
   * Nombre legible del binario para mensajes de error.
   * Si no se proporciona, se usa `name`.
   */
  displayName?: string;
}

/**
 * Declaración de versiones mínimas de runtime.
 * 
 * El adapter expone esta declaración para que el core pueda verificar
 * que las dependencias del sistema están instaladas antes de invocar
 * al adapter.
 * 
 * @see SPEC-0006 AC-2
 * @see SPEC-0002 AC-4 — detección genérica de dependencias
 */
export interface RuntimeRequirements {
  /**
   * Lista de binarios requeridos con sus versiones mínimas.
   */
  binaries: BinaryRequirement[];
}

/**
 * Nombre de un servicio en el runtime de deploy.
 * 
 * Ejemplos: app, nginx, db, cache, worker, scheduler.
 * Un proyecto puede declarar uno o más servicios según su arquitectura.
 * 
 * @see ADR-0013 — nginx-only para frontend estático
 */
export type ServiceName = string;

/**
 * Configuración de healthcheck agnóstica al runtime.
 * 
 * El adapter declara una ruta que el orquestador puede usar para verificar
 * que el servicio está saludable. La implementación detrás de la ruta
 * depende del runtime:
 * - Backend completo: endpoint real de la aplicación (e.g., /api/health)
 * - Nginx-only: ruta estática servida por nginx (e.g., /health.txt)
 * 
 * @see SPEC-0006 §8 P2 — campo único agnóstico al runtime
 */
export interface HealthCheck {
  /**
   * Ruta HTTP para verificar el estado del servicio (e.g., "/api/health").
   * 
   * Debe comenzar con "/" — esto se valida en runtime por el orquestador,
   * no en tiempo de compilación.
   */
  path: string;
}

/**
 * Declaración de runtime de deploy para un proyecto.
 * 
 * El adapter expone esta declaración para que packages/deploy pueda
 * generar la configuración de contenedores, comandos y healthchecks
 * sin conocer el framework subyacente.
 * 
 * @see SPEC-0006 AC-3
 * @see ADR-0002 — core agnóstico de framework
 */
export interface DeployRuntime {
  /**
   * Lista de servicios que componen el runtime.
   * 
   * Ejemplos:
   * - Backend completo: ["app", "nginx", "db", "cache", "worker", "scheduler"]
   * - Frontend estático: ["nginx"]
   */
  services: ServiceName[];

  /**
   * Comando para construir la aplicación antes del deploy.
   * Opcional si no se requiere build.
   */
  buildCommand?: string;

  /**
   * Comando para ejecutar migraciones de base de datos.
   * Opcional si no hay base de datos o no usa migraciones.
   */
  migrateCommand?: string;

  /**
   * Puerto principal que expone la aplicación.
   */
  port: number;

  /**
   * Configuración de healthcheck para verificar que el servicio está listo.
   */
  healthcheck: HealthCheck;
}

/**
 * Contrato completo del adapter v0.
 * 
 * Un adapter debe poder proporcionar esta información para que el core
 * pueda:
 * 1. Verificar que el sistema tiene los requisitos mínimos (runtimeRequirements)
 * 2. Invocar la creación de proyectos (createProject acepta CreateProjectPayload)
 * 3. Configurar el deploy (deployRuntime)
 */
export interface AdapterContract {
  /**
   * Versión del contrato que implementa el adapter.
   */
  version: AdapterContractVersion;

  /**
   * Requisitos de runtime (binarios y versiones mínimas).
   */
  runtimeRequirements: RuntimeRequirements;

  /**
   * Declaración de runtime de deploy.
   * 
   * Puede variar según la topología del proyecto generado.
   * Por ejemplo, un monorepo con api/ y web/ podría tener diferentes
   * runtimes para cada package.
   */
  deployRuntime: DeployRuntime;
}
