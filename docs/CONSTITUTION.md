# Constitución de Fractal

> Documento fundacional. Define los principios innegociables del proyecto.
> Modificar cualquier artículo requiere justificación explícita y un ADR asociado.

**Versión:** 1.0.0
**Última revisión:** 2026-08-02

---

## Artículo I — Propósito

Fractal es un generador de aplicaciones production-ready, multi-framework.

El nombre no es decorativo: describe la tesis del proyecto. La misma estructura
—dominio, capas, CRUD, despliegue— se repite en cada framework destino. Fractal
define esa estructura una vez y la proyecta sobre cada target.

El éxito se mide por una métrica primaria:

> **Time-to-Production (TTP):** tiempo entre `fractal new` y tener la aplicación
> accesible en internet, con HTTPS, CI/CD activo y deploy por merge.

**Objetivo:** TTP < 30 minutos, en cualquier target soportado.

Toda feature que aumente el TTP sin beneficio proporcional se rechaza o se mueve
a un módulo opcional.

---

## Artículo II — El core no conoce ningún framework

Este es el artículo más importante del proyecto.

1. El core define el dominio en **FDL** (Fractal Definition Language), una
   representación intermedia agnóstica.
2. El core **nunca** contiene la cadena `Laravel`, `Rails`, `Eloquent`,
   `ActiveRecord` ni ninguna referencia a un framework concreto.
3. Todo conocimiento específico de un framework vive exclusivamente en su adapter.
4. Agregar un target nuevo debe requerir escribir un adapter, y cero cambios en el core.

**Test de cumplimiento:** un lint en CI falla si aparece terminología de framework
fuera de `packages/adapter-*`.

---

## Artículo III — Paridad, no uniformidad

1. Todo target debe cubrir el mismo conjunto de capabilities del core.
2. El código generado debe ser **idiomático de su framework**, no una traducción
   literal de otro. Un desarrollador Rails debe reconocerlo como Rails legítimo.
3. Si una capability no puede expresarse idiomáticamente en un target, se documenta
   la divergencia. No se fuerza.

---

## Artículo IV — Simplicidad por defecto

1. El camino feliz funciona sin configuración.
2. Toda pregunta del CLI tiene un default sensato. Responder Enter a todo produce
   un proyecto funcional.
3. La configuración avanzada existe, nunca es obligatoria.
4. Si una feature requiere leer documentación para usarse por primera vez, está mal diseñada.

---

## Artículo V — El código generado es el producto

1. **Idiomático.** El usuario debe reconocerlo como código que él habría escrito.
2. **Autónomo.** Cero dependencias de Fractal en runtime. El proyecto generado vive
   sin el generador.
3. **Modificable.** El usuario es dueño del código. No existe "no toques esto".
4. **Testeado.** Toda entidad generada incluye sus tests.

---

## Artículo VI — Seguridad no es opcional

Todo proyecto generado incluye, sin que el usuario lo pida:

- HTTPS forzado con redirect desde HTTP
- Headers de seguridad (HSTS, CSP base, X-Frame-Options)
- Firewall con política deny-by-default
- Login root por SSH deshabilitado
- Secrets fuera del repositorio
- Validación en servidor para toda entrada de usuario

Nunca se generan credenciales de ejemplo capaces de llegar a producción.

---

## Artículo VII — Todo deploy es reversible

1. Ningún deploy deja la aplicación en estado inconsistente.
2. Todo deploy incluye healthcheck. Si falla, revierte automáticamente.
3. Las migraciones son compatibles hacia atrás dentro de una misma release.
4. El estado del servidor es reproducible: si se destruye, se reconstruye con un comando.

---

## Artículo VIII — Idempotencia

Todo comando del CLI y todo script de provisioning puede ejecutarse múltiples veces
con resultado idéntico. Ejecutar `deploy` dos veces no rompe nada ni duplica configuración.

---

## Artículo IX — Modularidad

1. El core es mínimo: dominio, CRUD, auth básica, deploy.
2. Todo lo demás es un módulo opcional instalable por separado.
3. Un módulo opcional no depende de otro módulo opcional. Solo del core.
4. Desinstalar un módulo es posible y está documentado.

---

## Artículo X — El generador se testea generando

1. Todo stub tiene test de snapshot (golden file).
2. Todo cambio de stub actualiza su snapshot, revisado en el PR.
3. Existe un test end-to-end por target: genera un proyecto completo y verifica que arranca.
4. Un stub sin test no se mergea.

---

## Artículo XI — La especificación precede al código

1. Ninguna capability se implementa sin spec aprobado en `docs/specs/`.
2. Toda decisión técnica con alternativas viables se documenta en un ADR.
3. Si el código diverge del spec, se actualiza el spec en el mismo PR.
4. Los specs se escriben en lenguaje de negocio, no de implementación.

---

## Enmiendas

| Fecha | Artículo | Cambio | ADR |
|---|---|---|---|
| 2026-08-02 | — | Versión inicial | — |
