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
