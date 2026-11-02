# SPEC-0032: Wizard v2 — code-first y brazos modulares

**Estado:** En revisión
**Autor:** Claude
**Fecha:** 2026-11-02
**ADR relacionado:** ADR-0016
**Issue:** —

---

## 1. Objetivo

`fractal new` genera primero el código (un proyecto local funcional sin pedir
datos de deploy) y organiza cada sección del wizard en brazos modulares
reemplazables, cada uno con un contrato claro de entrada/salida.

---

## 2. Motivación

Hoy `fractal new` recolecta todos los datos de forma lineal y asume el camino de
deploy: pide infraestructura (IP, SSH, DNS) antes de que el usuario vea una sola
línea de código. Esa fricción ahuyenta a quien solo quiere probar el generador en
local o trabaja sin un VPS propio.

El principio **code-first con deploy opcional** invierte el orden: el generador
entrega un proyecto local funcional en minutos y desplegar pasa a ser una
capacidad que el usuario elige activar, no un requisito. Esto reduce la fricción
inicial y mejora la adopción, y es un diferenciador frente a JHipster y
generadores similares — sin volver obligatorio el deploy, que sigue siendo un
diferenciador cuando el usuario lo elige.

Los **brazos modulares** son la idea fundacional del fractal: la misma estructura
se repite y cada brazo (una sección del wizard) tiene un contrato claro y es
reemplazable sin afectar al resto. Estructurar el wizard así evita que cada
capacidad nueva (otro proveedor de DNS, otro framework, otro tipo de base)
acople la lógica del wizard, y permite que el usuario salte secciones completas
según qué datos tenga.

Alinear el éxito con el camino elegido hace que la métrica primaria sea el
**TTS < 5 min** cuando el usuario omite el deploy, y el **TTP < 30 min** cuando lo
elige (CONSTITUTION Art. I, actualizado por ADR-0016).

Referencias: ADR-0016, VISION §4 (principios diferenciadores) y §5 (arquitectura
conceptual / metáfora de los brazos), CONSTITUTION Art. I (propósito, TTS/TTP) y
Art. IX (modularidad: IX.A brazos del wizard, IX.B módulos del proyecto generado).

---

## 3. Historias de usuario

- Como **desarrollador que solo quiere probar en local**, quiero generar el
  proyecto sin dar datos de servidor, para tenerlo corriendo en minutos.
- Como **desarrollador con servidor**, quiero desplegar al final del wizard,
  para publicar el proyecto en la misma corrida de `fractal new`.
- Como **desarrollador**, quiero crear el repositorio en GitHub sin
  necesariamente desplegar, para versionar el código aunque todavía no tenga
  infraestructura.
- Como **bot de QA**, quiero correr `fractal new` 100% no-interactivo con flags
  y variables de entorno, para automatizar la verificación sin un TTY.

---

## 4. Criterios de aceptación

Formato Given/When/Then. Deben ser verificables automáticamente.

### AC-1: Checklist inicial de datos disponibles
- **Dado** que ejecuto `fractal new` en una terminal interactiva
- **Cuando** el comando arranca
- **Entonces** lo primero que se presenta es un checklist que pregunta qué datos
  tiene el usuario — ¿tenés un servidor para desplegar?, ¿tenés un dominio y
  querés DNS automático?, ¿tenés un token de GitHub? — con respuestas del tipo
  sí / no / algunos (lo agrego después)
- **Y** las respuestas del checklist habilitan o saltean los brazos
  correspondientes (infraestructura, DNS, GitHub) antes de pedir sus datos

### AC-2: Code-first (orden del wizard)
- **Dado** que empecé el wizard y pasé el checklist inicial
- **Cuando** el wizard recolecta datos
- **Entonces** primero se piden los datos de código — nombre, framework,
  topología, base de datos, frontend (y FDL opcional) — y la infraestructura se
  pregunta al final, nunca antes del código (ADR-0016 §6)

### AC-3: Deploy opcional / proyecto local-only
- **Dado** que el usuario no tiene servidor (respondió "no" en el checklist) o
  saltea la sección de infraestructura
- **Cuando** el wizard termina
- **Entonces** `fractal new` genera un proyecto **solo local**, sin pedir datos
  de infraestructura y sin intentar desplegar
