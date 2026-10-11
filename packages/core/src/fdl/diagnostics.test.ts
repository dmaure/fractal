/**
 * Tests de la capa de diagnósticos legibles de FDL (FRA-59, T4).
 *
 * Cubren (1) los errores de forma del parser (INVALID_JSON, MISSING_KEY,
 * INVALID_TYPE) y (2) las violaciones semánticas del validador (VR-1..VR-12),
 * afirmando que cada diagnóstico resuelve la ubicación correcta (entidad /
 * campo / relación por nombre cuando hay documento), el código/regla correcto y
 * un mensaje legible sin stacktrace. Incluye el flujo de punta a punta
 * (`diagnoseFdl`) y un snapshot determinístico del formateo.
 *
 * Los factories `validMinimal`/`validRelational` se copian de validator.test.ts
 * para construir documentos válidos que luego se mutan hacia la invalidez.
 */

import { describe, it, expect } from 'vitest';
import {
  diagnoseFdl,
  diagnoseParseError,
  diagnoseValidation,
  parseLocation,
  describeLocation,
  formatDiagnostic,
  formatDiagnostics,
} from './diagnostics.js';
import type { FdlDiagnostic } from './diagnostics.js';
import { FdlParseError } from './parser.js';
import { validateFdl } from './validator.js';
import type { FdlDocument } from '../types/fdl.js';

/** Documento mínimo totalmente válido: una entidad con todos los modificadores. */
function validMinimal(): FdlDocument {
  return {
    fdlVersion: '0',
    project: { name: 'Shop' },
    entities: [
      {
        name: 'Product',
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'string', maxLength: 255 },
          { name: 'price', type: 'decimal', precision: 10, scale: 2, default: 0 },
          {
            name: 'status',
            type: 'enum',
            values: ['active', 'archived'],
            default: 'active',
          },
        ],
      },
    ],
  };
}

/** Documento relacional válido: dos entidades con relaciones inversas coherentes. */
function validRelational(): FdlDocument {
  return {
    fdlVersion: '0',
    project: { name: 'Shop' },
    entities: [
      {
        name: 'Product',
        fields: [{ name: 'id', type: 'uuid', primaryKey: true }],
        relations: [
          { name: 'orders', kind: 'one-to-many', target: 'Order', inverse: 'product' },
        ],
      },
      {
        name: 'Order',
        fields: [{ name: 'id', type: 'uuid', primaryKey: true }],
        relations: [
          {
            name: 'product',
            kind: 'many-to-one',
            target: 'Product',
            inverse: 'orders',
            nullable: false,
          },
        ],
      },
    ],
  };
}

/** Tipo del `type` de un campo, para castear valores fuera del catálogo. */
type AnyFieldType = FdlDocument['entities'][number]['fields'][number]['type'];

/** Devuelve el primer diagnóstico con el código dado, o falla si no existe. */
function byCode(diagnostics: FdlDiagnostic[], code: FdlDiagnostic['code']): FdlDiagnostic {
  const found = diagnostics.find((d) => d.code === code);
  expect(found, `expected a diagnostic with code ${code}`).toBeDefined();
  return found as FdlDiagnostic;
}

describe('diagnostics — errores de forma (parser)', () => {
  it('INVALID_JSON: fuente no parseable → documento, mensaje legible sin stack', () => {
    const diagnostics = diagnoseFdl('{ not json');
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0]!;
    expect(d.source).toBe('parse');
    expect(d.code).toBe('INVALID_JSON');
    expect(d.location.kind).toBe('document');
    expect(d.location.path).toBe('(root)');
    expect(typeof d.message).toBe('string');
    expect(d.message).toContain('the document');
    expect(d.message.toLowerCase()).not.toContain('stack');
  });

  it('MISSING_KEY: falta project.name → ubicación de proyecto', () => {
    const src = JSON.stringify({ fdlVersion: '0', project: {}, entities: [] });
    const diagnostics = diagnoseFdl(src);
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0]!;
    expect(d.source).toBe('parse');
    expect(d.code).toBe('MISSING_KEY');
    expect(d.location.kind).toBe('project');
    expect(d.location.path).toBe('project');
    expect(d.message).toContain('the project');
  });

  it('INVALID_TYPE: nullable no booleano → campo, fallback por segmento de ruta', () => {
    const src = JSON.stringify({
      fdlVersion: '0',
      project: { name: 'Shop' },
      entities: [
        { name: 'Product', fields: [{ name: 'id', type: 'uuid', nullable: 'yes' }] },
      ],
    });
    const diagnostics = diagnoseFdl(src);
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0]!;
    expect(d.code).toBe('INVALID_TYPE');
    expect(d.location.kind).toBe('field');
    expect(d.location.path.endsWith('.nullable')).toBe(true);
    // Sin documento, el nombre de campo no se resuelve: fallback por segmento.
    expect(d.message).toContain('the field at entities[0].fields[0]');
    expect(d.location.field).toBeUndefined();
  });

  it('diagnoseParseError no lee stack y antepone el localizador', () => {
    const error = new FdlParseError('MISSING_KEY', 'project', 'Missing required key "name" at project.');
    const d = diagnoseParseError(error);
    expect(d.source).toBe('parse');
    expect(d.message).toBe('the project: Missing required key "name" at project.');
  });
});

