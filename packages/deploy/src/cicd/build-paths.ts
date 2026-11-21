import { posix } from 'node:path';
import type { DeployRuntime } from '@fractal/core';

/**
 * Contexto y Dockerfile para `docker build` en CI. En el contrato el
 * `dockerfile` es relativo al contexto, pero `docker build -f` y
 * `build-push-action file:` lo resuelven desde el directorio de trabajo,
 * así que se une con el contexto. Sin `runtime.build` (monolito, multirepo):
 * contexto `.` y Dockerfile de la raíz.
 */
export function ciBuildPaths(runtime: DeployRuntime): { context: string; file: string } {
  const context = runtime.build?.context ?? '.';
  const file = posix.join(context, runtime.build?.dockerfile ?? 'Dockerfile');
  return { context, file };
}
