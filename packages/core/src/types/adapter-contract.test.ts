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
  CreateProjectData,
  RuntimeRequirements,
  BinaryRequirement,
  DeployRuntime,
  ServiceName,
  HealthCheck,
  AdapterContract,
} from './adapter-contract.js';
import type { ProjectTopology } from './topology.js';

describe('Adapter Contract v0 Types', () => {
  describe('CreateProjectPayload', () => {
    it('debe compilar con todos los campos obligatorios', () => {
      const validPayload: CreateProjectPayload = {
        name: 'mi-proyecto',
        topology: 'monolith',
        destinationPath: '/tmp/mi-proyecto',
        target: 'default',
      };

      expect(validPayload.name).toBe('mi-proyecto');
      expect(validPayload.topology).toBe('monolith');
      expect(validPayload.destinationPath).toBe('/tmp/mi-proyecto');
      expect(validPayload.target).toBe('default');
    });

    it('debe compilar con contractVersion opcional', () => {
      const payloadWithVersion: CreateProjectPayload = {
        name: 'mi-proyecto',
        topology: 'monorepo',
        destinationPath: '/tmp/mi-proyecto',
        target: 'default',
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
          target: 'default',
        };
        expect(payload.topology).toBe(topology);
      });
    });

    it('debe tener tipos correctos para cada campo', () => {
      expectTypeOf<CreateProjectPayload>().toMatchTypeOf<{
        name: string;
        topology: ProjectTopology;
        destinationPath: string;
        target: string;
        contractVersion?: AdapterContractVersion;
      }>();
    });

    it('debe requerir el campo target', () => {
      expectTypeOf<CreateProjectPayload>().toHaveProperty('target');
    });
  });

  describe('CreateProjectPayload - negative tests', () => {
    it('debe fallar sin name', () => {
      // @ts-expect-error - name es requerido
      const payload: CreateProjectPayload = {
        topology: 'monolith',
        destinationPath: '/tmp/test',
        target: 'default',
      };
      expect(payload).toBeDefined();
    });

    it('debe fallar sin topology', () => {
      // @ts-expect-error - topology es requerido
      const payload: CreateProjectPayload = {
        name: 'test',
        destinationPath: '/tmp/test',
        target: 'default',
      };
      expect(payload).toBeDefined();
    });

    it('debe fallar sin destinationPath', () => {
      // @ts-expect-error - destinationPath es requerido
      const payload: CreateProjectPayload = {
        name: 'test',
        topology: 'monolith',
        target: 'default',
      };
      expect(payload).toBeDefined();
    });

    it('debe fallar sin target', () => {
      // @ts-expect-error - target es requerido
      const payload: CreateProjectPayload = {
        name: 'test',
        topology: 'monolith',
        destinationPath: '/tmp/test',
      };
      expect(payload).toBeDefined();
    });
  });

  describe('CreateProjectResponse', () => {
    it('debe compilar respuesta exitosa con envelope del bridge', () => {
      const success: CreateProjectResponse = {
        success: true,
        data: {
          projectPath: '/tmp/mi-proyecto',
        },
      };

      expect(success.success).toBe(true);
      if (success.success) {
        expect(success.data.projectPath).toBe('/tmp/mi-proyecto');
      }
    });

    it('debe compilar respuesta exitosa con mensaje opcional', () => {
      const successWithMessage: CreateProjectResponse = {
        success: true,
        data: {
          projectPath: '/tmp/mi-proyecto',
          message: 'Proyecto creado exitosamente',
        },
      };

      expect(successWithMessage.success).toBe(true);
      if (successWithMessage.success) {
        expect(successWithMessage.data.message).toBe('Proyecto creado exitosamente');
      }
    });

    it('debe compilar respuesta de error con envelope del bridge', () => {
      const error: CreateProjectResponse = {
        success: false,
        error: {
          message: 'El directorio no está vacío',
        },
      };

      expect(error.success).toBe(false);
      if (!error.success) {
        expect(error.error.message).toBe('El directorio no está vacío');
      }
    });

    it('debe compilar respuesta de error con step opcional', () => {
      const errorWithStep: CreateProjectResponse = {
        success: false,
        error: {
          message: 'Error de validación',
          step: 'validación',
        },
      };

      expect(errorWithStep.success).toBe(false);
      if (!errorWithStep.success) {
        expect(errorWithStep.error.step).toBe('validación');
      }
    });

    it('debe ser union type de success y error', () => {
      const responses: CreateProjectResponse[] = [
        { success: true, data: { projectPath: '/tmp/test' } },
        { success: false, error: { message: 'Error' } },
      ];

      expect(responses).toHaveLength(2);
    });

    it('debe alinear con el envelope del bridge (SPEC-0002)', () => {
      // El formato coincide con AdapterSuccess/AdapterFailure del bridge
      type BridgeSuccess = { success: true; data: unknown };
      type BridgeFailure = { success: false; error: { message: string; step?: string; exitCode?: number } };

      // CreateProjectResponse debe ser compatible con el bridge
      expectTypeOf<Extract<CreateProjectResponse, { success: true }>>()
        .toMatchTypeOf<BridgeSuccess>();
      
      expectTypeOf<Extract<CreateProjectResponse, { success: false }>>()
        .toMatchTypeOf<Omit<BridgeFailure, 'error'> & { error: { message: string; step?: string } }>();
    });
  });

  describe('CreateProjectResponse - negative tests', () => {
    it('debe fallar respuesta exitosa sin data', () => {
      // @ts-expect-error - data es requerido cuando success es true
      const response: CreateProjectResponse = {
        success: true,
      };
      expect(response).toBeDefined();
    });

    it('debe fallar respuesta de error sin error', () => {
      // @ts-expect-error - error es requerido cuando success es false
      const response: CreateProjectResponse = {
        success: false,
      };
      expect(response).toBeDefined();
    });

    it('debe fallar data sin projectPath', () => {
      // @ts-expect-error - projectPath es requerido en data
      const response: CreateProjectResponse = {
        success: true,
        data: {
          message: 'Solo mensaje',
        },
      };
      expect(response).toBeDefined();
    });

    it('debe fallar error sin message', () => {
      // @ts-expect-error - message es requerido en error
      const response: CreateProjectResponse = {
        success: false,
        error: {
          step: 'Solo step',
        },
      };
      expect(response).toBeDefined();
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

  describe('RuntimeRequirements - negative tests', () => {
    it('debe fallar sin binaries', () => {
      // @ts-expect-error - binaries es requerido
      const requirements: RuntimeRequirements = {};
      expect(requirements).toBeDefined();
    });

    it('debe fallar binario sin name', () => {
      // @ts-expect-error - name es requerido en BinaryRequirement
      const binary: BinaryRequirement = {
        minVersion: '1.0.0',
      };
      expect(binary).toBeDefined();
    });

    it('debe fallar binario sin minVersion', () => {
      // @ts-expect-error - minVersion es requerido en BinaryRequirement
      const binary: BinaryRequirement = {
        name: 'node',
      };
      expect(binary).toBeDefined();
    });
  });

  describe('DeployRuntime', () => {
    it('debe compilar para backend completo', () => {
      const backendRuntime: DeployRuntime = {
        services: ['app', 'nginx', 'db', 'cache', 'worker', 'scheduler'],
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

    it('HealthCheck debe requerir path', () => {
      const healthcheck: HealthCheck = {
        path: '/health',
      };

      expect(healthcheck.path).toBe('/health');
      expectTypeOf(healthcheck).toMatchTypeOf<{
        path: string;
      }>();
    });
  });

  describe('DeployRuntime - negative tests', () => {
    it('debe fallar sin services', () => {
      // @ts-expect-error - services es requerido
      const runtime: DeployRuntime = {
        port: 8080,
        healthcheck: { path: '/health' },
      };
      expect(runtime).toBeDefined();
    });

    it('debe fallar sin port', () => {
      // @ts-expect-error - port es requerido
      const runtime: DeployRuntime = {
        services: ['app'],
        healthcheck: { path: '/health' },
      };
      expect(runtime).toBeDefined();
    });

    it('debe fallar sin healthcheck', () => {
      // @ts-expect-error - healthcheck es requerido
      const runtime: DeployRuntime = {
        services: ['app'],
        port: 8080,
      };
      expect(runtime).toBeDefined();
    });

    it('debe fallar healthcheck sin path', () => {
      // @ts-expect-error - path es requerido en HealthCheck
      const healthcheck: HealthCheck = {};
      expect(healthcheck).toBeDefined();
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

  describe('AdapterContract - negative tests', () => {
    it('debe fallar sin version', () => {
      // @ts-expect-error - version es requerido
      const contract: AdapterContract = {
        runtimeRequirements: { binaries: [] },
        deployRuntime: {
          services: ['app'],
          port: 8080,
          healthcheck: { path: '/health' },
        },
      };
      expect(contract).toBeDefined();
    });

    it('debe fallar sin runtimeRequirements', () => {
      // @ts-expect-error - runtimeRequirements es requerido
      const contract: AdapterContract = {
        version: '0',
        deployRuntime: {
          services: ['app'],
          port: 8080,
          healthcheck: { path: '/health' },
        },
      };
      expect(contract).toBeDefined();
    });

    it('debe fallar sin deployRuntime', () => {
      // @ts-expect-error - deployRuntime es requerido
      const contract: AdapterContract = {
        version: '0',
        runtimeRequirements: { binaries: [] },
      };
      expect(contract).toBeDefined();
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
        target: 'default',
      };

      const runtime: DeployRuntime = {
        services: ['app', 'nginx', 'db'],
        buildCommand: 'build',
        migrateCommand: 'migrate',
        port: 8080,
        healthcheck: { path: '/health' },
      };

      // Los tipos son agnósticos: no mencionan framework-specific terms
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
        target: 'default',
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
