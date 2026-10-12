/**
 * Tests de tipos del paquete @fractal/deploy (FRA-62).
 *
 * Este archivo cumple dos funciones:
 *
 * 1. Documenta el shape de los tipos centrales de los que dependen los mocks de
 *    los tests (`SshCommandResult`) y la configuración de CI/CD (`CicdProvider`).
 *
 * 2. Es un archivo `*.test-d.ts`: su presencia activa el type-checker de Vitest
 *    (`typecheck.enabled`). Al activarse, Vitest corre `tsc` sobre todo el
 *    programa de `tsconfig.test.json` —que ahora incluye los archivos de test—
 *    y falla si algún `*.test.ts` tiene errores de tipos. Así el typecheck de
 *    los tests queda cubierto por `pnpm test` en CI (FRA-62, deuda de FRA-50).
 */

import { describe, it, expectTypeOf } from 'vitest';
import type { SshCommandResult } from './ssh/types.js';
import type { CicdProvider } from './cicd/types.js';

describe('@fractal/deploy types', () => {
  describe('SshCommandResult', () => {
    it('expone los campos obligatorios success, stdout, stderr y exitCode', () => {
      expectTypeOf<SshCommandResult>().toHaveProperty('success');
      expectTypeOf<SshCommandResult>().toHaveProperty('stdout');
      expectTypeOf<SshCommandResult>().toHaveProperty('stderr');
      expectTypeOf<SshCommandResult>().toHaveProperty('exitCode');
    });

    it('tipa success como boolean y exitCode como number | null', () => {
      expectTypeOf<SshCommandResult['success']>().toEqualTypeOf<boolean>();
      expectTypeOf<SshCommandResult['stdout']>().toEqualTypeOf<string>();
      expectTypeOf<SshCommandResult['stderr']>().toEqualTypeOf<string>();
      expectTypeOf<SshCommandResult['exitCode']>().toEqualTypeOf<number | null>();
    });
  });

  describe('CicdProvider', () => {
    it('es la unión de proveedores soportados, no un string arbitrario', () => {
      expectTypeOf<CicdProvider>().toEqualTypeOf<'github-actions' | 'gitlab-ci'>();
      expectTypeOf<'github-actions'>().toMatchTypeOf<CicdProvider>();
      expectTypeOf<'gitlab-ci'>().toMatchTypeOf<CicdProvider>();
    });
  });
});
