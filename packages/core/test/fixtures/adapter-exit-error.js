#!/usr/bin/env node
/**
 * Mock adapter que termina con exit code != 0
 */

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  console.error('Error fatal en el adapter');
  process.exit(1);
});
