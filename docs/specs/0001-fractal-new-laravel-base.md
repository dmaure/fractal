# SPEC-0001: `fractal new` genera proyecto Laravel base

**Estado:** Implementado
**Autor:** Diego
**Fecha:** 2026-08-09
**Última revisión:** 2026-10-26 (FRA-81) — **cierre documental**: decisión de
Diego (PO, 2026-10-26 ART). Todas las tareas de SPEC-0001 en
`docs/progress.json` están `completado` (FRA-29 git por topología, FRA-54
wiring al adapter, FRA-77 wizard). El e2e real `fractal new` + `fractal deploy`
está mergeado (FRA-73 #87, FRA-76 #88) y Fractal QA post-merge #93 dio **PASS**
en master `2df1d60` (VPS Vultr efímero + `codigofractal.dev`; caveats: §5 DNS
box retry, §7 SKIPPED sin `gh`; bug aparte FRA-80, no bloquea este cierre).
La Definition of Done del §9 se cumple (evidencia en §9.1). Pasa de Aprobado a
**Implementado**. Revisión previa 2026-10-23 — sigue en **Aprobado**. FRA-77
agrega el wizard de valores no-defaultables (AC-12) y la creación opcional del
remoto GitHub; no se marca Implementado. Revisión previa 2026-09-27 — el M1
mergeado (PRs #41/#42/#44, tickets FRA-37/FRA-38/FRA-36) completa el lado de
deploy (SPEC-0003), no `fractal new`; la implementación de `fractal new` y sus
tests viven en `packages/core` (`commands/new.test.ts`,
`utils/directory-validator`, `utils/git-initializer`,
`utils/manifest-generator`), pero la DoD del §9 todavía no se puede verificar
entera (falta documentación de usuario, e2e y el marcado como Implementado).
No se marca Implementado. Revisión previa 2026-08-26 — resueltas las 3
preguntas abiertas que había dejado la reapertura del 2026-08-16 (ADR-0010:
topología; ADR-0012: manifiesto multirepo). Vuelve a Aprobado.
**Issue:** #

---

## 1. Objetivo

Permitir que un usuario obtenga, con un solo comando, un proyecto Laravel
nuevo con la arquitectura en capas de Fractal ya configurada, listo para
desarrollar.

---

## 2. Motivación

Iniciar un proyecto Laravel implica repetir instalación, configuración de
estructura en capas y convenciones de organización cada vez. Ese trabajo no
tiene valor de negocio y consume tiempo antes de escribir la primera línea
de lógica real.

Este comando es el primer paso concreto hacia el objetivo de TTP < 30 min
(Artículo I): sin un `new` que funcione, no hay nada que desplegar después.

---

## 3. Historias de usuario

- Como **desarrollador**, quiero ejecutar `fractal new mi-proyecto` y tener
  un proyecto Laravel funcional, sin configurar la estructura en capas a
  mano.
- Como **desarrollador**, quiero que el CLI me pregunte solo lo esencial y
  complete el resto con defaults sensatos, para no bloquearme en decisiones
  que no me importan todavía.
- Como **desarrollador** que necesita separar el deploy del frontend y del
  backend, quiero elegir una topología de monorepo desacoplado o multirepo
  al crear el proyecto, en vez de reestructurarlo a mano después
  (ADR-0010).
- Como **desarrollador**, quiero que el proyecto generado corra localmente
  de inmediato, para verificar que todo funciona antes de seguir.

---

## 4. Criterios de aceptación

### AC-1: Comando mínimo
- **Dado** que tengo Node.js, PHP y Composer instalados
- **Cuando** ejecuto `npx fractal new mi-proyecto` sin flags adicionales
- **Entonces** el CLI no pregunta nada más allá de lo estrictamente
  necesario (target, si no hay uno único todavía, y topología de proyecto)
  y genera el proyecto; responder Enter a la pregunta de topología aplica el
  default (monolito) sin bloquear el flujo (Artículo IV)

### AC-2: Estructura en capas
- **Dado** que elegí Laravel como target (único disponible en v1)
- **Cuando** el comando termina
- **Entonces** el proyecto generado sigue la estructura en capas que define
  el contrato del adapter (SPEC-0006) para la topología elegida (AC-10,
  AC-11), reconocible como Laravel idiomático por un desarrollador Laravel
  (Artículo III)

### AC-3: Proyecto autónomo
- **Dado** que el proyecto fue generado
- **Cuando** reviso sus dependencias de runtime
- **Entonces** no tiene ninguna dependencia de Fractal — corre solo con las
  herramientas estándar de Laravel (Artículo V)

### AC-4: Corre localmente
- **Dado** que el proyecto fue generado
- **Cuando** sigo las instrucciones que el CLI imprime al terminar
- **Entonces** la aplicación levanta localmente sin errores

### AC-5: Sin secrets comprometidos
- **Dado** que el proyecto fue generado
- **Cuando** reviso el repositorio resultante
- **Entonces** no contiene ninguna credencial real ni un `APP_KEY` capaz de
  llegar a producción (Artículo VI); `.env` está en `.gitignore` desde el
  primer commit

### AC-6: Git inicializado
- **Dado** que el comando termina exitosamente
- **Cuando** reviso la carpeta del proyecto
- **Entonces**, en topología monolito o monorepo desacoplado, la carpeta es
  un único repositorio git con un commit inicial, listo para conectar a un
  remoto; en topología multirepo, existen dos repositorios git
  independientes (`api/` y `web/`), cada uno con su propio commit inicial
  (ver AC-11)

### AC-7: Tiempo de ejecución acotado
- **Dado** que el comando corre en condiciones normales de red
- **Cuando** mido el tiempo entre invocación y finalización, sin contar el
  tiempo que el usuario tarda en responder los prompts
- **Entonces** termina en menos de **5 minutos** en topología monolito, o
  **7 minutos** en monorepo desacoplado o multirepo — el margen extra
  compensa el `npm install` del SPA además del `composer install` del
  backend (decidido 2026-08-26)

### AC-8: Directorio destino existente
- **Dado** que el directorio destino ya existe
- **Cuando** ejecuto `fractal new` apuntando a ese directorio
- **Entonces** el comando aborta con un mensaje claro y no modifica nada,
  salvo que el directorio esté vacío o contenga únicamente un `.git` sin
  historia (repo recién clonado vacío), en cuyo caso continúa con
  normalidad

### AC-9: Override explícito
- **Dado** que quiero forzar la generación sobre un directorio no vacío
- **Cuando** ejecuto `fractal new` con el flag `--force`
- **Entonces** el comando procede sin abortar — comportamiento avanzado,
  nunca el default (Artículo IV)

### AC-10: Selección de topología
- **Dado** que ejecuto `fractal new mi-proyecto`
- **Cuando** el CLI llega a la pregunta de topología
- **Entonces** ofrece tres opciones — **monolito** (default), **monorepo
  desacoplado**, **multirepo** — con una línea de descripción de cada una;
  también puede fijarse sin prompt con `--topology=<monolith|monorepo|multirepo>`
  (ADR-0010)

### AC-11: Estructura según topología
- **Dado** que terminó la generación
- **Cuando** reviso la carpeta del proyecto
- **Entonces**:
  - **Monolito:** un repo, sin packages separados; el SPA (React + Vite)
    vive en `resources/js` y consume rutas bajo `/api` del mismo Laravel
    (ADR-0005, ADR-0010)
  - **Monorepo desacoplado:** un repo con `api/` (Laravel) y `web/` (SPA
    Vite) como packages, `turbo.json` en la raíz, `turbo` instalado como
    devDependency real del `package.json` raíz (no solo el archivo de
    config — sin el paquete, `turbo run` no funciona), y scripts de raíz
    para correr ambos en paralelo en desarrollo
  - **Multirepo:** dos carpetas de proyecto, `mi-proyecto-api/` y
    `mi-proyecto-web/`, cada una su propio repositorio git (AC-6); cada
    carpeta incluye además un manifiesto `fractal.project.yml` (`role: api`
    o `role: web`, `sibling.git_url` y `sibling.domain` en `null`,
    `orchestration_state: pending`) que `fractal deploy` completa en su
    primera ejecución para coordinar las variables cruzadas entre ambos
    repos (ADR-0012)

### AC-12: Wizard de valores no-defaultables (FRA-77)
- **Dado** que ejecuto `fractal new` en una terminal interactiva (TTY)
- **Cuando** el CLI recolecta datos
- **Entonces** pregunta los valores user-specific que no pueden tener
  default: nombre, topología, IP del servidor, usuario y clave SSH,
  dominio, email SSL, proveedor DNS y su token, token de GitHub para
  crear el remoto, y contraseña de la base (preguntar o generar)
- **Y** el mismo set es pasable por flag y/o variables `FRACTAL_NEW_*`
  (con fallback a `FRACTAL_DEPLOY_*` cuando el valor es el mismo) vía
  `--non-interactive`
- **Y** con token de GitHub crea el repo remoto, pushea el commit
  inicial y setea o imprime los secrets del workflow, incluyendo
  `SSH_KNOWN_HOSTS`
- **Y** no escribe un `.env` local que pueda pisar `/home/deploy/.env`
  en el VPS
- **Y** en no-TTY sin `--non-interactive` conserva la generación
  mínima (nombre + topología) para no romper CI
- **Nota:** no se finge soporte de passphrase SSH ni de ssh-agent; esos
  gaps quedan documentados. Route53 sigue sin implementar.

---

## 5. Fuera de alcance

- Ruby on Rails como target (M4)
- Generación de entidades y CRUD (M2)
- Autenticación, roles y permisos (M3)
- Deploy a VPS (SPEC-0003) — incluye coordinar el deploy de dos repos en
  multirepo, todavía sin resolver ahí tampoco
- Instalación de módulos opcionales (M5)
- Creación de remotos GitLab (el wizard de FRA-77 cubre GitHub cuando
  hay token; GitLab sigue a mano)
- Encadenar `fractal deploy` en topología multirepo (hay que correrlo
  una vez en cada repo)

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0001 (CLI híbrido Node) | Bloqueante | Aceptado |
| ADR-0002 (arquitectura multi-target) | Bloqueante | Aceptado |
| ADR-0005 (frontend Laravel: React + Vite + Sanctum Bearer) | Bloqueante | Aceptado |
| ADR-0010 (topología del proyecto generado) | Bloqueante | Aceptado |
| ADR-0012 (deploy multirepo: coordinación en el primer deploy) | Blanda | Aceptado |
| SPEC-0002 (bridge Node → toolchain) | Bloqueante | Implementado |
| SPEC-0006 (contrato del adapter v0) | Blanda | Implementado |

---

## 7. Consideraciones técnicas

**Rendimiento**
- 5 minutos surge de repartir el presupuesto de TTP < 30 min: SPEC-0003 ya
  fija el provisioning completo en < 15 min, y `fractal new` es la parte más
  controlable de lo que queda (no depende de propagación DNS ni de paneles
  de terceros). Deja 10 minutos de colchón para todo lo manual que el CLI
  no controla.

**Seguridad**
- Ninguna credencial de ejemplo capaz de llegar a producción (Artículo VI)
- `APP_KEY` y cualquier secret se generan localmente, nunca se commitean

**Compatibilidad**
- Laravel LTS vigente (VISION.md sección 6)
- La validación de versión mínima de PHP/Composer **no es responsabilidad
  de este spec**. Por Artículo II, el core no puede saber que Laravel
  necesita PHP 8.2+ o Composer 2.x — ese umbral es conocimiento del
  framework. `adapter-laravel` declara la versión mínima requerida a través
  del contrato de adapter (SPEC-0006), y el mecanismo genérico de detección
  de binario ausente **o insuficiente** vive en SPEC-0002 (AC-4).

---

## 8. Preguntas abiertas

Ninguna pendiente.

Las tres preguntas originales se resolvieron el 2026-08-09 (tiempo de
ejecución → AC-7, validación de PHP/Composer → delegada a SPEC-0002 +
SPEC-0006, directorio destino existente → AC-8 y AC-9).

Reabierto el 2026-08-16 por ADR-0010 con tres preguntas nuevas, resueltas
el 2026-08-26:

- Creación de remotos en GitHub → FRA-77 (AC-12): con token se crea el
  remoto, se pushea y se setean secrets. GitLab sigue fuera de alcance.
- Turborepo → se instala como devDependency real del proyecto generado,
  no solo el archivo `turbo.json` (ver AC-11).
- AC-7 por topología → diferenciado: 5 min monolito, 7 min
  monorepo/multirepo (ver AC-7).

La coordinación entre repos en multirepo (ADR-0012) sigue completando
dominio del hermano en el primer `fractal deploy`. FRA-77 puede crear los
remotos GitHub si hay token; el manifiesto se sigue generando con
`orchestration_state: pending` hasta ese deploy.

---

## 9. Definition of Done

- [x] Todos los criterios de aceptación tienen test automatizado
  — AC-1..AC-12, ver mapeo de evidencia en §9.1. AC-7 (presupuesto de 5/7 min)
  no tiene aserción unitaria de wall-clock; se cubre operativamente por el e2e
  real FRA-73/76 y el QA PASS en Vultr, no por un test inventado.
- [x] Tests de snapshot de los stubs actualizados
  — `packages/adapter-laravel/src/commands/__snapshots__/create-project.tree.test.ts.snap`
  (estructura de las tres topologías, FRA-53).
- [x] Test end-to-end pasa
  — `packages/core/src/commands/e2e-new.test.ts` (flujo con stubs de
  php/composer, FRA-54), `packages/adapter-laravel/src/e2e/laravel.test.ts`
  (php/composer reales en CI) y `.github/workflows/deploy-e2e.yml`
  (`fractal new` + `fractal deploy` contra VPS efímero, FRA-73 #87 /
  FRA-76 #88). QA PASS post-merge #93 en master `2df1d60`.
- [x] Documentación de usuario escrita
  — `docs/guides/fractal-new.md` (FRA-55, actualizada en FRA-77).
- [x] ADRs asociados creados si hubo decisiones técnicas
  — ADR-0005, ADR-0010, ADR-0012 (topología y manifiesto multirepo);
  ADR-0014 (stubs Laravel versionados).
- [x] Este spec marcado como Implementado — ver cabecera (2026-10-26, FRA-81,
  decisión de Diego).

---

## 9.1 Cierre — mapeo de evidencia (FRA-81)

Cada criterio de aceptación del §4 queda cubierto por código y tests mergeados
en `master`. Verificado contra el código y contra el QA PASS de #93, no solo
contra mensajes de commit.

| AC | Qué exige | Evidencia (código + tests) | Tickets / PRs |
|---|---|---|---|
| **AC-1** — comando mínimo | `fractal new` pregunta solo lo esencial y genera el proyecto | `packages/core/src/commands/new.ts`; tests `new.test.ts`; wizard no-TTY conserva generación mínima (FRA-77) | FRA-54, FRA-77 (#89) |
| **AC-2** — estructura en capas | Árbol idiomático según contrato del adapter y topología | Generadores `monolith`/`monorepo`/`multirepo` en `adapter-laravel`; snapshots `create-project.tree.test.ts.snap` | FRA-42, FRA-52, FRA-53, FRA-54 |
| **AC-3** — proyecto autónomo | Sin dependencia de runtime de Fractal | Proyecto generado solo con toolchain del target; e2e Laravel arranca sin el CLI | FRA-52, e2e-laravel en CI |
| **AC-4** — corre localmente | La app levanta siguiendo las instrucciones del CLI | `packages/adapter-laravel/src/e2e/laravel.test.ts` (php/composer reales) | FRA-52, job `e2e-laravel` |
| **AC-5** — sin secrets comprometidos | `.env` en `.gitignore`; sin `APP_KEY` de producción en el repo | `git-initializer.test.ts` (`.env` en gitignore); e2e-new verifica `.gitignore`; `APP_KEY` se genera en el VPS (contrato de deploy) | FRA-29, FRA-54, FRA-76 |
| **AC-6** — git inicializado | Un repo (monolito/monorepo) o dos (multirepo), con commit inicial | `packages/core/src/utils/git-initializer.ts` + tests | FRA-29 |
| **AC-7** — tiempo acotado | < 5 min monolito / < 7 min monorepo o multirepo | Sin aserción unitaria de wall-clock. El e2e real FRA-73/76 + QA PASS en Vultr cubre el presupuesto en condiciones reales | FRA-73 (#87), FRA-76 (#88), QA #93 |
| **AC-8** — directorio existente | Aborta si el destino no está vacío (salvo `.git` vacío) | `packages/core/src/utils/directory-validator.ts` + tests | FRA-29 / `new.test.ts` |
| **AC-9** — `--force` | Override explícito sobre directorio no vacío | Flag `--force` en `new.ts` y tests de `new.test.ts` | FRA-29 |
| **AC-10** — selección de topología | Monolito (default), monorepo, multirepo; flag `--topology` | Wizard + `--topology` en `new.ts` / `new-wizard.ts`; tests `new.test.ts`, `new-wizard.test.ts` | FRA-54, FRA-77 |
| **AC-11** — estructura según topología | Monolito / monorepo (`turbo` real) / multirepo con manifiesto | Snapshots por topología; `manifest-generator.ts` (`orchestration_state: pending`) | FRA-53, FRA-54 |
| **AC-12** — wizard no-defaultables | Prompts / flags / `FRACTAL_NEW_*`; GitHub remoto; sin `.env` local | `packages/core/src/utils/new-wizard.ts` + `new-wizard.test.ts`; `github-repo.test.ts`; FRA-76 no escribe `.env` local que pise el VPS | FRA-77 (#89), FRA-76 (#88) |
