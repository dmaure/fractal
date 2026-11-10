# SPEC-0007: Motor de templating y generación de código

**Estado:** En revisión
**Autor:** Claude
**Fecha:** 2026-11-10
**Fecha de aprobación:** —
**ADR relacionado:** ADR-0014 (stubs versionados en el adapter), ADR-0016 (wizard v2 / brazos modulares)
**Issue:** —

---

## 1. Objetivo

Un motor de generación que renderiza los artefactos de un proyecto a partir de plantillas declarativas, organizadas en tres brazos reemplazables con contrato — **servidor**, **backend** y **frontend** —, reutilizable por cualquier adapter, que reemplaza el scaffolding hard-codeado actual sin cambiar la salida y conservando determinismo, pureza y snapshots.

## 2. Motivación

Hoy cada archivo del proyecto generado se produce con funciones TypeScript ad-hoc (stubs que devuelven strings) cableadas a mano con `mkdir`/`writeFile`/`chmod` dentro de los generadores de `@fractal/adapter-laravel` y `@fractal/deploy`. No hay una abstracción compartida "plantilla → disco", ni un plan declarativo e inspeccionable, ni una forma unificada de emisión condicional o de validación de rutas.

Para avanzar en M2 (generación por entidad desde el FDL: SPEC-0008 en adelante) necesitamos un sustrato reutilizable: un motor que reciba un contexto, componga brazos y produzca un **plan determinista** que luego se escribe en una sola pasada. El motor debe respetar ADR-0014 (stubs versionados, deterministas, offline, snapshot-testables) y el Art. II de la CONSTITUTION (el motor es agnóstico y vive en el core; los stubs específicos de framework siguen en `packages/adapter-*`). Se alinea con los brazos del wizard v2 (ADR-0016) y con el `DeployTarget` del contrato de adapter (`backend-full` / `frontend-static`).

Priorizamos el camino más simple que ya suma valor sobre el MVP: **no reescribimos el contenido de los stubs ni introducimos un lenguaje de plantillas nuevo**; extraemos el plan, el escritor y el contrato de brazo, y migramos el adapter Laravel por encima con salida byte-idéntica (el snapshot del árbol no cambia).

## 3. Historias de usuario

- Como **autor de un adapter**, quiero declarar los archivos a generar como un plan de datos puro, para testearlos por snapshot sin tocar disco.
- Como **core de Fractal**, quiero componer brazos reemplazables (servidor/backend/frontend) con un contrato común, para enchufar un framework nuevo sin modificar el motor.
- Como **bot de QA**, quiero inspeccionar el plan con `--dry-run` sin escribir archivos, para validar la generación de forma no-interactiva.
- Como **desarrollador**, quiero que la generación sea determinista y offline, para que el mismo input produzca siempre el mismo proyecto.

## 4. Criterios de aceptación

Formato Given/When/Then. Deben ser verificables automáticamente.

### AC-1: Unidad de plantilla declarativa
- **Dado** el productor de contenido de un artefacto
- **Cuando** un brazo lo incluye en su plan
- **Entonces** se expresa como un `TemplateFile` con `path` relativo POSIX, `contents`, y opcionalmente `mode` y `when`
- **Y** un test de tipos (`*.test-d.ts`) valida la forma del contrato.

### AC-2: Plan determinista y ordenado
- **Dado** el mismo contexto de generación
- **Cuando** se llama a `renderPlan(arms, ctx)` dos veces
- **Entonces** produce planes byte-idénticos, con los paths ordenados POSIX y sin duplicados
- **Y** un snapshot del plan es estable y funciona como fuente de verdad.

### AC-3: Render puro, escritura aislada
- **Dado** un conjunto de brazos y un contexto
- **Cuando** se llama a `renderPlan` sin `writePlan`
- **Entonces** no se escribe en disco ni se accede a la red
- **Y** toda la E/S ocurre únicamente en `writePlan` (verificable con un espía de `fs` o un tempdir que queda vacío tras el render).

