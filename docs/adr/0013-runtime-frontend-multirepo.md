# ADR-0013: Runtime del repo web/ en multirepo — Docker Compose, nginx-only

**Estado:** Aceptado
**Fecha:** 2026-08-16
**Decisores:** Diego

---

## Contexto

ADR-0006 decidió Docker Compose como runtime de producción, con seis
contenedores (`app`, `nginx`, `db`, `redis`, `worker`, `scheduler`) pensados
para una aplicación Laravel completa. ADR-0010 introdujo multirepo, donde el
repo `web/` es solo el build estático de React + Vite (ADR-0005) — sin
backend propio, sin base de datos, sin colas.

Aplicar el mismo conjunto de seis contenedores al deploy de `web/` desplegaría
`app`, `db`, `redis`, `worker` y `scheduler` sin ningún uso real, en el mismo
piso mínimo de recursos que ADR-0006 ya señala como ajustado (1 vCPU, 2 GB
RAM, SPEC-0003 AC-2). Hace falta decidir qué corre en el VPS del lado `web/`.

Esto no reabre ADR-0006: Docker Compose sigue siendo el runtime elegido. Lo
que se decide acá es qué contenedores genera `packages/deploy` cuando el
repo a desplegar es un frontend estático en vez de un backend Laravel.

---

## Opciones consideradas

### Opción A (elegida): Mismo VPS + Docker Compose, solo el contenedor nginx
- **A favor:** reutiliza el 100% del flujo de provisioning, SSL, DNS y CI/CD
  de SPEC-0003 (AC-1 a AC-13) sin ninguna rama nueva de código — solo cambia
  qué contenedores lista el `docker-compose.yml` generado, dato que ya
  proviene del contrato del adapter (Artículo II). Nginx sirve los archivos
  estáticos de `dist/` directamente, sin proxy a ningún backend en ese
  mismo VPS. Mismo modelo de hardening, firewall y rollback (Artículo VI,
  VII) sin cambios.
- **En contra:** el usuario paga un VPS completo (aunque de recursos
  mínimos) para servir archivos estáticos — más caro que las alternativas
  de hosting estático especializado.

### Opción B: Hosting estático de terceros (Vercel, Netlify, S3+CloudFront)
- **A favor:** más idiomático para un SPA puro, probablemente más barato y
  con CDN incluido.
- **En contra:** mecanismo de deploy completamente distinto al VPS+SSH que
  asume el resto de Fractal — auth por API token en vez de SSH, sin
  provisioning ni hardening de sistema operativo. Reabriría ADR-0006 y
  ADR-0007 para este caso específico, y sumaría integraciones con APIs de
  terceros que hoy no existen en `packages/deploy`. Alcance no
  presupuestado para v1.

---

## Decisión

Elegimos la **Opción A**. En multirepo, el repo `web/` se despliega con el
mismo mecanismo de VPS + Docker Compose que el resto de Fractal, pero el
`docker-compose.yml` generado para ese repo contiene únicamente el servicio
`nginx`, configurado para servir el build estático de Vite. No se generan
`app`, `db`, `redis`, `worker` ni `scheduler`.

El contrato del adapter (SPEC-0006, todavía no escrito) debe declarar, para
el caso "target = frontend estático", qué comando de build correr (`npm run
build`) y qué carpeta servir (`dist/`) — mismo mecanismo que ya usa para
declarar comandos de build/migración en el caso backend (SPEC-0003 AC-12).

---

## Consecuencias

### Positivas
- Cero alcance nuevo en `packages/deploy`: mismo runtime, mismo mecanismo de
  SSL/DNS/CI/CD, solo un subconjunto de contenedores.
- Mantiene a Fractal agnóstico de proveedores de hosting de terceros —
  sigue siendo "VPS del usuario" en todos los casos, consistente con el
  resto del producto.
- Menor huella de recursos que el set completo de seis contenedores.

### Negativas
- Más caro para el usuario que un hosting estático especializado con CDN.
- Sin CDN, la latencia de assets estáticos depende de la ubicación del VPS
  elegido — no resuelto por este ADR.

### A monitorear
- Si aparece demanda real de hosting estático de terceros (usuarios que ya
  pagan Vercel/Netlify y quieren usarlo en vez de un VPS adicional),
  evaluar la Opción B como ADR nuevo — no se descarta permanentemente, se
  pospone por alcance.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