describe('diagnostics — violaciones semánticas (validador)', () => {
  it('VR-5: target inexistente → relación con entidad resuelta', () => {
    const doc = validMinimal();
    doc.entities[0]!.relations = [
      { name: 'orders', kind: 'one-to-many', target: 'Ghost' },
    ];
    const diagnostics = diagnoseValidation(doc, validateFdl(doc));
    const d = byCode(diagnostics, 'VR-5');
    expect(d.source).toBe('validate');
    expect(d.location.kind).toBe('relation');
    expect(d.location.entity).toBe('Product');
    expect(d.location.relation).toBe('orders');
    expect(d.location.path).toBe('entities[0].relations[0].target');
    const line = formatDiagnostic(d);
    expect(line).toContain('relation "orders" of entity "Product"');
    expect(line).toContain('[VR-5]');
  });

  it('VR-1: nombre de entidad duplicado → entidad con nombre resuelto', () => {
    const doc = validMinimal();
    doc.entities.push({
      name: 'Product',
      fields: [{ name: 'id', type: 'uuid', primaryKey: true }],
    });
    const diagnostics = diagnoseFdl(JSON.stringify(doc));
    const d = byCode(diagnostics, 'VR-1');
    expect(d.location.kind).toBe('entity');
    expect(d.location.entity).toBe('Product');
    expect(d.message).toContain('entity "Product"');
  });

  it('VR-3: tipo desconocido → campo con entidad y campo resueltos', () => {
    const doc = validMinimal();
    doc.entities[0]!.fields.push({ name: 'weird', type: 'banana' as AnyFieldType });
    const diagnostics = diagnoseValidation(doc, validateFdl(doc));
    const d = byCode(diagnostics, 'VR-3');
    expect(d.location.kind).toBe('field');
    expect(d.location.entity).toBe('Product');
    expect(d.location.field).toBe('weird');
    // El hecho crudo de VR-3 no nombra la entidad; describeLocation sí.
    expect(d.message).toContain('field "weird" of entity "Product"');
    expect(d.message).toContain('unknown field type "banana"');
  });

  it('VR-9: default incompatible → campo', () => {
    const doc = validMinimal();
    doc.entities[0]!.fields.push({ name: 'qty', type: 'integer', default: 'hello' });
    const diagnostics = diagnoseValidation(doc, validateFdl(doc));
    const d = byCode(diagnostics, 'VR-9');
    expect(d.location.kind).toBe('field');
    expect(d.location.entity).toBe('Product');
    expect(d.location.field).toBe('qty');
  });

  it('VR-12: inverse incoherente → relación', () => {
    const doc = validRelational();
    doc.entities[0]!.relations![0]!.inverse = 'ghost';
    const diagnostics = diagnoseValidation(doc, validateFdl(doc));
    const d = byCode(diagnostics, 'VR-12');
    expect(d.location.kind).toBe('relation');
    expect(d.location.entity).toBe('Product');
    expect(d.location.relation).toBe('orders');
  });
});

describe('diagnostics — helpers de ubicación', () => {
  it('parseLocation resuelve nombres con documento', () => {
    const doc = validRelational();
    const loc = parseLocation('entities[1].relations[0].target', doc);
    expect(loc.kind).toBe('relation');
    expect(loc.entity).toBe('Order');
    expect(loc.relation).toBe('product');
  });

  it('describeLocation cae al segmento de ruta sin nombres', () => {
    expect(describeLocation(parseLocation('fdlVersion'))).toBe('the document version');
    expect(describeLocation(parseLocation('entities[2]'))).toBe('the entity at entities[2]');
    expect(describeLocation(parseLocation('entities[0].relations[1].kind'))).toBe(
      'the relation at entities[0].relations[1]'
    );
  });
});

describe('diagnostics — punta a punta', () => {
  it('documento válido mínimo → sin diagnósticos', () => {
    expect(diagnoseFdl(JSON.stringify(validMinimal()))).toEqual([]);
  });

  it('documento válido relacional → sin diagnósticos', () => {
    expect(diagnoseFdl(JSON.stringify(validRelational()))).toEqual([]);
  });

  it('formatDiagnostics([]) → cadena vacía legible', () => {
    expect(formatDiagnostics([])).toBe('No FDL diagnostics.');
  });

  it('snapshot: documento con VR-3 y VR-5 (orden determinístico)', () => {
    const src = JSON.stringify({
      fdlVersion: '0',
      project: { name: 'Shop' },
      entities: [
        {
          name: 'Product',
          fields: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'weird', type: 'banana' },
          ],
          relations: [{ name: 'orders', kind: 'one-to-many', target: 'Ghost' }],
        },
      ],
    });
    expect(formatDiagnostics(diagnoseFdl(src))).toMatchInlineSnapshot(`
      "2 FDL diagnostic(s):
        - [VR-3] field "weird" of entity "Product": unknown field type "banana" (entities[0].fields[1].type)
        - [VR-5] relation "orders" of entity "Product": relation target "Ghost" does not name an existing entity (entities[0].relations[0].target)"
    `);
  });
});
