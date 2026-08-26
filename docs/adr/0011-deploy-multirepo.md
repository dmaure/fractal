# ADR-0011: Deploy en topología multirepo — ejecuciones independientes por repo

**Estado:** Reemplazado por ADR-0012
**Fecha:** 2026-08-16
**Decisores:** Diego

---

## Contexto

ADR-0010 confirma multirepo como una de las tres topologías del proyecto
generado: API y frontend en dos repositorios git independientes. SPEC-0003
(deploy) sigue asumiendo un solo repositorio en su AC-1 ("repositorio Git y
rama de producción", singular) — nunca se decidió cómo `fractal deploy` se
comporta cuando el proyecto vive en dos repos.

La pregunta concreta: ¿`fractal deploy` orquesta el deploy de ambos repos
desde un único comando, o el usuario lo ejecuta una vez por repo, sin que
Fractal coordine nada entre ambos?

---

## Opciones consideradas

### Opción A (elegida): Dos ejecuciones independientes, una por repo
- **A favor:** SPEC-0003 no cambia en su núcleo — AC-1 a AC-12 ya describen
  el comportamiento de `fractal deploy` corriendo dentro de un repo con un
  VPS propio; correr el comando dos veces (una en `api/`, otra en `web/`)
  reutiliza el spec tal cual. Cero alcance nuevo para M1/M2.
- **En contra:** el usuario copia a mano la URL de la API en el `.env` del
  SPA y los orígenes permitidos en CORS/Sanctum del lado API — sin garantía
  de que ambos deploys queden coordinados. Dos deploys por merge en vez de
  uno, cada uno con su propio pipeline.

### Opción B: Una ejecución orquestada desde un manifest de proyecto
- **A favor:** mejor experiencia — Fractal genera las variables cruzadas
  automáticamente (URL de API en el SPA, CORS en la API), igual que ya hace
  AC-11 de SPEC-0001 para el caso local; un solo comando coherente con el
  principio deploy-first.
- **En contra:** feature bastante más grande — hay que decidir dónde vive
  el manifest (¿en el repo `api/`? ¿en un tercer repo?), cómo referencia el
  segundo repo (URL + credenciales de acceso), y cómo se coordinan dos
  pipelines CI/CD disparados por push a dos repos distintos con un único
  estado de "deploy exitoso". Probablemente empuja el AC-7 de tiempo de
  ejecución y suma alcance no presupuestado a M1/M2.

---

## Decisión

Elegimos la **Opción A**. En multirepo, `fractal deploy` se ejecuta de forma
independiente en cada repo (`api/` y `web/`), cada uno con su propio VPS o
hosting, su propio pipeline CI/CD y su propio ciclo de vida de deploy. Fractal
no orquesta nada entre los dos.

La coordinación entre ambos —URL de la API que consume el SPA, orígenes
permitidos en CORS/Sanctum del lado API— queda a cargo del usuario en v1.
`fractal deploy` imprime, al terminar cada ejecución, los valores que el
otro lado necesita (mismo patrón que AC-11 de SPEC-0001 para el caso local),
pero no los escribe automáticamente en el repo del otro lado.

---

## Consecuencias

### Positivas
- SPEC-0003 no necesita AC nuevos de fondo, solo una aclaración de que AC-1
  a AC-12 aplican por repo en multirepo — cero trabajo adicional de
  provisioning o CI/CD para M1/M2.
- Mantiene la superficie de Fractal acotada: no introduce el concepto de
  "proyecto compuesto por N repos" en la capa de deploy, que hoy no existe
  en ningún otro lugar del core.

### Negativas
- El usuario de multirepo pierde parte de la promesa deploy-first: dos
  comandos, dos posibles puntos de fricción, y coordinación manual de
  variables cruzadas — justo el perfil de usuario (equipos que separan
  releases) que más se beneficiaría de que quedara automatizado.
- Dos deploys independientes pueden quedar desincronizados en el tiempo
  (la API se actualiza, el SPA todavía no, o viceversa) sin que Fractal lo
  detecte.

### A monitorear
- Si en la práctica el usuario de multirepo reporta fricción alta por la
  coordinación manual, evaluar la Opción B como ADR nuevo — no se descarta
  permanentemente, se pospone.
- Si se implementa Opción B más adelante, revisar si conviene para
  monorepo desacoplado también (hoy un solo `fractal deploy` ya cubre ambos
  packages porque comparten repo, así que no aplica del mismo modo).

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
