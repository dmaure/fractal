# SPEC-0002: Bridge Node → toolchain del target

**Estado:** Draft
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

### AC-2: Payload serializable
- **Dado** que el core invoca al adapter
- **Cuando** le pasa datos de entrada (nombre del proyecto, configuración
  elegida, etc.)
- **Entonces** lo hace a través de un payload serializable en JSON
  (consistente con ADR-0003), no mediante argumentos de línea de comando
  ad-hoc

### AC-3: Propagación de errores legible
- **Dado** que la toolchain del target falla (binario ausente, comando
  devuelve código de error, excepción del lado del adapter)
- **Cuando** el error llega al core
- **Entonces** se muestra al usuario en lenguaje claro, indicando qué falló
  y en qué paso, sin exponer un stacktrace crudo del proceso hijo

### AC-4: Detección de dependencias externas faltantes
- **Dado** que el adapter requiere un binario externo (Composer, PHP, Ruby,
  etc.)
- **Cuando** el usuario corre un comando de Fractal sin tenerlo instalado
- **Entonces** el CLI lo detecta antes de intentar ejecutar nada y muestra
  instrucciones claras de instalación

### AC-5: Timeout ante proceso colgado
- **Dado** que la toolchain del target no responde
- **Cuando** transcurre un tiempo máximo configurado
- **Entonces** el proceso hijo se corta, se reporta el timeout al usuario, y
  no queda un proceso huérfano corriendo

### AC-6: Contrato documentado
- **Dado** que el bridge está implementado
- **Cuando** un desarrollador de un adapter nuevo lo consulta
- **Entonces** existe documentación del contrato (forma del payload de
  entrada, forma de la respuesta, códigos de error esperados) suficiente
  para implementar un adapter sin necesitar preguntar

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

---

## 8. Preguntas abiertas

- [ ] ¿Comunicación por archivo temporal JSON o por stdin/stdout directo
      entre los procesos? ADR-0001 lo dejó como "a monitorear" sin decidir.
- [ ] ¿Qué pasa si dos comandos de Fractal corren en paralelo sobre el mismo
      proyecto?
- [ ] ¿El timeout de AC-5 es configurable por el usuario o fijo por el core?

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Tests de snapshot de los stubs actualizados (si aplica)
- [ ] Test end-to-end pasa
- [ ] Documentación de usuario escrita
- [ ] ADRs asociados creados si hubo decisiones técnicas
- [ ] Este spec marcado como Implementado
