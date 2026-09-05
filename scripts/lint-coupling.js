#!/usr/bin/env node
/**
 * Lint de acoplamiento — Artículo II de CONSTITUTION.md
 *
 * Verifica que packages/core y packages/deploy no contengan referencias a
 * frameworks específicos. Todo conocimiento de framework debe vivir
 * exclusivamente en packages/adapter-*.
 *
 * Referencias: ADR-0002, Artículo II de docs/CONSTITUTION.md
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');

// Términos prohibidos en core y deploy (ADR-0002)
const FORBIDDEN_TERMS = [
  'laravel',
  'artisan',
  'eloquent',
  'blade',
  'composer',
  'rails',
  'activerecord',
  'gemfile',
  'bundler',
  'erb',
];

// Paquetes que deben ser agnósticos
const AGNOSTIC_PACKAGES = ['core', 'deploy'];

// Extensiones de archivo a revisar
const TEXT_EXTENSIONS = ['.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml'];

// Archivos que se permiten mencionar frameworks (documentación)
const ALLOWED_FILES = ['README.md'];

/**
 * Lee archivos recursivamente en un directorio
 */
async function* walkDir(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      // Ignorar node_modules, dist, y test
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'test') {
        continue;
      }
      
      if (entry.isDirectory()) {
        yield* walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = entry.name.substring(entry.name.lastIndexOf('.'));
        // Excluir archivos de test
        const isTestFile = entry.name.endsWith('.test.ts') || 
                          entry.name.endsWith('.test.js') ||
                          entry.name.endsWith('.spec.ts') ||
                          entry.name.endsWith('.spec.js');
        
        if (TEXT_EXTENSIONS.includes(ext) && 
            !ALLOWED_FILES.includes(entry.name) && 
            !isTestFile) {
          yield fullPath;
        }
      }
    }
  } catch (err) {
    // Si el directorio no existe, no hay nada que revisar
    if (err.code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

/**
 * Busca términos prohibidos en un archivo
 */
async function checkFile(filePath, forbiddenTerms) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    for (const term of forbiddenTerms) {
      // Buscar el término como palabra completa (con word boundaries)
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(line)) {
        violations.push({
          line: i + 1,
          content: line.trim(),
          term,
        });
      }
    }
  }

  return violations;
}

/**
 * Ejecuta el lint sobre los paquetes agnósticos
 */
async function lintCoupling() {
  let hasViolations = false;
  
  console.log('🔍 Lint de acoplamiento — Artículo II\n');
  console.log(`Paquetes agnósticos: ${AGNOSTIC_PACKAGES.join(', ')}`);
  console.log(`Términos prohibidos: ${FORBIDDEN_TERMS.join(', ')}\n`);
  
  for (const pkg of AGNOSTIC_PACKAGES) {
    const pkgPath = join(repoRoot, 'packages', pkg);
    const relPkgPath = relative(repoRoot, pkgPath);
    
    console.log(`Revisando ${relPkgPath}...`);
    
    let fileCount = 0;
    let violationCount = 0;
    
    for await (const filePath of walkDir(pkgPath)) {
      fileCount++;
      const violations = await checkFile(filePath, FORBIDDEN_TERMS);
      
      if (violations.length > 0) {
        hasViolations = true;
        const relPath = relative(repoRoot, filePath);
        
        console.error(`\n❌ ${relPath}:`);
        for (const violation of violations) {
          console.error(`   Línea ${violation.line}: encontrado "${violation.term}"`);
          console.error(`   > ${violation.content}`);
          violationCount++;
        }
      }
    }
    
    if (violationCount === 0 && fileCount > 0) {
      console.log(`   ✅ ${fileCount} archivos revisados, sin violaciones`);
    } else if (fileCount === 0) {
      console.log(`   ℹ️  Paquete vacío (sin archivos que revisar)`);
    }
  }
  
  console.log('');
  
  if (hasViolations) {
    console.error('❌ Lint de acoplamiento falló');
    console.error('');
    console.error('Los paquetes core y deploy no pueden contener referencias a frameworks.');
    console.error('Todo conocimiento específico debe vivir en packages/adapter-*.');
    console.error('');
    console.error('Referencias:');
    console.error('  - docs/CONSTITUTION.md (Artículo II)');
    console.error('  - docs/adr/0002-arquitectura-multi-target.md');
    process.exit(1);
  } else {
    console.log('✅ Lint de acoplamiento pasó');
    process.exit(0);
  }
}

// Ejecutar
lintCoupling().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