### AC-4: Validación de rutas seguras
- **Dado** un plan con un `path` que contiene `..`, es absoluto o escapa del root de destino
- **Cuando** se llama a `writePlan(plan, root)`
- **Entonces** falla con un error explícito y no escribe ningún archivo
- **Y** hay un test por cada caso (`..`, absoluto, path duplicado).

### AC-5: Directorios y permisos
- **Dado** un `TemplateFile` con `mode` ejecutable (p. ej. `artisan`) en un subdirectorio
- **Cuando** `writePlan` escribe el plan
- **Entonces** crea los directorios intermedios y aplica el `chmod` indicado por `mode`
- **Y** un test verifica el bit de ejecución resultante.

### AC-6: Emisión condicional (`when`)
- **Dado** un `TemplateFile` con `when: false`
- **Cuando** se renderiza el plan
- **Entonces** el archivo no aparece en el plan ni en disco
- **Y** con `when: true` o ausente, el archivo sí se emite.

### AC-7: Tres brazos reemplazables con contrato
- **Dado** el motor de generación
- **Cuando** se componen los brazos de un target
- **Entonces** existen tres brazos con contrato común `render(ctx): TemplatePlan` — **servidor** (artefactos de deploy, agnósticos), **backend** (`backend-full`) y **frontend** (`frontend-static`) — alineados con el `DeployTarget` del contrato de adapter y con los brazos del wizard v2
- **Y** reemplazar un brazo por otro (p. ej. un brazo falso en un test) no requiere cambios en el core.

### AC-8: Motor agnóstico (Art. II)
- **Dado** el motor implementado en `@fractal/core`
- **Cuando** corre `scripts/lint-coupling.js`
- **Entonces** el motor no contiene términos de framework (lista prohibida de ADR-0002) y los stubs específicos siguen en `packages/adapter-*`
- **Y** el lint de acoplamiento pasa.

### AC-9: Versionado del contrato
- **Dado** un brazo que declara una `contractVersion`
- **Cuando** el motor compone brazos con una versión incompatible
- **Entonces** falla con un error claro de versión
- **Y** la versión del motor se mantiene alineada con `AdapterContractVersion`.

### AC-10: Migración de `adapter-laravel` sin cambiar la salida
- **Dado** `adapter-laravel` refactorizado sobre el motor
- **Cuando** se genera cada topología (`monolith`, `monorepo`, `multirepo`)
- **Entonces** el árbol generado es byte-idéntico al actual (el snapshot `create-project.tree.test.ts` no cambia)
- **Y** el e2e de Laravel existente sigue en verde (el proyecto bootea).

### AC-11: Inspección del plan (`--dry-run`)
- **Dado** `fractal new ... --dry-run` (o la API equivalente)
- **Cuando** se ejecuta
- **Entonces** imprime el plan (paths y metadatos) sin escribir en disco
- **Y** el exit code es 0.

## 5. Fuera de alcance

- La **generación por entidad desde el FDL** (SPEC-0008 y siguientes): el motor es el sustrato, no las plantillas de entidad.
- Un **lenguaje/DSL de plantillas nuevo** (Handlebars/EJS/Mustache): se descarta por ADR-0014 (determinismo, offline) y por simplicidad; las plantillas siguen siendo funciones TS tipadas.
- El **adapter Rails real** (M4): Rails sigue como placeholder; el motor debe permitir enchufarlo sin cambios en el core, pero este spec no lo implementa.
- `fractal module` y los **módulos del proyecto generado** (Art. IX.B / M5).
- Cambiar el **contenido de los stubs** existentes o las versiones de framework.
- Marcar este spec como **Implementado** (lo decide Diego al cumplirse la DoD).

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| SPEC-0032 (wizard v2, brazos modulares) | Bloqueante | Aprobado (gate satisfecho) |
| SPEC-0006 (contrato adapter v0) | Bloqueante | Implementado |
| SPEC-0001 (`fractal new` base) | Bloqueante | Implementado |
| ADR-0014 (stubs versionados en el adapter) | Bloqueante | Aprobado |
| ADR-0016 (wizard v2 / brazos) | Blanda | Aprobado |
| SPEC-0002 (bridge Node) | Blanda | Implementado |

