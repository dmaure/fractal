/**
 * Configuración de variables cruzadas según el rol del repositorio.
 */
export interface CrossVarConfig {
  /** Rol del repositorio actual */
  role: 'api' | 'web';
  
  /** Dominio del repositorio actual */
  currentDomain: string;
  
  /** Dominio del repositorio hermano */
  siblingDomain: string;
}

/**
 * Resultado de escritura de variables cruzadas.
 */
export interface CrossVarWriteResult {
  /** Indica si la escritura fue exitosa */
  success: boolean;
  
  /** Variables que fueron escritas */
  writtenVars?: Record<string, string>;
  
  /** Instrucciones para el repo hermano */
  siblingInstructions?: {
    /** Rol del hermano */
    siblingRole: 'api' | 'web';
    
    /** Variables que el usuario debe configurar en el hermano */
    varsToSet: Record<string, string>;
    
    /** Mensaje formateado para mostrar al usuario */
    message: string;
  };
  
  /** Mensaje de error en caso de fallo */
  error?: string;
}