- **Y** el hand-off final muestra cómo correrlo en local (`cd <proyecto>` + los
  comandos de arranque local), sin ningún comando de deploy

### AC-4: Deploy disponible más tarde
- **Dado** que generé un proyecto local-only con `fractal new`
- **Cuando** más adelante consigo un servidor
- **Entonces** puedo desplegar ese proyecto con `fractal deploy`, sin tener que
  regenerarlo

### AC-5: GitHub opcional e independiente de la infraestructura
- **Dado** que el checklist trata GitHub como una sección propia, separada de la
  de infraestructura
- **Cuando** el usuario provee un token de GitHub
- **Entonces** el brazo de GitHub crea el repositorio remoto y setea los secrets,
  aun si el usuario no dio datos de servidor
- **Y** si el usuario no provee token, no se crea ningún repositorio remoto
- **Y** el token se lee de `FRACTAL_NEW_GITHUB_TOKEN` y **no** se toma de
  `GITHUB_TOKEN` (para no reutilizar por accidente un token del entorno de CI)

### AC-6: Selectores visibles aun con una sola opción
- **Dado** que un selector (framework, topología, base de datos, frontend) tiene
  hoy una sola opción disponible (p. ej. framework Laravel)
- **Cuando** el wizard llega a ese paso
- **Entonces** el selector se muestra igual, con su única opción, para comunicar
  que en el futuro habrá más (ADR-0016 §4). El checklist inicial de datos (AC-1)
  es la excepción: es un filtro de secciones, no un selector de opciones

### AC-7: Brazos del wizard con contrato
- **Dado** que el wizard se organiza en secciones (Código, Dominio,
  Infraestructura, GitHub, Base de datos)
- **Cuando** se ejecuta el wizard
- **Entonces** cada sección es un brazo modular con un contrato de entrada/salida,
  orquestado por el core, que puede habilitarse o deshabilitarse según el
  checklist y reemplazarse sin afectar a los demás brazos
- **Y** el core permanece agnóstico del framework: ningún brazo introduce
  terminología de framework en `packages/core` (CONSTITUTION Art. II)

### AC-8: Base de datos condicional al deploy
- **Dado** que la contraseña de la base solo tiene sentido cuando hay deploy
- **Cuando** el usuario no dio datos de deploy
- **Entonces** el wizard no pide ni genera contraseña de base de datos
- **Y** cuando sí hay datos de deploy, el brazo de base de datos ofrece
  generar-o-preguntar la contraseña, y no se crean secrets que no se vayan a usar

### AC-9: Paridad no-interactiva
- **Dado** que un bot de QA necesita correr `fractal new` sin TTY
- **Cuando** ejecuta el comando en modo no-interactivo
- **Entonces** cada valor del wizard v2 es pasable por flag y por variable de
  entorno, con la precedencia flag > `FRACTAL_NEW_*` > `FRACTAL_DEPLOY_*`
- **Y** el comando no requiere un TTY para completarse

### AC-10: TTS y TTP según el camino
- **Dado** que el usuario eligió un camino
- **Cuando** mido el tiempo del flujo
- **Entonces** en el camino local (sin deploy) el Time-to-Usable-Scaffold es
  **< 5 min**, y en el camino con deploy el Time-to-Production es **< 30 min**
  (CONSTITUTION Art. I)

### AC-11: Hand-off según el camino
- **Dado** que el wizard terminó
- **Cuando** se imprime el mensaje final
- **Entonces** se muestra el siguiente comando según el camino: `fractal deploy`
  cuando hay datos de deploy, o solo `cd <proyecto>` (más cómo correrlo en local)
  cuando el proyecto es local-only

---

## 5. Fuera de alcance

- El **motor de templating de stubs** (SPEC-0007, M2): está pausado hasta que el
  wizard v2 esté documentado y aprobado (ADR-0016). Este spec no lo toca.
- Los **módulos del proyecto generado** (CONSTITUTION Art. IX.B / ROADMAP M5 /
  `fractal module`): son otra cosa que los brazos del wizard; no se implementan acá.
- **Adapters o frameworks reales nuevos**: este spec solo exige que el selector
  de framework sea visible (AC-6); no implementa un segundo framework.
