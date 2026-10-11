/**
 * Tests del validador semántico de FDL (VR-1..VR-12).
 *
 * Cada regla VR-x tiene un caso POSITIVO (documento válido → sin violación de
 * esa regla) y uno NEGATIVO (documento mutado para violar exactamente esa regla
 * → violación de esa regla). Los factories `validMinimal` y `validRelational`
 * producen documentos que pasan las 12 reglas (cubren los ejemplos de
 * SPEC-0004 §7.6 como casos válidos).
 */

import { describe, it, expect } from 'vitest';
import { validateFdl } from './validator.js';
import type { FdlValidationRule } from './validator.js';
import type { FdlDocument, RelationKind } from '../types/fdl.js';

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

/** Afirma que el documento es inválido y tiene una violación de `rule`. */
function expectViolation(doc: FdlDocument, rule: FdlValidationRule): void {
  const result = validateFdl(doc);
  expect(result.valid).toBe(false);
  expect(result.violations.some((v) => v.rule === rule)).toBe(true);
}

/** Afirma que el documento no tiene ninguna violación de `rule`. */
function expectNoViolation(doc: FdlDocument, rule: FdlValidationRule): void {
  const result = validateFdl(doc);
  expect(result.violations.some((v) => v.rule === rule)).toBe(false);
}

describe('validateFdl', () => {
  describe('documentos válidos de referencia', () => {
    it('validMinimal() pasa las 12 reglas', () => {
      const result = validateFdl(validMinimal());
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('validRelational() pasa las 12 reglas', () => {
      const result = validateFdl(validRelational());
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('VR-1 nombres de entidad', () => {
    it('positivo: entidad con nombre válido y único', () => {
      expectNoViolation(validMinimal(), 'VR-1');
    });

    it('negativo: dos entidades con el mismo nombre', () => {
      const doc = validMinimal();
      doc.entities.push({
        name: 'Product',
        fields: [{ name: 'id', type: 'uuid', primaryKey: true }],
      });
      expectViolation(doc, 'VR-1');
    });
  });

  describe('VR-2 nombres de campo', () => {
    it('positivo: campos con nombres válidos y únicos', () => {
      expectNoViolation(validMinimal(), 'VR-2');
    });

    it('negativo: dos campos con el mismo nombre', () => {
      const doc = validMinimal();
      doc.entities[0]!.fields.push({ name: 'qty', type: 'integer' });
      doc.entities[0]!.fields.push({ name: 'qty', type: 'integer' });
      expectViolation(doc, 'VR-2');
    });

    it('negativo: campo "id" sin primaryKey', () => {
      const doc = validMinimal();
      doc.entities[0]!.fields.push({ name: 'id', type: 'string' });
      expectViolation(doc, 'VR-2');
    });
  });

  describe('VR-3 tipo y modificadores', () => {
    it('positivo: modificadores en su tipo correcto', () => {
      expectNoViolation(validMinimal(), 'VR-3');
    });

    it('negativo: precision en un campo string (modificador en tipo incorrecto)', () => {
      const doc = validMinimal();
      doc.entities[0]!.fields.push({ name: 'code', type: 'string', precision: 2 });
      expectViolation(doc, 'VR-3');
    });

    it('negativo: tipo fuera del catálogo', () => {
      const doc = validMinimal();
      doc.entities[0]!.fields.push({
        name: 'weird',
        type: 'banana' as FdlDocument['entities'][number]['fields'][number]['type'],
      });
      expectViolation(doc, 'VR-3');
    });
  });

  describe('VR-4 enum', () => {
    it('positivo: enum con values no vacío y sin duplicados', () => {
      expectNoViolation(validMinimal(), 'VR-4');
    });

    it('negativo: enum con values duplicados', () => {
      const doc = validMinimal();
      doc.entities[0]!.fields.push({ name: 'kind', type: 'enum', values: ['a', 'a'] });
      expectViolation(doc, 'VR-4');
    });
  });

  describe('VR-5 integridad referencial', () => {
    it('positivo: targets existentes', () => {
      expectNoViolation(validRelational(), 'VR-5');
    });

    it('negativo: relación con target inexistente', () => {
      const doc = validMinimal();
      doc.entities[0]!.relations = [
        { name: 'ghosts', kind: 'one-to-many', target: 'Ghost' },
      ];
      expectViolation(doc, 'VR-5');
    });
  });

  describe('VR-6 nombres de relación', () => {
    it('positivo: nombres de relación únicos y sin colisión con campos', () => {
      expectNoViolation(validRelational(), 'VR-6');
    });

    it('negativo: relación con el mismo nombre que un campo de la entidad', () => {
      const doc = validMinimal();
      doc.entities[0]!.relations = [
        { name: 'title', kind: 'one-to-many', target: 'Product' },
      ];
      expectViolation(doc, 'VR-6');
    });
  });

  describe('VR-7 versión', () => {
    it('positivo: fdlVersion soportado', () => {
      expectNoViolation(validMinimal(), 'VR-7');
    });

    it('negativo: fdlVersion no soportado', () => {
      const doc = validMinimal();
      doc.fdlVersion = '9' as FdlDocument['fdlVersion'];
      expectViolation(doc, 'VR-7');
    });
  });

  describe('VR-8 cardinalidad', () => {
    it('positivo: kinds válidos', () => {
      expectNoViolation(validRelational(), 'VR-8');
    });

    it('negativo: kind fuera de las cardinalidades', () => {
      const doc = validRelational();
      doc.entities[0]!.relations![0]!.kind = 'weird' as RelationKind;
      expectViolation(doc, 'VR-8');
    });
  });

  describe('VR-9 default compatible', () => {
    it('positivo: defaults compatibles con su tipo', () => {
      expectNoViolation(validMinimal(), 'VR-9');
    });

    it('negativo: campo integer con default string', () => {
      const doc = validMinimal();
      doc.entities[0]!.fields.push({ name: 'qty', type: 'integer', default: 'hello' });
      expectViolation(doc, 'VR-9');
    });
  });

  describe('VR-10 agnosticismo', () => {
    it('positivo: identificadores sin vocabulario de framework', () => {
      expectNoViolation(validMinimal(), 'VR-10');
    });

    it('negativo: entidad con nombre de ORM', () => {
      const doc = validMinimal();
      doc.entities.push({
        name: 'Eloquent',
        fields: [{ name: 'id', type: 'uuid', primaryKey: true }],
      });
      expectViolation(doc, 'VR-10');
    });
  });

  describe('VR-11 clave primaria única', () => {
    it('positivo: una sola primaryKey por entidad', () => {
      expectNoViolation(validMinimal(), 'VR-11');
    });

    it('negativo: dos campos con primaryKey true', () => {
      const doc = validMinimal();
      doc.entities[0]!.fields.push({ name: 'uid', type: 'uuid', primaryKey: true });
      expectViolation(doc, 'VR-11');
    });
  });

  describe('VR-12 inverse coherente', () => {
    it('positivo: inverses que nombran relaciones existentes en el target', () => {
      expectNoViolation(validRelational(), 'VR-12');
    });

    it('negativo: inverse que no nombra ninguna relación del target existente', () => {
      const doc = validRelational();
      doc.entities[0]!.relations![0]!.inverse = 'ghost';
      expectViolation(doc, 'VR-12');
    });
  });
});
