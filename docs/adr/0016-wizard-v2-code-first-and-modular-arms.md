# ADR-0016: Wizard v2 — code-first y brazos modulares

**Estado:** Aprobado
**Fecha:** 2026-11-01
**Contexto:** Decisión de producto de Diego (PO), captada antes del inicio de la implementación de SPEC-0007 (motor de templating) y M2 code-gen

---

## Contexto

Tras la implementación de M1 (esqueleto vertical, `fractal new` + `fractal deploy`), surgieron dos necesidades:

1. **Principio de producto:** la visión "deploy-first" de la v1 resulta restrictiva para usuarios que quieren generar un proyecto local y postergar (o nunca ejecutar) el deploy. La fricción de pedir datos de infraestructura (IP, SSH, DNS) **antes** de ver código reduce la adopción.

2. **Arquitectura del wizard:** la interfaz actual del wizard (`fractal new`) recolecta todos los datos de forma lineal. No hay mecanismo claro para que cada "sección" (código, infraestructura, DNS, GitHub, base de datos) sea un módulo reemplazable e independiente, ni para que el usuario salte secciones completas.

Este ADR documenta las decisiones de producto y arquitectura que gobiernan el wizard v2, capturadas antes de redactar SPEC-0007.

---

## Decisiones

### 1. Principio de producto: code-first con deploy opcional

El nuevo principio diferenciador es:

> **Code-first con deploy opcional.** El generador comienza por el código (framework, topología, dominio). Desplegar es una capacidad valiosa que el usuario elige activar, no un requisito para obtener un proyecto funcional.

**Implicación inmediata:** el wizard v2 debe reordenar el flujo:

1. **Primero:** nombre del proyecto, framework (cuando haya más de uno), topología, base de datos, frontend, FDL opcional.
2. **Al final:** sección de infraestructura (VPS, SSH, DNS) como **opcional** — el usuario responde sí/no/parcial en un checklist.
3. Token de GitHub: sección independiente de la de servidor, también opcional.

Si el usuario omite la sección de infraestructura, `fractal new` genera el proyecto local y **no** intenta desplegarlo. El deploy queda disponible vía `fractal deploy` posterior.

**Reconciliación con Art. I (Time-to-Production):** el TTP sigue siendo la métrica primaria **cuando el usuario elige el camino de deploy**. Cuando el usuario omite el deploy, el éxito se mide por otra métrica (propuesta en §7 de este ADR): **Time-to-Usable-Scaffold (TTS)** — tiempo entre `fractal new` y tener un proyecto local con `composer install` + `php artisan serve` funcionando.

La Constitución, Art. I, se actualiza en consecuencia: la métrica TTP no desaparece, se **condiciona** al camino elegido.

---

### 2. Wizard como conjunto de brazos modulares (pluggables)

El wizard v2 se organiza en **secciones modulares**, cada una con un contrato claro de entrada/salida, reemplazables de forma independiente. En el lenguaje de la metáfora fractal:

> Cada sección del wizard es un **brazo** del fractal — un módulo reemplazable.

**Brazos identificados para wizard v2:**

| Brazo | Responsabilidad | Entrada | Salida | ¿Obligatorio? |
|---|---|---|---|---|
| **Código** | Framework, topología, DB, frontend | Nombre del proyecto | Configuración base del proyecto | Sí |
| **Dominio (FDL)** | Entidades, campos, relaciones | Configuración base | IR de FDL (opcional) | No |
| **Infraestructura** | VPS, SSH, dominio, DNS | Sí/no/algunos | Datos de deploy o vacío | No |
| **GitHub** | Crear repo remoto, setear secrets | Sí/no, token | Repo creado + secrets seteados o vacío | No |
| **Base de datos** | Contraseña | — | Contraseña generada o ingresada | Condicional (solo si deploy) |

**Arquitectura modular dentro de Fractal:**

- Cada brazo del wizard es un **módulo interno** de `packages/core`, no un módulo del proyecto generado (esos llegan en M5, Art. IX original).
- El core orquesta la ejecución de brazos: habilita o deshabilita cada uno según las respuestas del usuario.
- Un brazo puede ser reemplazado (ej. sección de DNS con proveedores adicionales, sección de código con frameworks adicionales) sin afectar al resto.

