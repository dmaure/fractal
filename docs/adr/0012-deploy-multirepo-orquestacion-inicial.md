# ADR-0012: Deploy en multirepo — coordinación de dominios en el primer deploy (reemplaza a ADR-0011)

**Estado:** Aceptado
**Fecha:** 2026-08-16
**Decisores:** Diego
**Reemplaza a:** ADR-0011

---

## Contexto

ADR-0011 decidió que en multirepo `fractal deploy` corre de forma
independiente en cada repo, sin que Fractal coordine nada entre ambos, y
dejó anotado como "a monitorear": si la fricción de coordinar variables a
mano (URL de la API en el SPA, orígenes CORS/Sanctum en la API) resultaba
alta, evaluar orquestación en un ADR nuevo.

Al analizar qué implicaría una orquestación completa (comando único,
manifiesto de proyecto, pipelines CI/CD coordinados entre repos) aparecieron
tres hallazgos que cambian el problema:

1. **Vite hornea variables en build time, no en runtime.** El SPA necesita
   la URL final de la API *antes* de compilar. La API necesita el origen
   del SPA para CORS/Sanctum. Este es el único punto que realmente duele —
   no la ejecución de los deploys en sí.
2. **El dolor es de una sola vez.** Una vez que ambos dominios quedan
   fijados en el primer deploy, los deploys posteriores por merge no
   necesitan volver a consultarse — cada repo ya tiene el valor cruzado
   guardado en sus propios secrets/env. No hay necesidad de coordinar cada
   merge, solo el primero.
3. **No hace falta acceso remoto entre repos para resolver esto.** El
   patrón ya existente en SPEC-0003 (AC-8: "se listan los secrets exactos
   que debo cargar") ya asume que el CLI imprime instrucciones y el usuario
   las aplica a mano en cada proveedor. Extender ese mismo patrón para
   incluir el valor cruzado no requiere que un repo tenga credenciales de
   escritura sobre el otro, ni pipelines que se llamen entre sí.

Esto reduce el problema de "orquestar dos deploys" a "coordinar una
pregunta, una sola vez, entre dos ejecuciones independientes que ya
existían."

---

## Decisión

`fractal deploy` sigue siendo una ejecución independiente por repo (ADR-0011
no se revierte en eso). Se agrega:

1. **Manifiesto local `fractal.project.yml`**, generado por `fractal new` en
   cada carpeta (`api/` y `web/`) para topología multirepo, con la forma:

   ```yaml
   role: api            # o: web
   sibling:
     git_url: null       # se completa en el primer `fractal deploy`
     domain: null         # se completa en el primer `fractal deploy`
   orchestration_state: pending   # pending | resolved
   ```

2. **Primer `fractal deploy` de cada lado** (`orchestration_state:
   pending`): además de las preguntas ya existentes (AC-1 de SPEC-0003), el
   CLI pregunta la URL git y el dominio del repo hermano. No se conecta a
   ese repo ni requiere credenciales sobre él — es información que el
   usuario ya tiene, porque generó ambas carpetas con el mismo `fractal
   new`. Con esa respuesta:
   - Escribe la variable cruzada correspondiente (`API_URL` en el build de
     `web/`; `CORS_ALLOWED_ORIGIN`/dominio Sanctum permitido en `api/`).
   - Actualiza el manifiesto local: guarda `sibling.git_url`,
     `sibling.domain`, y pasa `orchestration_state` a `resolved`.
   - Imprime, junto a los secrets que ya lista AC-8, cuáles debe cargar el
     usuario en el repo hermano cuando corra `fractal deploy` ahí (mismo
     patrón que ya existe, ampliado).

3. **Deploys posteriores** (`orchestration_state: resolved`, o cualquier
   corrida de deploy por merge vía CI/CD): no vuelven a preguntar nada. Leen
   el valor ya guardado en sus propios secrets/env, exactamente como
   cualquier otro deploy de SPEC-0003 hoy.

No se construye repository_dispatch, workflow_dispatch, ni ningún mecanismo
que permita que un pipeline dispare al otro. Los dos pipelines CI/CD
permanecen completamente independientes en todo momento — la coordinación
ocurre una única vez, a nivel de CLI interactivo, no a nivel de
infraestructura de CI.

---

## Consecuencias

### Positivas
- Resuelve el único punto que generaba fricción real (variables cruzadas)
  sin construir ningún mecanismo de coordinación entre pipelines.
- No introduce credenciales de un repo sobre el otro, ni un concepto nuevo
  de "proyecto multi-repo" en `packages/deploy` más allá de un archivo de
  estado local.
- El manifiesto hace la operación idempotente (Artículo VIII): si el primer
  deploy se interrumpe o se repite, el CLI sabe si ya preguntó o no.

### Negativas
- El manifiesto vive fuera de git en la práctica (o si se commitea, expone
  el dominio de producción en el repo — a decidir en la implementación si
  `fractal.project.yml` va en `.gitignore` o no).
- Si el usuario reconstruye un servidor destruido clonando *solo* ese repo
  en una máquina nueva sin el manifiesto actualizado (por ejemplo, si nunca
  se commiteó), pierde el atajo de "ya sé el dominio del hermano" y tiene
  que volver a escribirlo a mano — degradación aceptable, no un bloqueo:
  el deploy sigue funcionando, solo vuelve a pedir el dato.
- Sigue sin resolver qué pasa si los dominios cambian después del primer
  deploy (ej. el usuario migra de dominio) — hoy eso es edición manual del
  `.env`/secret correspondiente, igual que cualquier otro cambio de
  configuración.

### A monitorear
- Si en la práctica el manifiesto genera confusión (usuarios que no
  entienden por qué existe un archivo `fractal.project.yml` que no es
  código de su app), evaluar si conviene que `fractal deploy` pregunte el
  dominio del hermano cada vez, sin persistirlo — más simple, menos mágico,
  a costa de repetir la pregunta en cada reconstrucción del servidor.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
