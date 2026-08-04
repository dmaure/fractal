# ADR-0001: CLI en Node.js con invocación de la toolchain del target

**Estado:** Aceptado
**Fecha:** 2026-08-02
**Decisores:** Diego

---

## Contexto

Fractal necesita un punto de entrada por terminal. El generador debe:

- Ser instalable con un solo comando, sin requerir el runtime del target preinstalado
- Ofrecer prompts interactivos de calidad
- Generar código que requiere conocimiento del framework en tiempo de ejecución
  (nombres de tablas, relaciones del ORM, registro de rutas)

Existe tensión entre la ergonomía de distribución y la capacidad de introspección
del framework destino. Además, la decisión debe ser válida para múltiples targets,
no solo Laravel.

---

## Opciones consideradas

### Opción A: CLI escrito en el runtime del target
- **A favor:** acceso total al contenedor del framework; una sola tecnología por target.
- **En contra:** requiere el runtime preinstalado; obliga a reescribir el CLI completo por cada target nuevo; contradice ADR-0002.

### Opción B: Node.js puro, sin invocar la toolchain del target
- **A favor:** `npx fractal` funciona sin instalación previa; Inquirer y Commander son maduros; un solo CLI para todos los targets.
- **En contra:** sin introspección del framework; toda la generación sería manipulación ciega de texto; imposible validar contra el esquema real.

### Opción C: Híbrido — CLI en Node que invoca la toolchain de cada target
- **A favor:** combina la distribución de Node con la introspección del framework; un solo CLI para N targets; encaja naturalmente con la arquitectura de adapters.
- **En contra:** dos runtimes por target; el puente entre procesos añade complejidad y superficie de error.

---

## Decisión

Elegimos **Opción C: híbrido**.

La distribución vía `npx` elimina la fricción de primer uso, y delegar la generación
real a la toolchain del target preserva el acceso a su introspección, imprescindible
para generar CRUD correcto.

Cada adapter declara qué comandos de su toolchain expone. El core los invoca a través
de un contrato uniforme, sin saber si del otro lado hay Artisan o `rails generate`.

---

## Consecuencias

### Positivas
- Primer uso sin instalación: `npx fractal new mi-proyecto`
- Un solo CLI sirve a todos los targets presentes y futuros
- Los comandos de Fractal quedan disponibles dentro del proyecto generado, en la
  toolchain nativa de su framework
- La capa de prompts y la de generación evolucionan de forma independiente

### Negativas
- Se debe mantener el contrato de payload entre Node y cada toolchain
- Los errores del proceso hijo deben propagarse legiblemente hacia Node
- CI debe correr matrices de Node más el runtime de cada target

### A monitorear
- Si el overhead del puente degrada la experiencia, evaluar comunicación por
  archivo JSON en lugar de argumentos de línea de comandos
