/**
 * Tests del parser de FDL (JSON → IR tipada).
 *
 * Cubren documentos bien formados (con defaults de §7.3 materializados) y
 * errores de forma de documento. La validación semántica (VR-1..VR-12) es
 * alcance de FRA-58 y se documenta aquí como explícitamente deferida.
 */

import { describe, it, expect } from 'vitest';
import { parseFdl, FdlParseError } from './parser.js';
import type { FdlParseErrorCode } from './parser.js';

/**
 * Ejecuta `parseFdl(source)` esperando que lance un FdlParseError, y afirma su
 * `code` y `path`. Devuelve el error para aserciones adicionales.
 */
function expectParseError(
  source: string,
  code: FdlParseErrorCode,
  path: string
): FdlParseError {
  let thrown: unknown;
  try {
    parseFdl(source);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(FdlParseError);
  const error = thrown as FdlParseError;
  expect(error.code).toBe(code);
  expect(error.path).toBe(path);
  return error;
}

describe('parseFdl', () => {
  describe('documentos bien formados', () => {
    it('parsea un documento mínimo', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [],
        })
      );
      expect(doc.fdlVersion).toBe('0');
      expect(doc.project.name).toBe('X');
      expect(doc.entities).toHaveLength(0);
    });

    it('materializa los defaults false de modificadores de campo cuando están ausentes', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'Blog' },
          entities: [
            {
              name: 'Post',
              fields: [{ name: 'title', type: 'string' }],
            },
          ],
        })
      );
      const field = doc.entities[0]!.fields[0]!;
      expect(field.nullable).toBe(false);
      expect(field.unique).toBe(false);
      expect(field.primaryKey).toBe(false);
    });

    it('preserva los modificadores de campo cuando están presentes', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'Blog' },
          entities: [
            {
              name: 'Post',
              fields: [
                {
                  name: 'slug',
                  type: 'string',
                  nullable: true,
                  unique: true,
                  primaryKey: true,
                },
              ],
            },
          ],
        })
      );
      const field = doc.entities[0]!.fields[0]!;
      expect(field.nullable).toBe(true);
      expect(field.unique).toBe(true);
      expect(field.primaryKey).toBe(true);
    });

    it('materializa el default false de relation.nullable', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'Blog' },
          entities: [
            {
              name: 'Comment',
              fields: [{ name: 'body', type: 'text' }],
              relations: [
                { name: 'post', kind: 'many-to-one', target: 'Post' },
              ],
            },
          ],
        })
      );
      const relation = doc.entities[0]!.relations![0]!;
      expect(relation.nullable).toBe(false);
      expect(relation.name).toBe('post');
      expect(relation.kind).toBe('many-to-one');
      expect(relation.target).toBe('Post');
    });

    it('preserva values en un campo enum', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'Shop' },
          entities: [
            {
              name: 'Order',
              fields: [
                {
                  name: 'status',
                  type: 'enum',
                  values: ['pending', 'paid', 'shipped'],
                },
              ],
            },
          ],
        })
      );
      expect(doc.entities[0]!.fields[0]!.values).toEqual([
        'pending',
        'paid',
        'shipped',
      ]);
    });

    it('preserva maxLength, precision, scale y default', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'Shop' },
          entities: [
            {
              name: 'Product',
              fields: [
                { name: 'sku', type: 'string', maxLength: 32 },
                {
                  name: 'price',
                  type: 'decimal',
                  precision: 10,
                  scale: 2,
                  default: 0,
                },
                { name: 'active', type: 'boolean', default: true },
                { name: 'name', type: 'string', default: 'untitled' },
              ],
            },
          ],
        })
      );
      const fields = doc.entities[0]!.fields;
      expect(fields[0]!.maxLength).toBe(32);
      expect(fields[1]!.precision).toBe(10);
      expect(fields[1]!.scale).toBe(2);
      expect(fields[1]!.default).toBe(0);
      expect(fields[2]!.default).toBe(true);
      expect(fields[3]!.default).toBe('untitled');
    });

    it('preserva descripciones de project y entidad y el inverse de relación', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'Blog', description: 'Un blog' },
          entities: [
            {
              name: 'Post',
              description: 'Una publicación',
              fields: [{ name: 'title', type: 'string' }],
              relations: [
                {
                  name: 'comments',
                  kind: 'one-to-many',
                  target: 'Comment',
                  inverse: 'post',
                },
              ],
            },
          ],
        })
      );
      expect(doc.project.description).toBe('Un blog');
      expect(doc.entities[0]!.description).toBe('Una publicación');
      expect(doc.entities[0]!.relations![0]!.inverse).toBe('post');
    });

    it('ignora claves desconocidas/extra y produce una IR limpia', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X', extraneo: 1 },
          entities: [
            {
              name: 'Post',
              unknownEntityKey: true,
              fields: [{ name: 'title', type: 'string', weird: 'x' }],
            },
          ],
          topLevelExtra: 'drop me',
        })
      );
      expect(doc).not.toHaveProperty('topLevelExtra');
      expect(doc.project).not.toHaveProperty('extraneo');
      expect(doc.entities[0]!).not.toHaveProperty('unknownEntityKey');
      expect(doc.entities[0]!.fields[0]!).not.toHaveProperty('weird');
    });
  });

  describe('errores de forma', () => {
    it('reporta INVALID_JSON ante JSON no parseable', () => {
      expectParseError('{ not json', 'INVALID_JSON', '(root)');
    });

    it('reporta INVALID_TYPE en (root) para un array de nivel superior', () => {
      expectParseError('[]', 'INVALID_TYPE', '(root)');
    });

    it('reporta INVALID_TYPE en (root) para un string de nivel superior', () => {
      expectParseError('"x"', 'INVALID_TYPE', '(root)');
    });

    it('reporta INVALID_TYPE en (root) para null de nivel superior', () => {
      expectParseError('null', 'INVALID_TYPE', '(root)');
    });

    it('reporta MISSING_KEY cuando falta fdlVersion', () => {
      expectParseError(
        JSON.stringify({ project: { name: 'X' }, entities: [] }),
        'MISSING_KEY',
        '(root)'
      );
    });

    it('reporta MISSING_KEY cuando falta project', () => {
      expectParseError(
        JSON.stringify({ fdlVersion: '0', entities: [] }),
        'MISSING_KEY',
        '(root)'
      );
    });

    it('reporta MISSING_KEY cuando falta entities', () => {
      expectParseError(
        JSON.stringify({ fdlVersion: '0', project: { name: 'X' } }),
        'MISSING_KEY',
        '(root)'
      );
    });

    it('reporta MISSING_KEY en project cuando falta project.name', () => {
      expectParseError(
        JSON.stringify({ fdlVersion: '0', project: {}, entities: [] }),
        'MISSING_KEY',
        'project'
      );
    });

    it('reporta INVALID_TYPE cuando project no es un objeto', () => {
      expectParseError(
        JSON.stringify({ fdlVersion: '0', project: 'nope', entities: [] }),
        'INVALID_TYPE',
        'project'
      );
    });

    it('reporta INVALID_TYPE cuando entities no es un array', () => {
      expectParseError(
        JSON.stringify({ fdlVersion: '0', project: { name: 'X' }, entities: {} }),
        'INVALID_TYPE',
        'entities'
      );
    });

    it('reporta MISSING_KEY en entities[0] cuando falta name', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [{ fields: [] }],
        }),
        'MISSING_KEY',
        'entities[0]'
      );
    });

    it('reporta MISSING_KEY en entities[0] cuando faltan fields', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [{ name: 'Post' }],
        }),
        'MISSING_KEY',
        'entities[0]'
      );
    });

    it('reporta INVALID_TYPE cuando entities[0].fields no es un array', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [{ name: 'Post', fields: {} }],
        }),
        'INVALID_TYPE',
        'entities[0].fields'
      );
    });

    it('reporta MISSING_KEY en entities[0].fields[0] cuando falta name', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [{ name: 'Post', fields: [{ type: 'string' }] }],
        }),
        'MISSING_KEY',
        'entities[0].fields[0]'
      );
    });

    it('reporta MISSING_KEY en entities[0].fields[0] cuando falta type', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [{ name: 'Post', fields: [{ name: 'title' }] }],
        }),
        'MISSING_KEY',
        'entities[0].fields[0]'
      );
    });

    it('reporta INVALID_TYPE cuando field.nullable no es boolean', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Post',
              fields: [{ name: 'title', type: 'string', nullable: 'yes' }],
            },
          ],
        }),
        'INVALID_TYPE',
        'entities[0].fields[0].nullable'
      );
    });

    it('reporta INVALID_TYPE cuando field.maxLength no es number', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Post',
              fields: [{ name: 'title', type: 'string', maxLength: '10' }],
            },
          ],
        }),
        'INVALID_TYPE',
        'entities[0].fields[0].maxLength'
      );
    });

    it('reporta INVALID_TYPE cuando field.default no es string/number/boolean', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Post',
              fields: [{ name: 'meta', type: 'json', default: { a: 1 } }],
            },
          ],
        }),
        'INVALID_TYPE',
        'entities[0].fields[0].default'
      );
    });

    it('reporta INVALID_TYPE cuando values no es un array', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Order',
              fields: [{ name: 'status', type: 'enum', values: 'pending' }],
            },
          ],
        }),
        'INVALID_TYPE',
        'entities[0].fields[0].values'
      );
    });

    it('reporta INVALID_TYPE cuando un elemento de values no es string', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Order',
              fields: [{ name: 'status', type: 'enum', values: ['ok', 2] }],
            },
          ],
        }),
        'INVALID_TYPE',
        'entities[0].fields[0].values[1]'
      );
    });

    it('reporta MISSING_KEY en entities[0].relations[0] cuando falta name', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Comment',
              fields: [],
              relations: [{ kind: 'many-to-one', target: 'Post' }],
            },
          ],
        }),
        'MISSING_KEY',
        'entities[0].relations[0]'
      );
    });

    it('reporta MISSING_KEY en entities[0].relations[0] cuando falta kind', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Comment',
              fields: [],
              relations: [{ name: 'post', target: 'Post' }],
            },
          ],
        }),
        'MISSING_KEY',
        'entities[0].relations[0]'
      );
    });

    it('reporta MISSING_KEY en entities[0].relations[0] cuando falta target', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Comment',
              fields: [],
              relations: [{ name: 'post', kind: 'many-to-one' }],
            },
          ],
        }),
        'MISSING_KEY',
        'entities[0].relations[0]'
      );
    });

    it('reporta INVALID_TYPE cuando entities[0].relations no es un array', () => {
      expectParseError(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [{ name: 'Comment', fields: [], relations: {} }],
        }),
        'INVALID_TYPE',
        'entities[0].relations'
      );
    });
  });

  describe('semantic validation is deferred to FRA-58', () => {
    // Estos documentos están BIEN FORMADOS (forma correcta) aunque sean
    // semánticamente inválidos. El parser NO debe lanzar: VR-1..VR-12 son
    // alcance de FRA-58. Se castea el valor a su tipo nominal sin verificar
    // membresía en el conjunto cerrado.

    it('no rechaza un field.type fuera del catálogo (VR-3)', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            { name: 'Post', fields: [{ name: 'f', type: 'banana' }] },
          ],
        })
      );
      expect(doc.entities[0]!.fields[0]!.type).toBe('banana');
    });

    it('no rechaza un relation.kind fuera de las cardinalidades (VR-8)', () => {
      const doc = parseFdl(
        JSON.stringify({
          fdlVersion: '0',
          project: { name: 'X' },
          entities: [
            {
              name: 'Post',
              fields: [],
              relations: [{ name: 'r', kind: 'weird', target: 'Y' }],
            },
          ],
        })
      );
      expect(doc.entities[0]!.relations![0]!.kind).toBe('weird');
    });

    it('no rechaza un fdlVersion no soportado (VR-7)', () => {
      const doc = parseFdl(
        JSON.stringify({ fdlVersion: '9', project: { name: 'X' }, entities: [] })
      );
      expect(doc.fdlVersion).toBe('9');
    });
  });
});
