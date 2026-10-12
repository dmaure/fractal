# SPEC-0005: Parser y validador de FDL — absorbido en SPEC-0004

**Estado:** Absorbido en SPEC-0004
**Autor:** Diego
**Fecha:** 2026-10-12
**Issue:** FRA-63

---

> Nota de disposición (cierre documental del módulo FDL, FRA-63). Este documento
> existe para dejar explícito **qué pasó con SPEC-0005**. No es un spec
> independiente y no declara criterios de aceptación propios: su alcance se
> definió e implementó bajo **SPEC-0004**.

## Qué iba a ser SPEC-0005

El roadmap y SPEC-0004 preveían SPEC-0005 como el spec del **parser y validador**
de FDL: tomar un documento JSON con el shape de SPEC-0004 §7, parsearlo a una IR
tipada, aplicar las reglas de validación VR-1..VR-12 (SPEC-0004 §8) y emitir
diagnósticos legibles.

## Qué pasó

SPEC-0005 **nunca se redactó como spec independiente**. Su alcance quedó
**absorbido en SPEC-0004**, cuya descomposición en tickets (§10) ya incluía esas
tareas, y se ejecutaron bajo el módulo FDL:

| Tarea (SPEC-0004 §10) | Ticket | PR | Qué entregó |
|---|---|---|---|
| T2 — Parser JSON → IR tipada | FRA-57 | #68 | Parser en `packages/core` |
| T3 — Validador semántico VR-1..VR-12 | FRA-58 | #69 | Un chequeo por regla, con test positivo y negativo |
| T4 — Diagnósticos legibles | FRA-59 | #70 | Mensajes localizados por entidad/campo/relación |
| T5 — Tests y fixtures del lenguaje | FRA-60 | #71 | Fixtures válidas/inválidas y snapshots |

El estado de estas tareas se trazó en `docs/progress.json` bajo `SPEC-0004`
(T2..T5, todas `completado`); por eso `progress.json` no tiene una entrada
`SPEC-0005` separada.

## Referencias

- Alcance y reglas del lenguaje: SPEC-0004 §7–§8.
- Descomposición y trazabilidad: SPEC-0004 §10 y §11.
- Evidencia de criterios de aceptación: SPEC-0004 §11.1.

> El estado formal de la cadena FDL (marcar SPEC-0004 como **Implementado**) es
> decisión de Diego (Artículo XI); esta nota no lo anticipa.