**Distinción con Art. IX original (módulos del proyecto generado):**

- **Art. IX (Modularidad), contexto original:** habla de módulos opcionales **del proyecto generado** (GraphQL, multi-tenancy, media library — M5). Estos se instalan con `fractal module` **después** de que el proyecto base ya existe.
- **Brazos del wizard (este ADR):** son módulos **internos de Fractal** que participan en la generación del proyecto. No son instalables por el usuario, son secciones arquitectónicas del generador.

Art. IX se extiende, no se reemplaza: ahora cubre **dos** conceptos de modularidad fractal (ver §5 de este ADR).

---

### 3. Checklist inicial de datos requeridos

El wizard v2 comienza con un **checklist** (prompt tipo "multi-select" o serie de sí/no) que pregunta al usuario qué datos tiene disponibles:

- ¿Tenés un servidor para desplegar? (sí / no / lo agrego después)
- ¿Tenés un dominio y querés configurar DNS automático? (sí / no / lo hago manual)
- ¿Tenés un token de GitHub y querés que Fractal cree el repo remoto? (sí / no)

Según las respuestas, el wizard habilita o salta cada brazo.

**Caso clave:** si el usuario responde "no" a servidor, el wizard omite toda la sección de infraestructura y genera solo el proyecto local. El hand-off final **no** incluye comandos de deploy (los muestra solo si el usuario dio datos de infraestructura).

---

### 4. Selectors visibles incluso con una sola opción

**Decisión de UX:** si el wizard tiene un selector (framework, topología, base de datos, frontend) y **por ahora** solo hay una opción disponible (ej. Laravel), el prompt **igualmente** muestra un selector con esa única opción.

**Razón:** comunica al usuario que en el futuro habrá más opciones. Evita sorpresas ("¿por qué ahora me pregunta el framework?") cuando se agreguen Rails u otros.

**Excepción:** el checklist inicial de datos (§3) no es un selector de opciones, es un filtro de secciones — ahí sí/no tiene sentido semántico propio.

---

### 5. Extensión de la metáfora fractal: dos niveles de modularidad

La metáfora fractal de la Constitución (Art. I: "la misma estructura se repite en cada framework") se extiende para cubrir **dos** conceptos de "brazo":

**A. Brazos del wizard (este ADR):** secciones internas de Fractal que son reemplazables e independientes (código, infraestructura, GitHub, DNS). Participan en la generación del proyecto.

**B. Módulos del proyecto generado (Art. IX original, M5):** capacidades opcionales que el usuario instala **en el proyecto generado** con `fractal module` (GraphQL, multi-tenancy, etc.). No participan en `fractal new`.

La metáfora unifica ambos: cada "brazo" del fractal — ya sea interno (wizard) o externo (módulos del proyecto) — tiene un contrato y puede reemplazarse sin afectar al núcleo.

**Actualización de Art. IX:** se divide en dos apartados para reflejar esta dualidad.

---

### 6. Orden del wizard v2

```
1. Checklist inicial (¿qué datos tenés?)
2. Sección de código:
   - Nombre del proyecto
   - Framework (cuando haya más de uno)
   - Topología
   - Base de datos
   - Frontend
3. Sección de dominio (FDL) — opcional
4. Sección de infraestructura (si respondió "sí" en el checklist):
   - IP, SSH, dominio, DNS
5. Sección de GitHub (si respondió "sí" en el checklist):
   - Token, owner, repo, visibilidad
6. Contraseña de la base (si hay datos de deploy)
7. Hand-off: siguiente comando (`fractal deploy` o solo `cd <proyecto>`)
```

**Cambio clave:** infraestructura al final, no al principio. Código primero.

---

### 7. Métrica de éxito para proyectos sin deploy

Cuando el usuario omite el deploy, el objetivo pasa a ser:

> **Time-to-Usable-Scaffold (TTS):** tiempo entre `fractal new` y tener un proyecto local con `composer install` (o equivalente) + servidor de desarrollo corriendo (`php artisan serve`).

