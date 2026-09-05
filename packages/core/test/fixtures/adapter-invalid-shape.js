#!/usr/bin/env node
/**
 * Mock adapter que devuelve JSON válido pero sin el campo success
 */

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  console.log(JSON.stringify({ data: 'sin campo success' }));
  process.exit(0);
});
