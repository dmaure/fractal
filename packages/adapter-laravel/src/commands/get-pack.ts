/**
 * Comando "obtener pack de convenciones" para Laravel.
 *
 * Implementa SPEC-0007 AC-2/AC-3: devuelve, de forma determinista y offline, los
 * archivos del pack de convenciones que `fractal new` deja dentro del proyecto
 * generado:
 *
 * 1. `AGENTS.md` — convenciones del stack real (Laravel) para que el agente de
 *    IA del proyecto mapee el FDL a cada capa (migración, modelo, API, frontend,
 *    tests).
 * 2. `fractal/domain.fdl.json` — FDL inicial del dominio, contrato validable por
 *    el core (VR-1..VR-12).
 * 3. `fractal/prompts/add-entity.md` — prompt reutilizable "agregá la entidad X
 *    siguiendo el FDL".
 * 4. `fractal/manifest.json` — manifiesto declarativo del pack (FRA-104): ata
 *    convenciones, framework, topología y datos que consume el agente. El core
 *    define la forma abstracta y lo serializa; acá se ponen los valores reales
 *    del stack.
 *
 * El conocimiento específico de Laravel vive acá, en el adapter (Artículo II);
 * el core trata estos contenidos como dato opaco.
 *
 * @see SPEC-0007 AC-2, AC-3, AC-8
 */

import {
  serializePackManifest,
  PACK_MANIFEST_VERSION,
  type PackFile,
  type PackManifest,
  type ProjectTopology,
} from '@fractal/core';

/** Rutas del pack que referencia el manifiesto (fuente única). */
const CONVENTIONS_PATH = 'AGENTS.md';
const DOMAIN_FDL_PATH = 'fractal/domain.fdl.json';
const ADD_ENTITY_PROMPT_PATH = 'fractal/prompts/add-entity.md';

/** Respuesta de la acción `get-pack`. */
export interface GetPackResponse {
  files: PackFile[];
}

/**
 * Construye el FDL inicial del dominio como texto JSON determinista.
 *
 * El documento pasa las 12 reglas del validador del core (VR-1..VR-12): dos
 * entidades con una relación inversa coherente y un enum con default válido.
 * `project.name` toma el nombre del proyecto; el resto es estable byte a byte.
 */
function buildDomainFdl(projectName: string): string {
  const doc = {
    fdlVersion: '0',
    project: {
      name: projectName,
      description: 'Dominio inicial de ejemplo. Editá este contrato y validá con `fractal fdl check`.',
    },
    entities: [
      {
        name: 'Author',
        description: 'Autor del dominio de ejemplo.',
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'string', maxLength: 255 },
          { name: 'email', type: 'string', maxLength: 255, unique: true },
        ],
        relations: [
          { name: 'books', kind: 'one-to-many', target: 'Book', inverse: 'author' },
        ],
      },
      {
        name: 'Book',
        description: 'Libro escrito por un Author.',
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'string', maxLength: 255 },
          { name: 'publishedAt', type: 'date', nullable: true },
          {
            name: 'status',
            type: 'enum',
            values: ['draft', 'published'],
            default: 'draft',
          },
        ],
        relations: [
          { name: 'author', kind: 'many-to-one', target: 'Author', inverse: 'books' },
        ],
      },
    ],
  };

  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Construye el `AGENTS.md` del proyecto: convenciones reales del stack Laravel.
 *
 * Son documentos del proyecto (Artículo V): el proyecto es autónomo y el usuario
 * es dueño del código; no hay lenguaje del tipo "no toques esto".
 */
/**
 * Sección de estructura del repo en monorepo (FRA-114): backend en `api/`,
 * frontend en `web/`. En las demás topologías el backend está en la raíz.
 */
function buildLayoutSection(topology: ProjectTopology): string {
  if (topology !== 'monorepo') return '';
  return `
## Estructura del repo (monorepo)

- **Backend Laravel:** \`api/\` (todas las rutas de backend de abajo son
  relativas a \`api/\`).
- **Frontend:** \`web/\`, con el código fuente en \`web/src\`.
- **Deploy:** \`api/Dockerfile\` compila \`web/\` y lo sirve en \`/\`; la API
  queda en \`/api\` bajo el mismo dominio (\`docker/nginx/nginx.conf\`).
`;
}

