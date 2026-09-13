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
 * Información del hermano recolectada durante el primer deploy.
 */
export interface SiblingInfo {
  /** URL del repositorio git del hermano */
  gitUrl: string;
  
  /** Dominio donde vivirá el hermano */
  domain: string;
}

/**
 * Resultado de lectura del manifiesto.
 */
export interface ManifestReadResult {
  /** Indica si el archivo existe */
  exists: boolean;
  
  /** Manifiesto parseado (si existe) */
  manifest?: ProjectManifest;
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}

/**
 * Resultado de escritura del manifiesto.
 */
export interface ManifestWriteResult {
  /** Indica si la escritura fue exitosa */
  success: boolean;
  
  /** Ruta del archivo escrito */
  filePath?: string;
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}