- **Marcar specs como Implementado**: este PR documenta el spec en estado "En
  revisión"; nada se marca Implementado.

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0016 (wizard v2: code-first y brazos modulares) | Bloqueante | Aprobado |
| SPEC-0001 (`fractal new` base) | Bloqueante | Implementado |
| Utilidades existentes `deploy-prompts.ts` / `github-repo.ts` | Blanda | Implementado |

---

## 7. Consideraciones técnicas

Restricciones conocidas, no diseño. El diseño va en el plan de implementación.

**Rendimiento**
- El camino local debe minimizar la cantidad de pasos para sostener el TTS < 5 min:
  nada de pedir datos que el proyecto local no necesita. Defaults sensatos en cada
  paso, de modo que responder Enter produzca un proyecto funcional
  (CONSTITUTION Art. IV).

**Seguridad**
- El token de GitHub y la contraseña de base de datos se manejan con cuidado: no se
  commitean, no se imprimen innecesariamente.
- No se inventan secrets sin uso: sin datos de deploy, no se genera contraseña de
  base ni se setean secrets (AC-8).
- `FRACTAL_NEW_GITHUB_TOKEN` es una variable separada de `GITHUB_TOKEN` (AC-5), para
  no reutilizar por accidente un token del entorno.

**Compatibilidad**
- CONSTITUTION Art. II: el core no puede contener términos de framework; cada brazo
  mantiene esa frontera y el lint de acoplamiento la verifica.
- Precedencia de flags/env estable y documentada: flag > `FRACTAL_NEW_*` >
  `FRACTAL_DEPLOY_*` (AC-9).
- Se preserva el modo `skip` / no-TTY existente para no romper CI ni los e2e: el
  comando sigue completándose sin TTY cuando se le pasan los valores.

**Contratos de brazo (ADR-0016)**

| Brazo | Responsabilidad | Entrada | Salida | ¿Obligatorio? |
|---|---|---|---|---|
| **Código** | Framework, topología, DB, frontend | Nombre del proyecto | Configuración base del proyecto | Sí |
| **Dominio (FDL)** | Entidades, campos, relaciones | Configuración base | IR de FDL (opcional) | No |
| **Infraestructura** | VPS, SSH, dominio, DNS | Sí / no / algunos | Datos de deploy o vacío | No |
| **GitHub** | Crear repo remoto + setear secrets | Sí / no + token | Repo creado + secrets, o vacío | No |
| **Base de datos** | Contraseña | — | Contraseña generada o ingresada | Condicional (solo si deploy) |

---

## 8. Preguntas abiertas

- [ ] Formato exacto del contrato de brazo: ¿una interface TypeScript que cada
  brazo implementa, o un registro declarativo de brazos que el core recorre?
- [ ] El checklist inicial, ¿se implementa como un único prompt multiselect o como
  una serie de preguntas sí/no separadas?
- [ ] Defaults por brazo: qué valor por defecto asume cada brazo cuando el usuario
  responde Enter, sin romper el camino feliz (Art. IV).

---

## 9. Definition of Done

- [ ] Spec aprobada por Diego (pasa de "En revisión" a "Aprobado")
- [ ] Todos los criterios de aceptación (AC-1..AC-11) son verificables con test
  automatizado
- [ ] Tickets de implementación creados (FRA-82..FRA-88)
- [ ] (Al implementar) El lint de acoplamiento pasa (sin términos de framework en core)
- [ ] (Al implementar) Tests + e2e en verde
- [ ] (Al implementar) Documentación de usuario actualizada
- [ ] (Al implementar) `docs/progress.json` y `MAPA_DE_PROGRESO.md` sincronizados
  vía `fractal status --write`

---

## 9.1 Trazabilidad (AC → ticket)

| AC | Cubre | Ticket |
|---|---|---|
| AC-7 | Contrato de brazo + orquestador modular en core | FRA-82 |
| AC-1 | Checklist inicial del wizard | FRA-83 |
| AC-2, AC-6 | Brazo Código: reorden code-first + selectores visibles | FRA-84 |
| AC-3, AC-4, AC-11 | Brazo Infraestructura opcional + local-only + hand-off | FRA-85 |
| AC-5 | Brazo GitHub opcional e independiente | FRA-86 |
| AC-8 | Brazo Base de datos (condicional) | FRA-87 |
| AC-9, AC-10 | Paridad no-interactiva + bot QA + TTS/hand-off + docs | FRA-88 |