function buildAgentsMd(projectName: string, topology: ProjectTopology = 'monolith'): string {
  // Prefijo de las rutas del backend: \`api/\` en monorepo, raíz en el resto.
  const b = topology === 'monorepo' ? 'api/' : '';
  const frontendSrc = topology === 'monorepo' ? ' (código en `web/src`)' : '';
  return `# Convenciones de agente — ${projectName}

Este proyecto usa un contrato de dominio en **FDL** (Fractal Definition Language)
y un backend **Laravel**. Cuando agregues o modifiques una entidad,
el FDL en \`fractal/domain.fdl.json\` es la fuente de verdad: primero se actualiza
y se valida el contrato, y recién después se escribe el código de cada capa
siguiendo estas convenciones.

## Fuente de verdad

- **Dominio:** \`fractal/domain.fdl.json\` (validá con \`fractal fdl check fractal/domain.fdl.json\`).
- **Prompt reutilizable:** \`fractal/prompts/add-entity.md\`.
${buildLayoutSection(topology)}
## Cómo mapear el FDL a cada capa

Para cada entidad del FDL, con sus \`fields\` (tipo, \`nullable\`, \`unique\`,
\`maxLength\`, \`precision\`/\`scale\`, \`default\`, \`values\` de enum) y sus
\`relations\` (\`one-to-many\`, \`many-to-one\`, \`many-to-many\`):

### Migración (${b}database/migrations)

- Un archivo de migración por entidad, con \`Schema::create\` de la tabla en
  plural snake_case (p. ej. \`Book\` → \`books\`).
- Mapeo de tipos abstractos → columnas: \`string\` → \`string(maxLength)\`,
  \`text\` → \`text\`, \`integer\`/\`bigInteger\` → \`integer\`/\`bigInteger\`,
  \`decimal\` → \`decimal(precision, scale)\`, \`boolean\` → \`boolean\`,
  \`date\`/\`time\`/\`datetime\` → \`date\`/\`time\`/\`dateTime\`, \`uuid\` → \`uuid\`,
  \`json\` → \`json\`, \`enum\` → \`enum(values)\`.
- \`nullable\` → \`->nullable()\`; \`unique\` → \`->unique()\`; \`default\` →
  \`->default(...)\`. La clave primaria es \`uuid\`/\`id\` según el campo con
  \`primaryKey: true\` (o el id implícito).
- Relaciones \`many-to-one\` → columna foránea \`<relation>_id\` con
  \`->constrained()\`; \`many-to-many\` → tabla pivote.

### Modelo (${b}app/Models)

- Un modelo Eloquent por entidad, con \`$fillable\` a partir de los \`fields\`,
  \`$casts\` para \`boolean\`, \`datetime\`, \`decimal\` y \`json\`.
- Relaciones Eloquent a partir de las \`relations\` del FDL: \`hasMany\`,
  \`belongsTo\`, \`belongsToMany\`, respetando \`inverse\` para nombrar el método.

### API / controlador / rutas

- Un controlador API por entidad en \`${b}app/Http/Controllers/Api\` con las acciones
  REST (index, show, store, update, destroy).
- Rutas bajo \`/api\` en \`${b}routes/api.php\` (p. ej. \`Route::apiResource('books', ...)\`).
- Validación en servidor para toda entrada (FormRequest), derivada de los
  modificadores del FDL (\`required\` si no es \`nullable\`, \`max\` desde
  \`maxLength\`, \`unique\`, \`in\` desde los \`values\` del enum).

### Frontend

- El frontend es un módulo aparte${frontendSrc}; sus convenciones están en
  \`fractal/frontends/\` (un archivo por frontend). Consume las rutas \`/api\`.

### Tests

- Toda entidad incluye sus tests (feature tests de la API y tests del modelo),
  cubriendo el camino feliz y las validaciones.

## Flujo recomendado

1. Editá \`fractal/domain.fdl.json\` para describir la entidad.
2. Validá el contrato: \`fractal fdl check fractal/domain.fdl.json\`.
3. Usá el prompt \`fractal/prompts/add-entity.md\` para generar las capas.
4. Corré la suite de tests y ajustá.
`;
}