## 7. Consideraciones técnicas

- **Rendimiento:** el plan se arma en memoria y se escribe en una sola pasada; sin red (offline-first, protege el TTP).
- **Seguridad:** validación de rutas (sin `..`, sin paths absolutos, sin escapar del root); el motor no ejecuta contenido; la aleatoriedad (p. ej. contraseñas) viene del contexto del wizard, no del motor.
- **Compatibilidad / Art. II:** el motor vive en `@fractal/core` sin términos de framework (pasa `scripts/lint-coupling.js`); los stubs específicos quedan en `packages/adapter-*`. La `contractVersion` del motor se alinea con `AdapterContractVersion`.
- **Snapshots (Art. X / ADR-0014):** el plan es la fuente de verdad; se reutiliza y extiende `create-project.tree.test.ts`, y cada brazo snapshotea su propio plan. Un brazo o stub sin test no mergea.
- **Forma propuesta del contrato** (indicativa, sujeta a §8):
  - `TemplateFile { path: string; contents: string; mode?: number; when?: boolean }`
  - `TemplatePlan = TemplateFile[]`
  - `GenerationArm { id: string; target: 'server' | 'backend' | 'frontend'; contractVersion: AdapterContractVersion; render(ctx: GenerationContext): TemplatePlan }`
  - `renderPlan(arms, ctx): TemplatePlan` (puro) · `writePlan(plan, root): Promise<void>` (única E/S)

## 8. Preguntas abiertas

- [ ] ¿El motor soporta además plantillas basadas en archivo (`.stub` con interpolación de variables) o solo funciones TS? (Default propuesto: solo funciones; los archivos quedan para una iteración futura si aparece la necesidad.)
- [ ] `writePlan` sobre un directorio de destino no vacío: ¿falla siempre, o permite merge con allowlist? (Default propuesto: falla, consistente con el contrato actual que exige destino vacío.)
- [ ] ¿El brazo **servidor** vive en `@fractal/deploy` y se expone hacia el motor, o se mueve su generación al motor en core? (Decisión de arquitectura → Diego, PO.)

## 9. Definition of Done

- [ ] Spec aprobada por Diego (pasa de "En revisión" a "Aprobado")
- [ ] Todos los criterios de aceptación (AC-1..AC-11) verificables con test automatizado
- [ ] Tickets de implementación creados en Linear (estado Todo) con dependencias declaradas (`blockedBy`)
- [ ] (Al implementar) El lint de acoplamiento (Art. II) pasa
- [ ] (Al implementar) Tests unitarios + snapshot del plan + e2e en verde; el tree snapshot de `adapter-laravel` no cambia (misma salida)
- [ ] (Al implementar) Documentación de usuario/dev actualizada (cómo escribir un brazo y una plantilla)
- [ ] (Al implementar) `docs/progress.json` y `docs/MAPA_DE_PROGRESO.md` sincronizados vía `fractal status --write`
- [ ] Este spec marcado como Implementado (al cumplirse la DoD completa)

## 9.1 Trazabilidad (AC → ticket)

Los números FRA son provisionales, a confirmar al crear los tickets en Linear.

| AC | Cubre | Ticket (prov.) |
|---|---|---|
| AC-1 | Tipos y contrato del plan (`TemplateFile`/`TemplatePlan`/`GenerationArm`) | FRA-95 |
| AC-2, AC-3, AC-6 | `renderPlan` puro, determinismo/orden y emisión condicional | FRA-96 |
| AC-4, AC-5 | `writePlan`: validación de rutas, directorios y permisos | FRA-97 |
| AC-9 | Versionado del contrato del motor | FRA-99 |
| AC-7 | Tres brazos con contrato (servidor/backend/frontend) + registro | FRA-98 |
| AC-10, AC-8 | Migración de `adapter-laravel` sin cambiar la salida + lint de acoplamiento | FRA-100 |
| AC-11 | `--dry-run` / inspección del plan | FRA-101 |
