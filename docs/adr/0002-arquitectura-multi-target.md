# ADR-0002: Arquitectura multi-target — core agnóstico y adapters

**Estado:** Aceptado
**Fecha:** 2026-08-02
**Decisores:** Diego

---

## Contexto

Fractal nace apuntando a Laravel, pero existe la intención declarada de soportar
Ruby on Rails, y potencialmente otros frameworks después.

La decisión sobre cómo estructurar esto no puede diferirse. Un generador escrito
contra un framework concreto se acopla a él en cientos de lugares pequeños: nombres
de directorios, convenciones de nomenclatura, tipos de columna, formato de rutas,
estrategia de migraciones. Descubrir ese acoplamiento cuando ya existen decenas de
stubs implica una reescritura.

La pregunta es cuánta abstracción introducir ahora, sabiendo que sobre-abstraer
también tiene costo: complejidad prematura y velocidad reducida en el único target
que hoy importa.

---

## Opciones consideradas

### Opción A: Monolito acoplado a Laravel, extraer después
- **A favor:** máxima velocidad inicial; ninguna abstracción especulativa; el diseño de la abstracción se informa por código real.
- **En contra:** la extracción posterior es un proyecto en sí mismo; el acoplamiento se filtra a tests y documentación; históricamente esta refactorización se posterga hasta volverse inviable.

### Opción B: Un generador independiente por framework
- **A favor:** cada uno idiomático y simple; sin abstracciones compartidas.
- **En contra:** duplica la capa de deploy, el CLI, los prompts y toda la orquestación; los targets divergen con el tiempo; contradice la tesis del proyecto y su nombre.

### Opción C: Core agnóstico con adapters por framework
- **A favor:** el dominio se define una vez; la capa de deploy se comparte; agregar un target requiere solo un adapter; el contrato del adapter documenta explícitamente qué debe cumplir cada framework.
- **En contra:** exige disciplina sostenida para no filtrar acoplamiento; el contrato debe diseñarse con poca información real; riesgo de abstracción incorrecta.

---

## Decisión

Elegimos **Opción C: core agnóstico con adapters**.

El acoplamiento a un framework es reversible solo mientras el código es pequeño.
Hoy el repositorio tiene un commit. Es el momento de máximo apalancamiento y mínimo
costo para tomar esta decisión.

Para mitigar el riesgo de abstracción incorrecta, adoptamos dos salvaguardas:

1. **Laravel es el target de referencia.** El contrato del adapter se deriva de
   necesidades reales de Laravel, no de especulación. No se abstrae nada sin al
   menos un caso concreto que lo justifique.
2. **Rails es el target de validación, y llega temprano.** Se implementa en M4,
   antes de que existan módulos avanzados. Si el core requiere cambios para
   soportarlo, la abstracción falló y se corrige mientras todavía es barato.

---

## Estructura resultante

```
packages/
├── core/              CLI, FDL, orquestación, contrato del adapter
├── adapter-laravel/   Todo el conocimiento de PHP/Laravel
├── adapter-rails/     Todo el conocimiento de Ruby/Rails
└── deploy/            Provisioning, Docker, Nginx, SSL, CI/CD
```

`core` y `deploy` no contienen ninguna referencia a un framework concreto.

---

## Cumplimiento

El Artículo II de la Constitución formaliza esta decisión. Se verifica con un lint
en CI que falla si aparece terminología específica de framework fuera de
`packages/adapter-*`.

Lista inicial de términos prohibidos en `core` y `deploy`:
`laravel`, `artisan`, `eloquent`, `blade`, `composer`, `rails`, `activerecord`,
`gemfile`, `bundler`, `erb`.

---

## Consecuencias

### Positivas
- Agregar un target es un proyecto acotado y bien definido
- La capa de deploy se escribe una vez y sirve para todos los targets
- El contrato del adapter funciona como documentación viva de lo que Fractal exige
- El nombre del proyecto describe con precisión su arquitectura

### Negativas
- Mayor complejidad estructural desde el día uno
- Velocidad inicial menor que un monolito acoplado
- Requiere un monorepo con gestión de workspaces
- El contrato del adapter será probablemente incorrecto en su primera versión

### A monitorear
- Si al implementar el adapter Rails el core requiere más de tres cambios
  estructurales, revisar el diseño del contrato en un ADR nuevo
- Si el lint de acoplamiento genera falsos positivos, refinar la lista en lugar
  de desactivarlo
