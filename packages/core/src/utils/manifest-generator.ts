import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Estructura del manifiesto fractal.project.yml para topología multirepo.
 * 
 * Este archivo coordina las variables cruzadas entre los dos repositorios
 * y se completa en el primer `fractal deploy` de cada lado.
 * 
 * @see docs/adr/0012-deploy-multirepo-orquestacion-inicial.md
 */
export interface ProjectManifest {
  role: 'api' | 'web';
  sibling: {
    git_url: string | null;
    domain: string | null;
  };
  orchestration_state: 'pending' | 'resolved';
}

/**
 * Genera el archivo fractal.project.yml con placeholders para multirepo.
 * 
 * El archivo se crea con:
 * - role: 'api' o 'web' según el repositorio
 * - sibling.git_url: null (se completa en el primer deploy)
 * - sibling.domain: null (se completa en el primer deploy)
 * - orchestration_state: 'pending'
 * 
 * El archivo se genera DESPUÉS del commit inicial, y está en .gitignore,
 * por lo que no se commitea.
 */
export function generateManifest(
  repoDir: string,
  role: 'api' | 'web'
): void {
  const manifest: ProjectManifest = {
    role,
    sibling: {
      git_url: null,
      domain: null,
    },
    orchestration_state: 'pending',
  };
  
  const yamlContent = manifestToYaml(manifest);
  const manifestPath = join(repoDir, 'fractal.project.yml');
  
  writeFileSync(manifestPath, yamlContent, 'utf-8');
}

/**
 * Convierte el objeto manifest a formato YAML.
 * 
 * Usamos generación manual en vez de una librería YAML para mantener
 * el core sin dependencias innecesarias.
 */
function manifestToYaml(manifest: ProjectManifest): string {
  return `role: ${manifest.role}
sibling:
  git_url: ${manifest.sibling.git_url === null ? 'null' : manifest.sibling.git_url}
  domain: ${manifest.sibling.domain === null ? 'null' : manifest.sibling.domain}
orchestration_state: ${manifest.orchestration_state}
`;
}
