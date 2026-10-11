/**
 * Tests de tipos de FDL v0.
 *
 * Verifica que los tipos cumplen el shape de SPEC-0004 §7 a nivel de
 * compilación: documentos válidos compilan; documentos con campos
 * obligatorios faltantes o un valor fuera del conjunto no compilan. No prueba
 * validación semántica (VR-1..VR-12, alcance de SPEC-0005).
 *
 * @see SPEC-0004 §7
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  FdlVersion,
  FieldType,
  RelationKind,
  FdlFieldDefault,
  FdlProject,
  FdlField,
  FdlRelation,
  FdlEntity,
  FdlDocument,
} from './fdl.js';

describe('FDL v0 Types', () => {
  describe('FdlDocument - ejemplos de §7.6', () => {
    it('debe compilar el ejemplo mínimo (§7.6)', () => {
      const minimo: FdlDocument = {
        fdlVersion: '0',
        project: { name: 'tienda' },
        entities: [
          {
            name: 'Producto',
            fields: [{ name: 'nombre', type: 'string', maxLength: 120 }],
          },
        ],
      };

      expect(minimo.fdlVersion).toBe('0');
      expect(minimo.project.name).toBe('tienda');
      expect(minimo.entities).toHaveLength(1);
      expect(minimo.entities[0].fields[0].maxLength).toBe(120);
    });

    it('debe compilar el ejemplo relacional (§7.6)', () => {
      const relacional: FdlDocument = {
        fdlVersion: '0',
        project: {
          name: 'tienda',
          description: 'Catálogo de productos y pedidos',
        },
        entities: [
          {
            name: 'Producto',
            description: 'Un artículo vendible',
            fields: [
              { name: 'nombre', type: 'string', maxLength: 120, unique: true },
              { name: 'precio', type: 'decimal', precision: 10, scale: 2 },
              {
                name: 'estado',
                type: 'enum',
                values: ['borrador', 'publicado'],
                default: 'borrador',
              },
              { name: 'descripcion', type: 'text', nullable: true },
            ],
            relations: [
              {
                name: 'pedidos',
                kind: 'one-to-many',
                target: 'Pedido',
                inverse: 'producto',
              },
            ],
          },
          {
            name: 'Pedido',
            fields: [
              { name: 'cantidad', type: 'integer' },
              { name: 'creadoEn', type: 'datetime' },
            ],
            relations: [
              {
                name: 'producto',
                kind: 'many-to-one',
                target: 'Producto',
                inverse: 'pedidos',
              },
            ],
          },
        ],
      };

      expect(relacional.entities).toHaveLength(2);
      expect(relacional.entities[0].relations?.[0].kind).toBe('one-to-many');
      expect(relacional.entities[1].relations?.[0].kind).toBe('many-to-one');
    });
  });

  describe('FdlField - modificadores por categoría', () => {
    it('debe compilar maxLength sobre string', () => {
      const field: FdlField = { name: 'nombre', type: 'string', maxLength: 255 };
      expect(field.maxLength).toBe(255);
    });

    it('debe compilar precision/scale sobre decimal', () => {
      const field: FdlField = {
        name: 'precio',
        type: 'decimal',
        precision: 10,
        scale: 2,
      };
      expect(field.precision).toBe(10);
      expect(field.scale).toBe(2);
    });

    it('debe compilar values sobre enum', () => {
      const field: FdlField = {
        name: 'estado',
        type: 'enum',
        values: ['borrador', 'publicado'],
      };
      expect(field.values).toHaveLength(2);
    });

    it('debe compilar default y los flags nullable/unique/primaryKey', () => {
      const field: FdlField = {
        name: 'activo',
        type: 'boolean',
        nullable: false,
        unique: false,
        primaryKey: false,
        default: true,
      };
      expect(field.default).toBe(true);
      expect(field.nullable).toBe(false);
      expect(field.unique).toBe(false);
      expect(field.primaryKey).toBe(false);
    });

    it('default admite string, number o boolean', () => {
      const asString: FdlFieldDefault = 'borrador';
      const asNumber: FdlFieldDefault = 0;
      const asBoolean: FdlFieldDefault = true;
      expect([asString, asNumber, asBoolean]).toHaveLength(3);
      expectTypeOf<FdlFieldDefault>().toEqualTypeOf<string | number | boolean>();
    });
  });

  describe('FieldType - catálogo de §7.4', () => {
    it('debe aceptar cada tipo escalar del conjunto base', () => {
      const types: FieldType[] = [
        'string',
        'text',
        'integer',
        'bigInteger',
        'decimal',
        'float',
        'boolean',
        'date',
        'time',
        'datetime',
        'uuid',
        'json',
        'enum',
      ];

      types.forEach((type) => {
        const field: FdlField = { name: 'campo', type };
        expect(field.type).toBe(type);
      });
      expect(types).toHaveLength(13);
    });

    it('debe incluir string/decimal/enum en la unión', () => {
      expectTypeOf<'string' | 'decimal' | 'enum'>().toMatchTypeOf<FieldType>();
    });
  });

  describe('RelationKind - cardinalidades de §7.5', () => {
    it('debe aceptar las 3 cardinalidades', () => {
      const kinds: RelationKind[] = ['one-to-many', 'many-to-one', 'many-to-many'];
      kinds.forEach((kind) => {
        const relation: FdlRelation = { name: 'rel', kind, target: 'Otra' };
        expect(relation.kind).toBe(kind);
      });
    });

    it('debe ser exactamente la unión de las 3 cardinalidades', () => {
      expectTypeOf<RelationKind>().toEqualTypeOf<
        'one-to-many' | 'many-to-one' | 'many-to-many'
      >();
    });
  });

  describe('FdlVersion', () => {
    it('debe ser exactamente "0" en v0', () => {
      const version: FdlVersion = '0';
      expect(version).toBe('0');
      expectTypeOf<FdlVersion>().toEqualTypeOf<'0'>();
    });
  });

  describe('shape de los tipos', () => {
    it('FdlProject tiene name obligatorio y description opcional', () => {
      const project: FdlProject = { name: 'tienda' };
      expect(project.name).toBe('tienda');
      expectTypeOf<FdlProject>().toMatchTypeOf<{
        name: string;
        description?: string;
      }>();
    });

    it('FdlDocument tiene fdlVersion/project/entities', () => {
      expectTypeOf<FdlDocument>().toHaveProperty('fdlVersion');
      expectTypeOf<FdlDocument>().toHaveProperty('project');
      expectTypeOf<FdlDocument>().toHaveProperty('entities');
    });

    it('FdlEntity tiene name/fields', () => {
      expectTypeOf<FdlEntity>().toHaveProperty('name');
      expectTypeOf<FdlEntity>().toHaveProperty('fields');
    });
  });

  describe('FdlDocument - negative tests', () => {
    it('debe fallar sin fdlVersion', () => {
      // @ts-expect-error - fdlVersion es requerido
      const doc: FdlDocument = {
        project: { name: 'tienda' },
        entities: [{ name: 'Producto', fields: [{ name: 'nombre', type: 'string' }] }],
      };
      expect(doc).toBeDefined();
    });

    it('debe fallar sin project', () => {
      // @ts-expect-error - project es requerido
      const doc: FdlDocument = {
        fdlVersion: '0',
        entities: [{ name: 'Producto', fields: [{ name: 'nombre', type: 'string' }] }],
      };
      expect(doc).toBeDefined();
    });

    it('debe fallar sin entities', () => {
      // @ts-expect-error - entities es requerido
      const doc: FdlDocument = {
        fdlVersion: '0',
        project: { name: 'tienda' },
      };
      expect(doc).toBeDefined();
    });

    it('debe fallar con fdlVersion distinta de "0"', () => {
      const doc: FdlDocument = {
        // @ts-expect-error - "1" no es una FdlVersion soportada en v0
        fdlVersion: '1',
        project: { name: 'tienda' },
        entities: [{ name: 'Producto', fields: [{ name: 'nombre', type: 'string' }] }],
      };
      expect(doc).toBeDefined();
    });
  });

  describe('FdlEntity - negative tests', () => {
    it('debe fallar sin name', () => {
      // @ts-expect-error - name es requerido
      const entity: FdlEntity = {
        fields: [{ name: 'nombre', type: 'string' }],
      };
      expect(entity).toBeDefined();
    });

    it('debe fallar sin fields', () => {
      // @ts-expect-error - fields es requerido
      const entity: FdlEntity = {
        name: 'Producto',
      };
      expect(entity).toBeDefined();
    });
  });

  describe('FdlField - negative tests', () => {
    it('debe fallar sin name', () => {
      // @ts-expect-error - name es requerido
      const field: FdlField = { type: 'string' };
      expect(field).toBeDefined();
    });

    it('debe fallar sin type', () => {
      // @ts-expect-error - type es requerido
      const field: FdlField = { name: 'nombre' };
      expect(field).toBeDefined();
    });

    it('debe fallar con un type fuera del catálogo', () => {
      const field: FdlField = {
        name: 'nombre',
        // @ts-expect-error - 'notAType' no pertenece a FieldType
        type: 'notAType',
      };
      expect(field).toBeDefined();
    });
  });

  describe('FdlRelation - negative tests', () => {
    it('debe fallar sin kind', () => {
      // @ts-expect-error - kind es requerido
      const relation: FdlRelation = { name: 'pedidos', target: 'Pedido' };
      expect(relation).toBeDefined();
    });

    it('debe fallar sin target', () => {
      // @ts-expect-error - target es requerido
      const relation: FdlRelation = { name: 'pedidos', kind: 'one-to-many' };
      expect(relation).toBeDefined();
    });

    it('debe fallar con una cardinalidad inválida', () => {
      const relation: FdlRelation = {
        name: 'pedidos',
        // @ts-expect-error - 'one-to-one' no es una RelationKind soportada
        kind: 'one-to-one',
        target: 'Pedido',
      };
      expect(relation).toBeDefined();
    });
  });
});
