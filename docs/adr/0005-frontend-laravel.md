# ADR-0005: Frontend Laravel — stack SPA y autenticación

**Estado:** Aceptado
**Fecha:** 2026-08-16
**Decisores:** Diego

---

## Contexto

VISION.md sección 7 anotaba "Frontend Laravel: React + Inertia" como decisión
ya tomada, sin que este ADR existiera todavía para respaldarla. ADR-0009
(Aceptado, 2026-08-10) construyó sobre esa base: definió el monolito como
"Laravel + Inertia" y las topologías desacopladas (monorepo, multirepo) como
API REST/GraphQL consumida por un SPA independiente — dos arquitecturas de
frontend distintas según la topología elegida.

Esa premisa cambió: se descarta Inertia por completo. Sin el puente Inertia,
la distinción "monolito = Inertia, desacoplado = SPA" desaparece — las tres
topologías comparten la misma arquitectura de frontend (API + SPA compilado
con Vite) y solo difieren en dónde vive el código. Esto simplifica el alcance
que ADR-0009 anticipaba para este ADR: ya no hace falta cubrir dos stacks de
frontend distintos, solo uno, aplicado uniformemente.

Quedan dos decisiones abiertas para ese stack único:

1. Qué framework SPA genera Fractal.
2. Cómo se autentica el SPA contra la API Laravel.

Esta decisión es anterior y prerrequisito de ADR-0010 (que reemplaza a
ADR-0009 y redefine la topología sin Inertia).

---

## Decisión 1: Framework SPA

### Opciones consideradas

**React** — continuidad con lo ya anotado en VISION.md; ecosistema más
grande; los starter kits oficiales de Laravel (Breeze/Jetstream, variante
API) ya lo cubren; más precedente para un generador multi-target que en algún
momento también sirve a Rails.

**Vue** — curva de aprendizaje más suave; más cercano históricamente a la
comunidad Laravel (Jetstream nació con Vue). Habría implicado revertir la
decisión ya anotada en VISION.md además de quitar Inertia, sumando un
segundo cambio sin necesidad.

### Elegido: React

Se mantiene React. No hay una razón nueva para reabrir esa parte de la
decisión original — lo único que cambia es el puente (Inertia desaparece),
no el framework.

---

## Decisión 2: Autenticación SPA ↔ API

### Opciones consideradas

**Sanctum, modo SPA cookie**
- A favor: sesión + cookie httpOnly + CSRF, sin tokens expuestos a XSS vía
  localStorage.
- En contra: exige que frontend y API compartan dominio raíz (subdominios
  sirven, dominios distintos no). Ata la topología multirepo a que Fractal
  controle el layout de dominios en el deploy.

**Sanctum, modo API token (Bearer)**
- A favor: funciona sin importar el dominio del frontend — válido incluso si
  en el futuro alguien hostea el SPA en un proveedor distinto al backend
  (Vercel, Netlify, CDN estático) separado del deploy que gestiona Fractal.
  Mismo paquete que la opción cookie, así que no suma una dependencia nueva.
- En contra: el token vive en el cliente (localStorage o memoria), expuesto
  a XSS si el código generado no es cuidadoso; requiere generar manejo de
  expiración/refresh en el SPA.

**Passport (OAuth2 completo)**
- A favor: cubre el caso de terceros consumiendo la API bajo OAuth2.
- En contra: sobredimensionado para v1 — un solo SPA propio consumiendo su
  propia API no necesita el flujo OAuth2 completo. Más superficie de stubs
  y configuración a generar y mantener.

### Elegido: Sanctum, modo API token (Bearer)

Se prioriza que el mecanismo de auth sea independiente de la relación de
dominios entre frontend y API. La razón principal es multirepo: esa
topología existe precisamente para el usuario que quiere desacoplar el
deploy del frontend del deploy del backend, lo cual incluye la posibilidad
de hostear el SPA en un proveedor distinto (Vercel, Netlify) fuera del
Docker Compose que gestiona Fractal (ADR-0006). Atar la autenticación a
"mismo dominio raíz" (modo cookie) contradice ese caso de uso en su forma
más flexible.

El riesgo de XSS se mitiga en la capa de generación: el stub del SPA guarda
el token en memoria (no en localStorage) y lo mantiene vivo vía un token de
refresh de vida corta, documentado como parte del contrato del adapter
Laravel.

---

## Consecuencias

### Positivas
- Una sola arquitectura de frontend para las tres topologías — menos stubs,
  menos snapshots, menos superficie de test que mantener en M1/M2 frente a
  lo que anticipaba ADR-0009.
- El mecanismo de auth no depende de cómo el usuario decida desplegar el
  SPA, incluso fuera de la infraestructura que Fractal provisiona.
- React ya tiene precedente documentado en VISION.md — no se reabre esa
  discusión.

### Negativas
- El monolito, que antes evitaba tener API interna (con Inertia), ahora
  también genera y mantiene una API — sube su complejidad y probablemente su
  Time-to-Production frente al Artículo I. Ver nota en "A monitorear".
- El manejo de token en memoria + refresh es más código generado que una
  sesión de Laravel estándar, y más superficie de bugs de auth en el
  starter.
- GraphQL queda mencionado en VISION.md junto a REST sin que este ADR lo
  resuelva — sigue abierto qué expone el adapter Laravel por defecto.

### A monitorear
- Si el TTP del monolito (ahora con API + SPA + auth por token) supera el
  objetivo de 30 minutos o resulta notablemente más lento que la versión
  con Inertia que se descartó, reconsiderar si el monolito debería tener una
  ruta más liviana (Blade-only, sin SPA) como cuarta opción.
- Definir en un ADR aparte si el adapter Laravel expone REST, GraphQL, o
  ambos por defecto — este ADR asume la API pero no resuelve su forma.
- Revisar el contrato de refresh de token cuando se escriba SPEC del módulo
  de autenticación — el detalle de expiración/rotación no está definido acá.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
