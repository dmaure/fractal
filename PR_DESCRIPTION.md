## Spec
SPEC-0003 (Deploy inicial a VPS)

## Linear
https://linear.app/fractalapp/issue/FRA-37/deploy-orquestar-hardening-runtime-y-dns-en-fractal-deploy

## Objetivo
Integrar los módulos de `@fractal/deploy` (SystemHardening, RuntimeManager, DnsManager) en el comando `fractal deploy`, implementando la orquestación completa de hardening → runtime → DNS según las decisiones de producto especificadas en FRA-37.

## Criterios de aceptación cubiertos
- [x] AC-3: Hardening del sistema
- [x] AC-4: Runtime (Docker + Compose)
- [x] AC-5: DNS automatizado (Cloudflare)
- [x] AC-6: DNS manual
- [x] Decisión #1: Derivar clave pública SSH o solicitarla
- [x] Decisión #2: projectName desde package.json o basename
- [x] Decisión #3: targetType según rol del manifiesto
- [x] Decisión #4: Abortar si Route53
- [x] Decisión #5: Reconectar como usuario deploy después de hardening
- [x] Decisión #6: Ejecutar docker compose up después de runtime setup
- [x] Decisión #7: Envolver DNS con StateManager
- [x] Decisión #8: Escribir variables cruzadas al disco

## ADRs relevantes
- ADR-0002: Arquitectura multi-target (cumplido — sin términos de framework en core)
- ADR-0006: Runtime de producción (Docker Compose)
- ADR-0012: Deploy multirepo — coordinación en primer deploy
- ADR-0013: Runtime frontend-static para web/ en multirepo

## Cambios realizados

### `packages/core/src/commands/deploy.ts`
- Agregadas funciones helper: `deriveSshPublicKey()`, `determineProjectName()`, `determineTargetType()`, `writeCrossVarsToDisk()`
- Orquestación completa: validación → hardening → reconexión como deploy → runtime → docker compose up → DNS
- Manejo de Route53: aborta con mensaje claro antes de llamar a DnsManager
- Envuelve DNS con StateManager para idempotencia
- Escribe variables cruzadas al disco cuando aplica (multirepo con siblingInfo)
- Eliminado stub de "Punto de extensión"

### `packages/core/src/commands/deploy-orchestration.test.ts` (nuevo)
- 34 tests de integración cubriendo:
  - Derivación de clave pública SSH
  - Determinación de projectName y targetType
  - Orquestación de hardening → runtime → DNS
  - Manejo de Route53
  - Escritura de variables cruzadas al disco
  - Idempotencia de cada paso
  - Manejo de errores en cada paso
  - Escenarios end-to-end (Cloudflare, manual, re-run, Route53 abort, multirepo)

### `docs/specs/0003-deploy-inicial-vps.md`
- Actualizada sección 10 (Notas de implementación) con detalles de AC-3, AC-5 y AC-6
- Documentadas las decisiones de producto implementadas

## Checklist
- [x] Lint de acoplamiento pasa (sin términos de framework en core)
- [x] Tests agregados (34 tests nuevos en deploy-orchestration.test.ts)
- [x] Todos los tests existentes siguen pasando (145 tests en core, 246 en deploy)
- [x] Build exitoso (TypeScript compila sin errores)
- [x] Spec actualizado (SPEC-0003 sección 10)
- [ ] Test e2e contra VPS efímero (fuera del alcance de FRA-37, SPEC-0003 DoD pendiente)
- [ ] Documentación de usuario (fuera del alcance de FRA-37, SPEC-0003 DoD pendiente)

## Notas de implementación

### Reconexión como usuario deploy
Después de ejecutar `SystemHardening.harden()`, el CLI cierra la conexión SSH inicial (típicamente como root) y crea una nueva conexión con `username='deploy'` usando la clave privada correspondiente. Todos los pasos posteriores (runtime, DNS) se ejecutan con esta conexión no-root.

### Docker compose up explícito
`RuntimeManager.setup()` instala Docker y escribe `docker-compose.yml`, pero no ejecuta `up`. El CLI lo hace explícitamente después con `docker compose up -d` vía SSH para mantener control del flujo.

### Variables cruzadas al disco
Si el deploy es en multirepo y se recolectó `siblingInfo`, las variables cruzadas se persisten:
- `role === 'web'`: `.env.production` (Vite las lee en build time)
- `role === 'api'`: `.env` (Laravel las lee en runtime)

Las variables existentes se actualizan en lugar de duplicarse.

## Framework-agnostic (Artículo II)
✅ El lint de acoplamiento pasa sin violaciones. La orquestación en `packages/core` no introduce ninguna referencia a frameworks específicos (laravel, rails, eloquent, etc.).
