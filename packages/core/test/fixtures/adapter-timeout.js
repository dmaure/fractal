#!/usr/bin/env node
/**
 * Mock adapter que nunca termina (para probar timeout)
 */

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  // Nunca terminar
  setInterval(() => {}, 1000);
});
