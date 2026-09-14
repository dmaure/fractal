/**
 * Gestor del estado persistente del servidor.
 * Implementa AC-11 (Idempotencia) del SPEC-0003.
 * Framework-agnostic según Artículo II de CONSTITUTION.md.
 */

import type { SshClient } from '../ssh/client.js';
import type {
  ServerState,
  StateConfig,
  ProvisioningStepState,
  DeployHistoryEntry,
  StateOperationResult,
  StepState,
} from './types.js';

const DEFAULT_STATE_PATH = '/etc/fractal/state.json';
const INITIAL_VERSION = '1.0.0';
const MAX_DEPLOY_HISTORY = 10;

export class StateManager {
  private statePath: string;

  constructor(
    private sshClient: SshClient,
    config: StateConfig = {}
  ) {
    this.statePath = config.statePath || DEFAULT_STATE_PATH;
  }

  /**
   * Lee el estado actual del servidor.
   * Si no existe, retorna un estado inicial vacío.
   */
  async readState(): Promise<ServerState> {
    const result = await this.sshClient.executeCommand(
      `sudo cat ${this.statePath} 2>/dev/null || echo "{}"`
    );

    if (!result.success || result.stdout.trim() === '{}') {
      return this.createInitialState();
    }

    try {
      const state = JSON.parse(result.stdout) as ServerState;
      return state;
    } catch {
      return this.createInitialState();
    }
  }

  /**
   * Escribe el estado en el servidor.
   */
  async writeState(state: ServerState): Promise<StateOperationResult> {
    state.updatedAt = new Date().toISOString();

    const stateJson = JSON.stringify(state, null, 2);
    const escapedContent = stateJson.replace(/'/g, "'\\''");

    // Crear directorio si no existe
    const dirResult = await this.sshClient.executeCommand(
      `sudo mkdir -p $(dirname ${this.statePath})`
    );

    if (!dirResult.success) {
      return {
        success: false,
        error: `No se pudo crear el directorio: ${dirResult.stderr}`,
      };
    }

    // Escribir archivo
    const writeResult = await this.sshClient.executeCommand(
      `sudo bash -c "cat > ${this.statePath} << 'FRACTAL_STATE_EOF'\n${escapedContent}\nFRACTAL_STATE_EOF"`
    );

    if (!writeResult.success) {
      return {
        success: false,
        error: `No se pudo escribir el estado: ${writeResult.stderr}`,
      };
    }

    return { success: true };
  }

  /**
   * Verifica si un paso de provisioning ya fue completado.
   */
  async isStepCompleted(stepName: keyof ServerState['provisioning']): Promise<boolean> {
    const state = await this.readState();
    return state.provisioning[stepName]?.state === 'completed';
  }

  /**
   * Verifica si un paso necesita re-ejecutarse basándose en el hash de configuración.
   */
  async shouldRerunStep(
    stepName: keyof ServerState['provisioning'],
    configHash: string
  ): Promise<boolean> {
    const state = await this.readState();
    const stepState = state.provisioning[stepName];

    if (!stepState || stepState.state !== 'completed') {
      return true;
    }

    return stepState.configHash !== configHash;
  }

  /**
   * Marca un paso de provisioning con un estado específico.
   */
  async markStep(
    stepName: keyof ServerState['provisioning'],
    stepState: StepState,
    configHash?: string,
    message?: string
  ): Promise<StateOperationResult> {
    const state = await this.readState();

    state.provisioning[stepName] = {
      state: stepState,
      lastRun: new Date().toISOString(),
      configHash,
      message,
    };

    return this.writeState(state);
  }

  /**
   * Agrega una entrada al historial de deploys.
   */
  async addDeployHistory(entry: DeployHistoryEntry): Promise<StateOperationResult> {
    const state = await this.readState();

    // Agregar al inicio del array
    state.deployHistory.unshift(entry);

    // Mantener solo las últimas MAX_DEPLOY_HISTORY entradas
    if (state.deployHistory.length > MAX_DEPLOY_HISTORY) {
      state.deployHistory = state.deployHistory.slice(0, MAX_DEPLOY_HISTORY);
    }

    // Actualizar imagen actual
    state.currentImageTag = entry.imageTag;

    // Actualizar última imagen exitosa si el healthcheck pasó
    if (entry.healthcheck === 'passed') {
      state.lastSuccessfulImageTag = entry.imageTag;
    }

    return this.writeState(state);
  }

  /**
   * Obtiene el tag de la última imagen desplegada exitosamente.
   * Retorna null si no hay ninguna.
   */
  async getLastSuccessfulImageTag(): Promise<string | null> {
    const state = await this.readState();
    return state.lastSuccessfulImageTag || null;
  }

  /**
   * Obtiene el tag de la imagen desplegada inmediatamente anterior a la actual.
   * Útil para rollback.
   */
  async getPreviousSuccessfulImageTag(): Promise<string | null> {
    const state = await this.readState();

    // Buscar la primera entrada exitosa que no sea la actual
    const currentTag = state.currentImageTag;
    for (const entry of state.deployHistory) {
      if (entry.healthcheck === 'passed' && entry.imageTag !== currentTag) {
        return entry.imageTag;
      }
    }

    return null;
  }

  /**
   * Obtiene el historial completo de deploys.
   */
  async getDeployHistory(): Promise<DeployHistoryEntry[]> {
    const state = await this.readState();
    return state.deployHistory;
  }

  /**
   * Limpia el estado del servidor (útil para testing o re-provisioning).
   */
  async clearState(): Promise<StateOperationResult> {
    const result = await this.sshClient.executeCommand(
      `sudo rm -f ${this.statePath}`
    );

    if (!result.success) {
      return {
        success: false,
        error: `No se pudo eliminar el estado: ${result.stderr}`,
      };
    }

    return { success: true };
  }

  /**
   * Crea un estado inicial vacío.
   */
  private createInitialState(): ServerState {
    const now = new Date().toISOString();
    return {
      version: INITIAL_VERSION,
      createdAt: now,
      updatedAt: now,
      provisioning: {},
      deployHistory: [],
    };
  }

  /**
   * Genera un hash simple de una configuración (para detectar cambios).
   */
  static generateConfigHash(config: unknown): string {
    const configStr = JSON.stringify(config);
    let hash = 0;
    for (let i = 0; i < configStr.length; i++) {
      const char = configStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