**Objetivo para TTS:** < 5 minutos (asume que el adapter ya generó el scaffold y el usuario solo corre comandos de setup local).

Art. I se actualiza para incluir **dos** métricas:

- **TTP (Time-to-Production):** cuando el usuario elige desplegar.
- **TTS (Time-to-Usable-Scaffold):** cuando el usuario omite el deploy.

---

## Alternativas descartadas

### A1. Mantener "deploy-first" y pedir datos de infraestructura obligatorios

**Razón de descarte:** aleja a usuarios que solo quieren explorar el generador o que trabajan en entornos sin VPS propios. La fricción de tener que conseguir un servidor antes de ver código es demasiado alta para early adopters.

### A2. Mantener el wizard lineal (sin estructura de brazos modulares)

**Razón de descarte:** cada vez que se agregue una capacidad nueva (ej. otro proveedor de DNS, otro framework, otro tipo de base de datos), la lógica del wizard crece de forma acoplada. Los brazos modulares aíslan cada sección y facilitan evolucionar el wizard sin romper lo existente.

### A3. No mostrar selectors con una sola opción

**Razón de descarte (decisión de Diego):** ocultar los selectores hoy hace que su aparición futura sea inesperada. Mostrarlos desde el principio comunica que el sistema está diseñado para soportar múltiples opciones, aunque todavía no haya más de una.

---

## Consecuencias

### Cambios en la Constitución

1. **Art. I (Propósito):** se actualizan la métrica TTP y el principio diferenciador:
   - De: "Deploy-first. El deploy no es el último paso del proyecto. Es el primero."
   - A: "Code-first con deploy opcional. El generador entrega un proyecto funcional local en minutos; desplegar es una capacidad valiosa que el usuario elige activar."
   - Métricas: TTP (< 30 min, si elige deploy) y TTS (< 5 min, si omite deploy).

2. **Art. IX (Modularidad):** se extiende para cubrir **dos** niveles:
   - **IX.A — Brazos del wizard (internos):** cada sección del wizard es un módulo reemplazable con contrato claro.
   - **IX.B — Módulos del proyecto generado (externos):** capacidades opcionales instalables con `fractal module` (contexto original de M5).

3. **Enmiendas:** se registra esta modificación con referencia a este ADR.

### Cambios en la Visión

- §4 (Principios diferenciadores): actualizar el primer principio de "Deploy-first" a "Code-first con deploy opcional", con la explicación de que el deploy sigue siendo un diferenciador cuando el usuario lo elige, pero ya no es obligatorio.
- §5 (Arquitectura conceptual): expandir la metáfora de los brazos para incluir los brazos del wizard (internos) además de los adapters y módulos del proyecto.

### Cambios en el Roadmap

- Insertar un **nuevo ítem: wizard v2** antes de SPEC-0007 (motor de templating).
  - Sugerencia de ubicación: **M1.5** (entre M1 y M2) o como primer ítem de M2.
  - Justificación: SPEC-0007 y el code-gen de entidades (SPEC-0008..0013) asumen que el wizard ya sabe pedir los datos correctos en el orden correcto. Si no se rediseña el wizard antes, SPEC-0007 se implementará contra una interfaz de wizard que después habrá que cambiar, lo cual duplica el trabajo.
- Nota en ROADMAP: "SPEC-0007 pausado hasta que el wizard v2 esté documentado y aprobado."

### Trabajo pendiente (no parte de este PR)

1. **Redactar SPEC-0007 (actualizado):** el spec del motor de templating debe asumir que el wizard v2 ya está en su lugar. Espera a que este ADR esté mergeado.
2. **Spec de wizard v2 (futuro SPEC-00XX):** Claude redactará el spec completo del wizard v2 con los flows detallados, validaciones, y contratos de cada brazo. Ese spec nacerá **después** de este PR.

---

## Referencias

- Constitución, Art. I (Propósito)
- Constitución, Art. IX (Modularidad)
- VISION.md, §4 (Principios diferenciadores)
- ROADMAP.md, M1 y M2
- Decisión de producto de Diego, 2026-11-01
