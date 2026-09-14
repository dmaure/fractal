import type {
  VpsState,
  StateReadResult,
  StateOperationResult,
  ProvisioningStep,
  SshClientInterface,
} from './types.js';

/**
 * Gestor de estado del VPS.
 * 
 * Implementa AC-11 del SPEC-0003: idempotencia mediante estado almacenado
 * en el propio VPS (/etc/fractal/state.json).
 * 
 * Cada paso del provisioning verifica este estado antes de ejecutarse.
 */
export class StateManager {
  private readonly STATE_FILE_PATH = '/etc/fractal/state.json';
  private readonly STATE_DIR = '/etc/fractal';
  private readonly STATE_VERSION = '1.0.0';

  constructor(private readonly sshClient: SshClientInterface) {}

  /**
   * Lee el estado actual del VPS.
   */
  async read(): Promise<StateReadResult> {
    try {
      // Verificar si el directorio existe
      const dirCheck = await this.sshClient.executeCommand(
        `test -d ${this.STATE_DIR} && echo "exists" || echo "not_exists"`
      );

      if (!dirCheck.success || !dirCheck.output) {
        return {
          success: false,
          exists: false,
          error: 'Error al verificar directorio de estado',
        };
      }

      const dirExists = dirCheck.output.trim() === 'exists';

      if (!dirExists) {
        return {
          success: true,
          exists: false,
        };
      }

      // Leer el archivo de estado
      const fileResult = await this.sshClient.readFile(this.STATE_FILE_PATH);

      if (!fileResult.success) {
        if (fileResult.error?.includes('No such file')) {
          return {
            success: true,
            exists: false,
          };
        }

        return {
          success: false,
          exists: false,
          error: fileResult.error,
        };
      }

      if (!fileResult.content) {
        return {
          success: true,
          exists: false,
        };
      }

      // Parsear el estado
      try {
        const state = JSON.parse(fileResult.content) as VpsState;
        return {
          success: true,
          exists: true,
          state,
        };
      } catch (parseError) {
        return {
          success: false,
          exists: true,
          error: 'Estado corrupto: JSON inválido',
        };
      }
    } catch (error) {
      return {
        success: false,
        exists: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Inicializa el estado en el VPS si no existe.
   */
  async initialize(): Promise<StateOperationResult> {
    try {
      const readResult = await this.read();

      if (readResult.exists && readResult.state) {
        // El estado ya existe, no hace falta inicializar
        return { success: true };
      }

      // Crear el directorio si no existe
      const mkdirResult = await this.sshClient.executeCommand(
        `sudo mkdir -p ${this.STATE_DIR} && sudo chmod 755 ${this.STATE_DIR}`
      );

      if (!mkdirResult.success) {
        return {
          success: false,
          error: `Error al crear directorio de estado: ${mkdirResult.error}`,
        };
      }

      // Crear el estado inicial
      const initialState: VpsState = {
        version: this.STATE_VERSION,
        provisioningSteps: {
          hardening: false,
          runtime: false,
          dns: false,
          ssl: false,
          initialDeploy: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const writeResult = await this.writeState(initialState);

      if (!writeResult.success) {
        return {
          success: false,
          error: `Error al escribir estado inicial: ${writeResult.error}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Verifica si un paso de provisioning ya fue completado.
   */
  async isStepCompleted(step: ProvisioningStep): Promise<boolean> {
    const readResult = await this.read();

    if (!readResult.exists || !readResult.state) {
      return false;
    }

    return readResult.state.provisioningSteps[step] === true;
  }

  /**
   * Marca un paso de provisioning como completado.
   */
  async markStepCompleted(step: ProvisioningStep): Promise<StateOperationResult> {
    try {
      const readResult = await this.read();

      if (!readResult.success) {
        return {
          success: false,
          error: `Error al leer estado: ${readResult.error}`,
        };
      }

      let state: VpsState;

      if (!readResult.exists || !readResult.state) {
        // Inicializar si no existe
        const initResult = await this.initialize();
        if (!initResult.success) {
          return initResult;
        }

        const reReadResult = await this.read();
        if (!reReadResult.success || !reReadResult.state) {
          return {
            success: false,
            error: 'Error al leer estado después de inicializar',
          };
        }

        state = reReadResult.state;
      } else {
        state = readResult.state;
      }

      // Actualizar el paso
      state.provisioningSteps[step] = true;
      state.updatedAt = new Date().toISOString();

      return await this.writeState(state);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Actualiza la información del último deploy exitoso.
   */
  async updateLastDeploy(imageTag: string, commitSha?: string): Promise<StateOperationResult> {
    try {
      const readResult = await this.read();

      if (!readResult.success || !readResult.state) {
        return {
          success: false,
          error: 'Estado no disponible',
        };
      }

      const state = readResult.state;

      state.lastSuccessfulDeploy = {
        imageTag,
        timestamp: new Date().toISOString(),
        commitSha,
      };
      state.updatedAt = new Date().toISOString();

      return await this.writeState(state);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Obtiene la información del último deploy exitoso.
   */
  async getLastDeploy(): Promise<VpsState['lastSuccessfulDeploy'] | null> {
    const readResult = await this.read();

    if (!readResult.exists || !readResult.state) {
      return null;
    }

    return readResult.state.lastSuccessfulDeploy || null;
  }

  /**
   * Escribe el estado en el VPS.
   */
  private async writeState(state: VpsState): Promise<StateOperationResult> {
    try {
      const stateJson = JSON.stringify(state, null, 2);

      // Escribir a un archivo temporal primero
      const tempFile = `${this.STATE_FILE_PATH}.tmp`;

      const writeResult = await this.sshClient.writeFile(tempFile, stateJson);

      if (!writeResult.success) {
        return {
          success: false,
          error: `Error al escribir archivo temporal: ${writeResult.error}`,
        };
      }

      // Mover atómicamente
      const moveResult = await this.sshClient.executeCommand(
        `sudo mv ${tempFile} ${this.STATE_FILE_PATH} && sudo chmod 644 ${this.STATE_FILE_PATH}`
      );

      if (!moveResult.success) {
        return {
          success: false,
          error: `Error al mover archivo de estado: ${moveResult.error}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }
}
