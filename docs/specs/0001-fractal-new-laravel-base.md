# SPEC-0001: `fractal new` genera proyecto Laravel base

**Estado:** Aprobado
**Autor:** Diego
**Fecha:** 2026-08-09
**Última revisión:** 2026-08-26 — resueltas las 3 preguntas abiertas que
había dejado la reapertura del 2026-08-16 (ADR-0010: topología; ADR-0012:
manifiesto multirepo). Vuelve a Aprobado.
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

---

## 5. Fuera de alcance

- Ruby on Rails como target (M4)
- Generación de entidades y CRUD (M2)
- Autenticación, roles y permisos (M3)
- Deploy a VPS (SPEC-0003) — incluye coordinar el deploy de dos repos en
  multirepo, todavía sin resolver ahí tampoco
- Instalación de módulos opcionales (M5)
- Creación de los repositorios remotos en GitHub/GitLab para la topología
  multirepo — el CLI inicializa git localmente (AC-6) pero no crea el
  remoto ni lo conecta; eso queda para el usuario o para SPEC-0003

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0001 (CLI híbrido Node) | Bloqueante | Aceptado |
| ADR-0002 (arquitectura multi-target) | Bloqueante | Aceptado |
| ADR-0005 (frontend Laravel: React + Vite + Sanctum Bearer) | Bloqueante | Aceptado |
| ADR-0010 (topología del proyecto generado) | Bloqueante | Aceptado |
| ADR-0012 (deploy multirepo: coordinación en el primer deploy) | Blanda | Aceptado |
| SPEC-0002 (bridge Node → toolchain) | Bloqueante | Aprobado |
| SPEC-0006 (contrato del adapter, no escrito aún) | Blanda | — |

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

- Creación de remotos en multirepo → confirmado fuera de alcance v1
  (sección 5): solo `git init` local, sin crear remoto en GitHub/GitLab.
- Turborepo → se instala como devDependency real del proyecto generado,
  no solo el archivo `turbo.json` (ver AC-11).
- AC-7 por topología → diferenciado: 5 min monolito, 7 min
  monorepo/multirepo (ver AC-7).

La coordinación entre repos en multirepo (ADR-0012) tampoco requiere que
`fractal new` cree remotos ni conozca URLs de git de antemano — el
manifiesto `fractal.project.yml` se genera con placeholders y se completa
recién en el primer `fractal deploy`.

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Tests de snapshot de los stubs actualizados
- [ ] Test end-to-end pasa
- [ ] Documentación de usuario escrita
- [ ] ADRs asociados creados si hubo decisiones técnicas
- [ ] Este spec marcado como Implementado
