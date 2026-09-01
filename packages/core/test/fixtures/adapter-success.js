#!/usr/bin/env node
/**
 * Mock adapter que devuelve éxito
 */

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk.toString();
});

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const response = {
      success: true,
      data: {
        received: payload,
        message: 'Operación exitosa'
      }
    };
    console.log(JSON.stringify(response));
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
});
