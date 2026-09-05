#!/usr/bin/env node
/**
 * Mock adapter que devuelve error (success: false)
 */

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  const response = {
    success: false,
    error: {
      message: 'Error de validación en el adapter',
      step: 'validación'
    }
  };
  console.log(JSON.stringify(response));
  process.exit(0);
});
