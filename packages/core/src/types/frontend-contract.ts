/**
 * Contrato del adapter frontend (FRA-115, ADR-0017).
 *
 * Un proyecto se compone de un adapter backend + 0..N adapters frontend
 * (`kind: 'frontend'` en su package.json). Core es agnóstico del stack
 * (Artículo II): solo conoce estos tipos y calcula el layout por topología.
 * Los adapters se comunican únicamente por payloads/respuestas JSON.
 *
 * @see docs/adr/0017-frontend-como-adapter.md
 */

import { dirname } from 'node:path';
import type { DeployRuntime, RuntimeRequirements } from './adapter-contract.js';
import type { ProjectTopology } from './topology.js';

/** Cómo se sirve un frontend: estático detrás del backend o no se despliega (mobile). */
export type FrontendServe = 'static' | 'none';

/** Respuesta de `get-contract` de un adapter frontend. */
export interface FrontendContract {
  version: '0';
  kind: 'frontend';
  /** Identificador del adapter (p. ej. el que figura en package.json). */
  target: string;
  /** Plataforma: 'web', 'mobile', ... */
  platform: string;
  /** Descripción legible del frontend, para comentarios de los archivos del backend. */
  description?: string;
  runtimeRequirements: RuntimeRequirements;
  /** Build, relativo al directorio del frontend. Ausente si `serve` es 'none'. */
  build?: {
    image: string;
    /** Glob de los manifiestos de dependencias, copiados antes que el resto (cache de capas). */
    dependencyManifests?: string;
    installCommand: string;
    buildCommand: string;
    outputDir: string;
  };
  serve: FrontendServe;
  /** Servidor de desarrollo. `apiProxy` es el prefijo que se proxea al backend. */
  dev: { command: string; port: number; apiProxy?: string };
  /** Variable de entorno por la que el frontend recibe la URL base de la API. */
  apiBaseEnv: string;
  /** Runtime de deploy estático (opcional; lo consume el deploy en FRA-117). */
  deployRuntime?: DeployRuntime;
}

/** Modo de generación: dentro del backend (monolito) o independiente. */
export type FrontendMode = 'embedded' | 'standalone';

/** Payload de la acción `create-frontend`. */
export interface CreateFrontendPayload {
  name: string;
  /** Path absoluto del directorio donde el adapter escribe el frontend. */
  destinationPath: string;
  mode: FrontendMode;
  /** URL de la API (solo en modo standalone). */
  apiUrl?: string;
  /**
   * El frontend vive en su propio repo y se despliega solo (multirepo, FRA-112):
   * el adapter agrega Dockerfile y nginx. En monorepo lo compila el backend.
   */
  ownRepo?: boolean;
}

/**
 * Frontend que el core le informa al adapter backend en `create-project`
 * (FRA-116): su directorio en el layout y su contrato. Con esto el backend
 * arma su Dockerfile/nginx sin conocer el stack del frontend.
 */
export interface BackendFrontendRef {
  /** Path del frontend relativo a la raíz del layout (p. ej. `web`). */
  dir: string;
  contract: FrontendContract;
}

/** Un frontend elegido: su adapter y la plataforma que declara. */
export interface FrontendSelection {
  target: string;
  platform: string;
}

/** Entrada del layout: path relativo a la raíz del layout (ver {@link layoutRoot}). */
export interface LayoutEntry {
  path: string;
}

export interface ProjectLayout {
  backend: LayoutEntry;
  frontends: Array<LayoutEntry & FrontendSelection & { dir: string }>;
}

/** Nombre base de directorio según plataforma. */
function baseDir(platform: string): string {
  return platform === 'mobile' ? 'mobile' : 'web';
}

/**
 * Única fuente de paths por topología (FRA-115).
 *
 * | topología | backend       | frontend (dir = web, mobile, ...) |
 * |-----------|---------------|-----------------------------------|
 * | monolith  | `.`           | `web`, `mobile`                   |
 * | monorepo  | `api`         | `web`, `mobile`                   |
 * | multirepo | `<name>-api`  | `<name>-web`, `<name>-mobile`     |
 *
 * Los paths son relativos a {@link layoutRoot}. Si dos frontends comparten
 * plataforma, el segundo y siguientes llevan sufijo `-<target>`.
 */
export function computeLayout(
  topology: ProjectTopology,
  name: string,
  frontends: FrontendSelection[] = []
): ProjectLayout {
  const used = new Set<string>();
  const entries = frontends.map((f) => {
    let dir = baseDir(f.platform);
    if (used.has(dir)) {
      dir = `${dir}-${f.target}`;
    }
    used.add(dir);
    const path = topology === 'multirepo' ? `${name}-${dir}` : dir;
    return { ...f, dir, path };
  });

  const backendPath =
    topology === 'monolith' ? '.' : topology === 'monorepo' ? 'api' : `${name}-api`;

  return { backend: { path: backendPath }, frontends: entries };
}

/**
 * Raíz contra la que se resuelven los paths de {@link computeLayout}:
 * el directorio del proyecto, salvo en multirepo donde los repos son
 * hermanos y la raíz es su directorio padre.
 */
export function layoutRoot(topology: ProjectTopology, projectDir: string): string {
  return topology === 'multirepo' ? dirname(projectDir) : projectDir;
}