/**
 * Construye el prompt reutilizable \`add-entity.md\`.
 *
 * Contiene SOLO instrucciones para el agente (sin código generado): parametriza
 * la entidad con el placeholder \`{{ENTIDAD}}\` y referencia el FDL validado y
 * \`AGENTS.md\`.
 */
function buildAddEntityPrompt(): string {
  return `# Prompt: agregar la entidad \`{{ENTIDAD}}\`

Reemplazá \`{{ENTIDAD}}\` por el nombre de la entidad (p. ej. \`Book\`) y seguí
estos pasos. No escribas nada hasta que el contrato valide.

## Contexto a leer primero

- \`fractal/domain.fdl.json\` — el contrato de dominio en FDL (fuente de verdad).
- \`AGENTS.md\` — las convenciones del stack real y el mapeo FDL → cada capa.

## Instrucciones

1. **Actualizá el contrato.** Agregá o ajustá la entidad \`{{ENTIDAD}}\` en
   \`fractal/domain.fdl.json\`: sus \`fields\` (con tipo y modificadores:
   \`nullable\`, \`unique\`, \`maxLength\`, \`precision\`/\`scale\`, \`default\`,
   \`values\` de enum) y sus \`relations\` (\`one-to-many\`, \`many-to-one\`,
   \`many-to-many\`, con \`inverse\` cuando corresponda).
2. **Validá el contrato.** Corré \`fractal fdl check fractal/domain.fdl.json\` y
   no avances hasta que pase sin violaciones.
3. **Generá cada capa** para \`{{ENTIDAD}}\` siguiendo \`AGENTS.md\`: migración,
   modelo, API/controlador/rutas, frontend y tests. Respetá los tipos y
   modificadores del FDL (incluyendo validación en servidor).
4. **Agregá los tests** de la entidad (API y modelo) y corré la suite.

## Reglas

- El FDL manda: si hay discrepancia entre el código y el contrato, corregí para
  que coincidan con el FDL validado.
- Respetá las convenciones de \`AGENTS.md\`; el código debe ser idiomático del
  stack y quedar listo para que lo modifiques a mano.
`;
}

/**
 * Construye el manifiesto declarativo del pack (FRA-104) con los valores reales
 * del stack Laravel.
 *
 * Declara las cuatro aristas que consume el agente — convenciones, framework,
 * topología y datos — más los prompts reutilizables, referenciando las rutas
 * de los otros archivos del pack. El core lo valida (campos requeridos +
 * cross-check de rutas) y lo serializa de forma determinista.
 */
function buildManifest(projectName: string, topology: ProjectTopology): PackManifest {
  return {
    manifestVersion: PACK_MANIFEST_VERSION,
    project: { name: projectName },
    framework: { adapter: 'laravel', name: 'Laravel' },
    topology,
    conventions: CONVENTIONS_PATH,
    data: { fdl: DOMAIN_FDL_PATH },
    prompts: [ADD_ENTITY_PROMPT_PATH],
  };
}

/**
 * Devuelve el pack de convenciones para un proyecto Laravel.
 *
 * Determinista y offline: mismas entradas ⇒ mismos archivos byte a byte.
 *
 * @param projectName - Nombre del proyecto (se inyecta en el FDL y los docs).
 * @param topology - Topología elegida en el wizard (se declara en el manifiesto).
 * @returns Los archivos del pack con rutas relativas al root del proyecto.
 */
export function getPack(
  projectName: string,
  topology: ProjectTopology = 'monolith'
): GetPackResponse {
  return {
    files: [
      { path: CONVENTIONS_PATH, contents: buildAgentsMd(projectName, topology) },
      { path: DOMAIN_FDL_PATH, contents: buildDomainFdl(projectName) },
      { path: ADD_ENTITY_PROMPT_PATH, contents: buildAddEntityPrompt() },
      serializePackManifest(buildManifest(projectName, topology)),
    ],
  };
}
