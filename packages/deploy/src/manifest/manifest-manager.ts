import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectManifest, ManifestReadResult, ManifestWriteResult, SiblingInfo } from './types.js';

/**
 * Gestor del manifiesto fractal.project.yml.
 * 
 * Lee y escribe el manifiesto de coordinación multirepo, que marca si el
 * primer deploy ya completó la recolección de datos del hermano.
 * 
 * Cumple ADR-0012 y SPEC-0003 AC-13.
 */
export class ManifestManager {
  private manifestPath: string;

  constructor(projectDir: string) {
    this.manifestPath = join(projectDir, 'fractal.project.yml');
  }

  /**
   * Lee el manifiesto del directorio del proyecto.
   * 
   * Retorna exists: false si el manifiesto no existe (no es multirepo o
   * no fue generado todavía), o exists: true con el manifest parseado.
   */
  read(): ManifestReadResult {
    if (!existsSync(this.manifestPath)) {
      return { exists: false };
    }

    try {
      const content = readFileSync(this.manifestPath, 'utf-8');
      const manifest = this.parseYaml(content);
      
      return {
        exists: true,
        manifest,
      };
    } catch (error) {
      return {
        exists: true,
        error: error instanceof Error ? error.message : 'Error al leer el manifiesto',
      };
    }
  }

  /**
   * Actualiza el manifiesto con la información del hermano y marca como resolved.
   * 
   * @param siblingInfo Información del hermano recolectada
   */
  updateWithSiblingInfo(siblingInfo: SiblingInfo): ManifestWriteResult {
    const readResult = this.read();
    
    if (!readResult.exists) {
      return {
        success: false,
        error: 'El manifiesto no existe. Este comando solo funciona en topología multirepo.',
      };
    }

    if (readResult.error || !readResult.manifest) {
      return {
        success: false,
        error: readResult.error || 'No se pudo leer el manifiesto',
      };
    }

    const updatedManifest: ProjectManifest = {
      ...readResult.manifest,
      sibling: {
        git_url: siblingInfo.gitUrl,
        domain: siblingInfo.domain,
      },
      orchestration_state: 'resolved',
    };

    return this.write(updatedManifest);
  }

  /**
   * Escribe el manifiesto completo al disco.
   */
  write(manifest: ProjectManifest): ManifestWriteResult {
    try {
      const yamlContent = this.manifestToYaml(manifest);
      writeFileSync(this.manifestPath, yamlContent, 'utf-8');
      
      return {
        success: true,
        filePath: this.manifestPath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al escribir el manifiesto',
      };
    }
  }

  /**
   * Parsea el contenido YAML del manifiesto.
   * 
   * Usa parser manual simple en vez de librería YAML para no agregar
   * dependencias innecesarias (mismo criterio que en packages/core).
   */
  private parseYaml(content: string): ProjectManifest {
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    
    const manifest: Partial<ProjectManifest> = {
      sibling: {
        git_url: null,
        domain: null,
      },
    };

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('role:')) {
        const role = trimmed.substring('role:'.length).trim();
        if (role !== 'api' && role !== 'web') {
          throw new Error(`Rol inválido en el manifiesto: ${role}`);
        }
        manifest.role = role;
      } else if (trimmed.startsWith('git_url:')) {
        const value = trimmed.substring('git_url:'.length).trim();
        manifest.sibling!.git_url = value === 'null' ? null : value;
      } else if (trimmed.startsWith('domain:')) {
        const value = trimmed.substring('domain:'.length).trim();
        manifest.sibling!.domain = value === 'null' ? null : value;
      } else if (trimmed.startsWith('orchestration_state:')) {
        const state = trimmed.substring('orchestration_state:'.length).trim();
        if (state !== 'pending' && state !== 'resolved') {
          throw new Error(`Estado de orquestación inválido: ${state}`);
        }
        manifest.orchestration_state = state;
      }
    }

    if (!manifest.role || !manifest.orchestration_state) {
      throw new Error('Manifiesto incompleto: falta role o orchestration_state');
    }

    return manifest as ProjectManifest;
  }

  /**
   * Convierte el objeto manifest a formato YAML.
   * 
   * Misma lógica que en packages/core/src/utils/manifest-generator.ts
   * para mantener formato consistente.
   */
  private manifestToYaml(manifest: ProjectManifest): string {
    return `role: ${manifest.role}
sibling:
  git_url: ${manifest.sibling.git_url === null ? 'null' : manifest.sibling.git_url}
  domain: ${manifest.sibling.domain === null ? 'null' : manifest.sibling.domain}
orchestration_state: ${manifest.orchestration_state}
`;
  }
}
