# SPEC-0002: Bridge Node → toolchain del target

**Estado:** Aprobado
**Autor:** Diego
**Fecha:** 2026-08-09
**Issue:** #

---

## 1. Objetivo

Permitir que el core (Node.js) invoque de forma uniforme la toolchain de
cualquier target —Artisan en Laravel, `rails` en Rails— sin conocerla,
delegando ese conocimiento exclusivamente al adapter correspondiente.

---

## 2. Motivación

ADR-0001 decidió un CLI híbrido precisamente para conservar la introspección
real del framework destino, indispensable para generar CRUD correcto. Ese
puente entre procesos es el mecanismo que hace posible esa decisión, y hoy
no tiene spec propio: SPEC-0001 lo necesita para invocar el instalador de
Laravel, y toda la generación de entidades de M2 (SPEC-0008 en adelante) va
a depender de él. Sin este spec, ADR-0001 es una decisión sin implementación
que la sostenga.

---

## 3. Historias de usuario

- Como **core de Fractal**, quiero invocar un comando del adapter sin saber
  si del otro lado hay Artisan o `rails generate`, para mantenerme agnóstico
  (Artículo II).
- Como **desarrollador de un adapter nuevo**, quiero un contrato claro de
  cómo el core me invoca y qué debo devolver, para poder implementarlo sin
  adivinar ni preguntar.
- Como **usuario del CLI**, quiero que un error del lado de la toolchain del
  target se me muestre en lenguaje claro, no como un stacktrace crudo de
  Node o del proceso hijo.

---

## 4. Criterios de aceptación

### AC-1: Contrato de invocación uniforme
- **Dado** que un adapter implementa el contrato del bridge
- **Cuando** el core necesita ejecutar una acción de la toolchain (por
  ejemplo, "crear proyecto base")
- **Entonces** lo invoca a través de una interfaz uniforme —mismo shape de
  entrada y salida— sin importar qué target sea

### AC-2: Payload serializable por stdin/stdout
- **Dado** que el core invoca al adapter
- **Cuando** le pasa datos de entrada (nombre del proyecto, configuración
  elegida, etc.)
- **Entonces** lo hace a través de un payload serializable en JSON
  (consistente con ADR-0003), transmitido por **stdin/stdout** entre los
  procesos — no por archivo temporal ni por argumentos de línea de comando
  ad-hoc. Resuelve el punto "a monitorear" que había quedado abierto en
  ADR-0001 sobre el mecanismo de comunicación.

### AC-3: Propagación de errores legible
- **Dado** que la toolchain del target falla (binario ausente, comando
  devuelve código de error, excepción del lado del adapter)
- **Cuando** el error llega al core
- **Entonces** se muestra al usuario en lenguaje claro, indicando qué falló
  y en qué paso, sin exponer un stacktrace crudo del proceso hijo

### AC-4: Detección de dependencias externas faltantes o insuficientes
- **Dado** que el adapter requiere un binario externo (Composer, PHP, Ruby,
  etc.) y declara una versión mínima a través del contrato de adapter
  (SPEC-0006)
- **Cuando** el usuario corre un comando de Fractal sin ese binario
  instalado, o con una versión por debajo de la que el adapter declaró
- **Entonces** el CLI lo detecta antes de intentar ejecutar nada y muestra
  instrucciones claras (qué falta, o qué versión mínima se necesita)

**Estado de implementación:** Implementado parcialmente.

La detección de binario ausente está implementada mediante
`checkBinaryAvailable()` y `ensureBinaryAvailable()` en
`packages/core/src/bridge/binary-check.ts`. El mecanismo es framework-agnostic
y usa detección multiplataforma (which/where).

El chequeo de versión mínima queda pendiente de SPEC-0006 v0 (contrato del
adapter), que debe definir cómo un adapter declara formalmente su versión
mínima. Una vez existente ese contrato, se agregará
`checkBinaryVersion(binaryName, minVersion)` en este mismo módulo.

### AC-5: Timeout ante proceso colgado
- **Dado** que la toolchain del target no responde
- **Cuando** transcurre el tiempo máximo por defecto — fijo, sin requerir
  configuración (Artículo IV)
- **Entonces** el proceso hijo se corta, se reporta el timeout al usuario, y
  no queda un proceso huérfano corriendo
- Existe una opción avanzada para configurar ese timeout; nunca es
  obligatoria

### AC-6: Contrato documentado
- **Dado** que el bridge está implementado
- **Cuando** un desarrollador de un adapter nuevo lo consulta
- **Entonces** existe documentación del contrato (forma del payload de
  entrada, forma de la respuesta, códigos de error esperados) suficiente
  para implementar un adapter sin necesitar preguntar

### AC-7: Ejecución concurrente sobre el mismo proyecto
- **Dado** que un comando de Fractal ya está corriendo sobre un proyecto y
  mantiene un lock `.fractal.lock` en la raíz con su PID
- **Cuando** se intenta correr un segundo comando de Fractal sobre el mismo
  proyecto
- **Entonces** el segundo falla rápido con un mensaje claro ("ya hay un
  comando de Fractal corriendo sobre este proyecto"), sin ejecutar nada

### AC-8: Lock huérfano
- **Dado** que un proceso de Fractal murió sin liberar su lock (crash,
  `kill -9`)
- **Cuando** un comando nuevo encuentra el lock `.fractal.lock`
- **Entonces** verifica si el PID registrado sigue vivo; si no, trata el
  lock como stale, lo libera, y continúa con normalidad

---

## 5. Fuera de alcance

- Qué comandos concretos expone cada adapter y con qué semántica (eso es
  SPEC-0006, contrato del adapter, en M2)
- Implementación de `adapter-laravel` en sí (SPEC-0001 la usa, pero el
  bridge es el mecanismo genérico, no el adapter)
- Ruby on Rails como target (M4)

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0001 (CLI híbrido Node) | Bloqueante | Aceptado |
| ADR-0003 (diseño de FDL, formato JSON) | Blanda | Aceptado |

---

## 7. Consideraciones técnicas

**Rendimiento**
- El overhead del puente entre procesos no debe ser perceptible para el
  usuario — ADR-0001 ya lo señaló como punto "a monitorear"

**Seguridad**
- El payload no debe exponer secrets del entorno del usuario en logs ni en
  mensajes de error

**Compatibilidad**
- Versión mínima de Node a soportar en el core
- Versión mínima del runtime de cada target (PHP/Composer para Laravel,
  Ruby/Bundler para Rails) queda declarada por cada adapter, no por el
  bridge

**Concurrencia**
- El lock `.fractal.lock` vive en la raíz del proyecto, no en el core ni en
  el sistema — así un mismo proyecto queda protegido sin importar desde qué
  máquina o sesión se invoque Fractal
- La detección de lock huérfano (AC-8) usa el mismo mecanismo de verificar
  procesos vivos que necesita el timeout de AC-5, no son dos sistemas
  separados

---

## 8. Preguntas abiertas

Ninguna pendiente. Las tres preguntas originales se resolvieron el
2026-08-09:
- Comunicación por stdin/stdout, no archivo temporal → AC-2
- Ejecución concurrente → lock `.fractal.lock` con PID, AC-7 y AC-8
- Timeout fijo por defecto, configurable para casos avanzados (Artículo IV)
  → AC-5

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Tests de snapshot de los stubs actualizados (si aplica)
- [ ] Test end-to-end pasa
- [ ] Documentación de usuario escrita
- [ ] ADRs asociados creados si hubo decisiones técnicas
- [ ] Este spec marcado como Implementado
