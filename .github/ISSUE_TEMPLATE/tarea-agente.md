---
name: Tarea para agente
about: Issue diseñado para ser resuelto por un agente de código (Cursor u otro), vinculado a un spec aprobado.
title: "[spec:NNNN] "
labels: ["type:feat"]
assignees: ""
---

<!--
Antes de crear esta issue: el spec referenciado debe estar en estado
Aprobado (docs/specs/). Ver docs/AGENT_PLAYBOOK.md y
.cursor/rules/fractal.mdc antes de empezar a trabajar.
-->

## Spec

SPEC-XXXX

## Contexto

<!-- Qué parte del spec cubre esta tarea. Por qué se descompuso así. -->

## Criterios de aceptación a cubrir

<!-- Copiar de la sección 4 del spec solo los AC que corresponden a esta tarea -->

- [ ] AC-1
- [ ] AC-2

## Fuera de alcance de esta tarea

<!-- Qué parte del spec NO cubre esta issue, aunque esté relacionada -->

## Checklist antes de abrir PR

- [ ] Lint de acoplamiento pasa (sin términos de framework fuera de `packages/adapter-*`)
- [ ] Snapshots de stubs actualizados
- [ ] Test e2e pasa
- [ ] Documentación de usuario actualizada
- [ ] Spec actualizado si el código divergió

## Etiquetas sugeridas

`spec:NNNN` · `type:feat` / `type:fix` / `type:docs` · `area:core` / `area:adapter-laravel` / `area:adapter-rails` / `area:deploy` · `milestone:MN`
