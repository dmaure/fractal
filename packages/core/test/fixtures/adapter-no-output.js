#!/usr/bin/env node
/**
 * Mock adapter que no devuelve nada por stdout
 */

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  // No output
  process.exit(0);
});
