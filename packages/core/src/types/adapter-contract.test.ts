/**
 * Tests de tipos del contrato del adapter v0.
 * 
 * Verifica que los tipos cumplen con los criterios de aceptación
 * de SPEC-0006 AC-4: shape sin ambigüedad, campos obligatorios correctos.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AdapterContractVersion,
  CreateProjectPayload,
  CreateProjectResponse,
  CreateProjectSuccess,
  CreateProjectError,
  RuntimeRequirements,
  BinaryRequirement,
  DeployRuntime,
  ServiceName,
  HealthCheck,
  AdapterContract,
} from '../src/types/adapter-contract.js';
import type { ProjectTopology } from '../src/types/topology.js';

describe('Adapter Contract v0 Types', () => {
  describe('CreateProjectPayload', () => {
    it('debe compilar con todos los campos obligatorios', () => {
      const validPayload: CreateProjectPayload = {
        name: 'mi-proyecto',
        topology: 'monolith',
        destinationPath: '/tmp/mi-proyecto',
      };

      expect(validPayload.name).toBe('mi-proyecto');
      expect(validPayload.topology).toBe('monolith');
      expect(validPayload.destinationPath).toBe('/tmp/mi-proyecto');
    });

    it('debe compilar con contractVersion opcional', () => {
      const payloadWithVersion: CreateProjectPayload = {
        name: 'mi-proyecto',
        topology: 'monorepo',
        destinationPath: '/tmp/mi-proyecto',
        contractVersion: '0',
      };

      expect(payloadWithVersion.contractVersion).toBe('0');
    });

    it('debe aceptar todas las topologías válidas', () => {
      const topologies: ProjectTopology[] = ['monolith', 'monorepo', 'multirepo'];
      
      topologies.forEach(topology => {
        const payload: CreateProjectPayload = {
          name: 'test',
          topology,
          destinationPath: '/tmp/test',
        };
        expect(payload.topology).toBe(topology);
      });
    });

    it('debe tener tipos correctos para cada campo', () => {
      expectTypeOf<CreateProjectPayload>().toMatchTypeOf<{
        name: string;
        topology: ProjectTopology;
        destinationPath: string;
        contractVersion?: AdapterContractVersion;
      }>();
    });
  });

  describe('CreateProjectResponse', () => {
    it('debe compilar respuesta exitosa', () => {
      const success: CreateProjectSuccess = {
        success: true,
        projectPath: '/tmp/mi-proyecto',
      };

      expect(success.success).toBe(true);
      expect(success.projectPath).toBe('/tmp/mi-proyecto');
    });

    it('debe compilar respuesta exitosa con mensaje', () => {
      const successWithMessage: CreateProjectSuccess = {
        success: true,
        projectPath: '/tmp/mi-proyecto',
        message: 'Proyecto creado exitosamente',
      };

      expect(successWithMessage.message).toBe('Proyecto creado exitosamente');
    });

    it('debe compilar respuesta de error', () => {
      const error: CreateProjectError = {
        success: false,
        error: 'El directorio no está vacío',
      };

      expect(error.success).toBe(false);
      expect(error.error).toBe('El directorio no está vacío');
    });

    it('debe compilar respuesta de error con código', () => {
      const errorWithCode: CreateProjectError = {
        success: false,
        error: 'Directorio no vacío',
        code: 'DIRECTORY_NOT_EMPTY',
      };

      expect(errorWithCode.code).toBe('DIRECTORY_NOT_EMPTY');
    });

    it('debe ser union type de success y error', () => {
      const responses: CreateProjectResponse[] = [
        { success: true, projectPath: '/tmp/test' },
        { success: false, error: 'Error' },
      ];

      expect(responses).toHaveLength(2);
    });
  });

  describe('RuntimeRequirements', () => {
    it('debe compilar con lista de binarios', () => {
      const requirements: RuntimeRequirements = {
        binaries: [
          {
            name: 'node',
            minVersion: '20.0.0',
          },
          {
            name: 'npm',
            minVersion: '10.0.0',
            displayName: 'npm (Node Package Manager)',
          },
        ],
      };

      expect(requirements.binaries).toHaveLength(2);
      expect(requirements.binaries[0].name).toBe('node');
      expect(requirements.binaries[1].displayName).toBeDefined();
    });

    it('debe compilar con lista vacía de binarios', () => {
      const noRequirements: RuntimeRequirements = {
        binaries: [],
      };

      expect(noRequirements.binaries).toHaveLength(0);
    });

    it('BinaryRequirement debe tener campos correctos', () => {
      const binary: BinaryRequirement = {
        name: 'node',
        minVersion: '20.0.0',
      };

      expectTypeOf(binary).toMatchTypeOf<{
        name: string;
        minVersion: string;
        displayName?: string;
      }>();
    });
  });

  describe('DeployRuntime', () => {
    it('debe compilar para backend completo', () => {
      const backendRuntime: DeployRuntime = {
        services: ['app', 'nginx', 'db', 'redis', 'worker', 'scheduler'],
        buildCommand: 'npm run build',
        migrateCommand: 'npm run migrate',
        port: 8080,
        healthcheck: {
          path: '/api/health',
        },
      };

      expect(backendRuntime.services).toHaveLength(6);
      expect(backendRuntime.port).toBe(8080);
      expect(backendRuntime.healthcheck.path).toBe('/api/health');
    });

    it('debe compilar para nginx-only (frontend estático)', () => {
      const nginxOnlyRuntime: DeployRuntime = {
        services: ['nginx'],
        port: 80,
        healthcheck: {
          path: '/health.txt',
        },
      };

      expect(nginxOnlyRuntime.services).toHaveLength(1);
      expect(nginxOnlyRuntime.services[0]).toBe('nginx');
      expect(nginxOnlyRuntime.buildCommand).toBeUndefined();
      expect(nginxOnlyRuntime.migrateCommand).toBeUndefined();
    });

    it('ServiceName debe ser string', () => {
      const serviceName: ServiceName = 'app';
      expectTypeOf(serviceName).toBeString();
    });

    it('HealthCheck debe requerir path con /', () => {
      const healthcheck: HealthCheck = {
        path: '/health',
      };

      expect(healthcheck.path).toBe('/health');
      expectTypeOf(healthcheck).toMatchTypeOf<{
        path: string;
      }>();
    });
  });

  describe('AdapterContract', () => {
    it('debe compilar contrato completo', () => {
      const contract: AdapterContract = {
        version: '0',
        runtimeRequirements: {
          binaries: [
            {
              name: 'node',
              minVersion: '20.0.0',
            },
          ],
        },
        deployRuntime: {
          services: ['app', 'nginx'],
          buildCommand: 'npm run build',
          port: 8080,
          healthcheck: {
            path: '/api/health',
          },
        },
      };

      expect(contract.version).toBe('0');
      expect(contract.runtimeRequirements.binaries).toHaveLength(1);
      expect(contract.deployRuntime.services).toHaveLength(2);
    });

    it('debe tener tipos correctos para todos los campos', () => {
      expectTypeOf<AdapterContract>().toMatchTypeOf<{
        version: AdapterContractVersion;
        runtimeRequirements: RuntimeRequirements;
        deployRuntime: DeployRuntime;
      }>();
    });
  });

  describe('Agnosticismo de framework (Artículo II)', () => {
    it('no debe referenciar frameworks específicos en los tipos', () => {
      // Este test es más simbólico; el verdadero chequeo lo hace el lint de acoplamiento.
      // Verificamos que los tipos están diseñados de forma genérica.
      
      const payload: CreateProjectPayload = {
        name: 'generic-project',
        topology: 'monolith',
        destinationPath: '/tmp/generic',
      };

      const runtime: DeployRuntime = {
        services: ['app', 'nginx', 'db'],
        buildCommand: 'build',
        migrateCommand: 'migrate',
        port: 8080,
        healthcheck: { path: '/health' },
      };

      // Los tipos son agnósticos: no mencionan Laravel, Rails, etc.
      expect(payload).toBeDefined();
      expect(runtime).toBeDefined();
    });
  });

  describe('Versionado del contrato', () => {
    it('debe soportar versión 0', () => {
      const version: AdapterContractVersion = '0';
      expect(version).toBe('0');
    });

    it('contractVersion en payload debe ser opcional', () => {
      const withoutVersion: CreateProjectPayload = {
        name: 'test',
        topology: 'monolith',
        destinationPath: '/tmp/test',
      };

      const withVersion: CreateProjectPayload = {
        ...withoutVersion,
        contractVersion: '0',
      };

      expect(withoutVersion.contractVersion).toBeUndefined();
      expect(withVersion.contractVersion).toBe('0');
    });
  });
});
