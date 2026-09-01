#!/usr/bin/env node
/**
 * Mock adapter que devuelve JSON inválido
 */

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  console.log('{ invalid json }');
  process.exit(0);
});
