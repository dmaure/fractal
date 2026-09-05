# Proceso de Desarrollo

Cómo se trabaja en Fractal. Leer antes del primer PR.

---

## Estructura del repositorio

```
fractal/
├── docs/
│   ├── CONSTITUTION.md    Principios innegociables
│   ├── VISION.md          Qué construimos y para quién
│   ├── ROADMAP.md         En qué orden
│   ├── PROCESO.md         Este documento
│   ├── specs/             Una especificación por capability
│   ├── adr/               Decisiones técnicas
│   └── templates/         Plantillas
├── packages/
│   ├── core/              CLI, FDL, orquestación. Agnóstico.
│   ├── adapter-laravel/   Stubs y lógica PHP/Laravel
│   ├── adapter-rails/     Stubs y lógica Ruby/Rails
│   └── deploy/            Provisioning y CI/CD. Agnóstico.
└── .github/
```

---

## El ciclo de trabajo

```
1. SPEC    → Especificación. Qué y por qué.
2. ADR     → Decisiones técnicas, si hay alternativas viables.
3. PLAN    → Diseño técnico. Cómo. Puede vivir en el PR.
4. TASKS   → Descomposición en issues.
5. CODE    → Implementación en rama.
6. PR      → Revisión contra el spec.
7. MERGE   → Deploy automático.
```

**Regla dura:** no se abre rama de implementación sin un spec en estado Aprobado.

---

## Numeración

Specs y ADRs usan numeración correlativa de cuatro dígitos, asignada al crear el
archivo. Nunca se reutiliza un número, ni aunque el documento se descarte.

---

## Ramas

| Rama | Propósito |
|---|---|
| `main` | Código estable, listo para release |
| `production` | Lo desplegado. Merge dispara deploy |
| `feature/NNNN-nombre` | Implementación de un spec |
| `fix/descripcion` | Corrección |
| `docs/descripcion` | Solo documentación |

El número de la rama es el del spec que implementa.

---

## Resolución de conflictos: rebase, nunca merge de la base hacia la rama

Si una rama de ticket queda desactualizada respecto a su base (`master`) —
porque otro PR se mergeó mientras esta seguía abierta — se actualiza con
**`git rebase`**, nunca con `git merge master` hacia la rama del ticket.

- La rama de un PR debe contener **únicamente** los commits del ticket que
  implementa. Nunca un commit de "merge master" ni el historial de otro
  ticket mezclado adentro.
- Rebase reaplica los commits del ticket sobre la punta actual de la base,
  sin generar un commit de merge — la rama queda como si el trabajo se
  hubiera hecho directamente sobre el `master` de hoy.
- Requiere `git push --force-with-lease` a la rama del ticket (nunca a
  `master`, que no se toca). Es seguro porque son ramas de un solo ticket,
  sin nadie más trabajando encima.
- Después de resolver conflictos vía rebase, correr tests + build + lint de
  acoplamiento antes de pushear — no alcanza con que `git` no marque
  conflictos, el resultado tiene que compilar y pasar tests.

**Por qué:** el 2026-09-05, una rama con conflictos reales se resolvió con
`git merge master`, dejando un commit de merge visible en el historial de
la rama y en el PR. Funcionaba (los tests pasaban y `master` quedaba limpio
igual si el merge del PR usa squash), pero ensuciaba innecesariamente la
rama y el PR mientras estaba en revisión. Regla adoptada a partir de ahí.

**Nota:** el fix del bug de concurrencia (ver `ARCHITECTURE_WORKFLOW.md`,
sección 6.1) debería evitar que esto haga falta seguido — una rama nueva ya
no debería crearse mientras otro ticket sigue sin mergear. Esta regla es la
red de seguridad para cuando sí haga falta, no el mecanismo principal.

---

## Commits

Conventional Commits:

```
feat(deploy): agregar provisioning de Docker
fix(core): corregir parseo de relaciones en FDL
docs(spec): aprobar SPEC-0003
refactor(adapter-laravel): extraer lógica común de controllers
test(e2e): agregar caso de deploy idempotente
```

Scopes válidos: `core`, `adapter-laravel`, `adapter-rails`, `deploy`, `docs`, `ci`, `e2e`.

---

## Pull Requests

Todo PR declara en su descripción:

```markdown
## Spec
SPEC-XXXX

## Criterios de aceptación cubiertos
- [x] AC-1
- [x] AC-2
- [ ] AC-3 (diferido a #123)

## ADRs creados
- ADR-XXXX

## Checklist
- [ ] Lint de acoplamiento pasa (sin términos de framework en core)
- [ ] Snapshots actualizados
- [ ] Test e2e pasa
- [ ] Documentación de usuario actualizada
- [ ] Spec actualizado si el código divergió
```

---

## Definition of Done global

Una capability está terminada cuando:

1. Todos sus criterios de aceptación tienen test automatizado
2. Los snapshots de sus stubs están actualizados y revisados
3. El test end-to-end pasa en todos los targets afectados
4. El lint de acoplamiento pasa
5. La documentación de usuario existe
6. El spec está marcado como Implementado

---

## Etiquetas de issues

| Etiqueta | Uso |
|---|---|
| `spec:NNNN` | Vincula el issue a su especificación |
| `type:feat` / `type:fix` / `type:docs` | Naturaleza del trabajo |
| `area:core` / `area:adapter-laravel` / `area:adapter-rails` / `area:deploy` | Zona del código |
| `milestone:MN` | Milestone del roadmap |
| `blocked` | Esperando dependencia |
| `good-first-issue` | Apto para contribuidores nuevos |

---

## Uso de agentes de IA

El proyecto usa asistentes de código. Reglas:

1. El spec es el contrato. El agente implementa contra el spec, no contra un prompt suelto.
2. Toda salida de un agente pasa por revisión humana antes del merge.
3. Si el agente propone una decisión técnica no contemplada, se detiene y se escribe un ADR.
4. `CONSTITUTION.md` y el spec relevante se incluyen siempre en el contexto del agente.
5. Ningún agente modifica `packages/core` sin verificación explícita del Artículo II.

---

## Cadencia

| Frecuencia | Actividad |
|---|---|
| Por feature | Escribir spec, implementar, mergear |
| Semanal | Revisar roadmap y reordenar prioridades |
| Mensual | Verificar que los specs implementados reflejen el código real |
| Trimestral | Revisar visión y constitución |
