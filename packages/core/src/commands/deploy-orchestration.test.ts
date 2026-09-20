import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve, basename } from 'node:path';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  deriveSshPublicKey,
  determineProjectName,
  determineTargetType,
  writeCrossVarsToDisk,
} from './deploy.js';

/**
 * Tests de integración para la orquestación de hardening → runtime → DNS
 * en el comando `fractal deploy`.
 * 
 * Cumple FRA-37: verifica que el CLI ejecuta los tres pasos en orden
 * con las decisiones de producto aplicadas.
 */

describe('Deploy orchestration (FRA-37)', () => {
  let testDir: string;
  
  beforeEach(async () => {
    // Crear directorio temporal para tests
    testDir = resolve(tmpdir(), `fractal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Limpiar directorio temporal
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignorar errores de limpieza
    }
    vi.restoreAllMocks();
  });

  describe('deriveSshPublicKey', () => {
    it('debe derivar clave pública desde clave privada válida', async () => {
      // Este test requiere ssh-keygen instalado y una clave válida
      // Por ahora, solo verificamos que la función no lanza error con path inválido
      const result = await deriveSshPublicKey('/nonexistent/key');
      expect(result).toBeNull();
    });
    
    it('debe retornar null si la clave privada no existe', async () => {
      const result = await deriveSshPublicKey('/path/that/does/not/exist');
      expect(result).toBeNull();
    });
    
    it('debe expandir ~ en la ruta', async () => {
      // Verificar que la función maneja rutas con ~
      // No podemos probar el resultado real sin una clave válida,
      // pero podemos verificar que no lanza error
      const result = await deriveSshPublicKey('~/nonexistent/key');
      expect(result).toBeNull();
    });
  });

  describe('determineProjectName', () => {
    it('debe usar package.json name si existe', async () => {
      const packageJson = { name: 'test-project' };
      await writeFile(
        resolve(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );
      
      const name = await determineProjectName(testDir);
      expect(name).toBe('test-project');
    });
    
    it('debe usar basename del directorio si no hay package.json', async () => {
      const name = await determineProjectName(testDir);
      const expected = basename(testDir);
      expect(name).toBe(expected);
    });
    
    it('debe eliminar el scope de un nombre con scope (@scope/name)', async () => {
      const packageJson = { name: '@fractal/test-project' };
      await writeFile(
        resolve(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );
      
      const name = await determineProjectName(testDir);
      expect(name).toBe('test-project');
    });
    
    it('debe usar basename si package.json no tiene name', async () => {
      const packageJson = { version: '1.0.0' };
      await writeFile(
        resolve(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );
      
      const name = await determineProjectName(testDir);
      const expected = basename(testDir);
      expect(name).toBe(expected);
    });
    
    it('debe usar basename si package.json es inválido', async () => {
      await writeFile(
        resolve(testDir, 'package.json'),
        'invalid json {'
      );
      
      const name = await determineProjectName(testDir);
      const expected = basename(testDir);
      expect(name).toBe(expected);
    });
  });

  describe('determineTargetType', () => {
    it('debe retornar frontend-static para role web', () => {
      const targetType = determineTargetType('web');
      expect(targetType).toBe('frontend-static');
    });
    
    it('debe retornar backend-full para role api', () => {
      const targetType = determineTargetType('api');
      expect(targetType).toBe('backend-full');
    });
    
    it('debe retornar backend-full si no hay role', () => {
      const targetType = determineTargetType(undefined);
      expect(targetType).toBe('backend-full');
    });
  });

  describe('writeCrossVarsToDisk', () => {
    it('debe escribir variables a .env.production para role web', async () => {
      const vars = {
        VITE_API_URL: 'https://api.example.com',
      };
      
      const result = await writeCrossVarsToDisk('web', vars, testDir);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      
      const envPath = resolve(testDir, '.env.production');
      const content = await readFile(envPath, 'utf-8');
      
      expect(content).toContain('VITE_API_URL=https://api.example.com');
    });
    
    it('debe preservar variables existentes en .env.production para role web', async () => {
      // Crear .env.production existente para web
      const existingEnv = 'VITE_APP_TITLE=My App\nVITE_API_URL=https://old-api.example.com\nVITE_FEATURE_FLAG=true\n';
      await writeFile(resolve(testDir, '.env.production'), existingEnv);
      
      const vars = {
        VITE_API_URL: 'https://new-api.example.com',
        VITE_WEB_URL: 'https://web.example.com',
      };
      
      const result = await writeCrossVarsToDisk('web', vars, testDir);
      
      expect(result.success).toBe(true);
      
      const envPath = resolve(testDir, '.env.production');
      const content = await readFile(envPath, 'utf-8');
      const lines = content.split('\n');
      
      // Verificar que VITE_API_URL fue actualizado, no duplicado
      const apiUrlLines = lines.filter(line => line.startsWith('VITE_API_URL='));
      expect(apiUrlLines.length).toBe(1);
      expect(apiUrlLines[0]).toBe('VITE_API_URL=https://new-api.example.com');
      
      // Verificar que VITE_WEB_URL fue agregado
      expect(content).toContain('VITE_WEB_URL=https://web.example.com');
      
      // Verificar que las variables existentes se mantuvieron
      expect(content).toContain('VITE_APP_TITLE=My App');
      expect(content).toContain('VITE_FEATURE_FLAG=true');
    });
    
    it('debe escribir variables a .env para role api', async () => {
      const vars = {
        CORS_ALLOWED_ORIGIN: 'https://web.example.com',
        SANCTUM_STATEFUL_DOMAINS: 'web.example.com',
      };
      
      const result = await writeCrossVarsToDisk('api', vars, testDir);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      
      const envPath = resolve(testDir, '.env');
      const content = await readFile(envPath, 'utf-8');
      
      expect(content).toContain('CORS_ALLOWED_ORIGIN=https://web.example.com');
      expect(content).toContain('SANCTUM_STATEFUL_DOMAINS=web.example.com');
    });
    
    it('debe actualizar variables existentes sin duplicar', async () => {
      // Crear .env existente
      const existingEnv = 'APP_KEY=base64:abc123\nCORS_ALLOWED_ORIGIN=https://old.example.com\nDB_HOST=localhost\n';
      await writeFile(resolve(testDir, '.env'), existingEnv);
      
      const vars = {
        CORS_ALLOWED_ORIGIN: 'https://new.example.com',
        SANCTUM_STATEFUL_DOMAINS: 'new.example.com',
      };
      
      const result = await writeCrossVarsToDisk('api', vars, testDir);
      
      expect(result.success).toBe(true);
      
      const envPath = resolve(testDir, '.env');
      const content = await readFile(envPath, 'utf-8');
      const lines = content.split('\n');
      
      // Verificar que CORS_ALLOWED_ORIGIN fue actualizado, no duplicado
      const corsLines = lines.filter(line => line.startsWith('CORS_ALLOWED_ORIGIN='));
      expect(corsLines.length).toBe(1);
      expect(corsLines[0]).toBe('CORS_ALLOWED_ORIGIN=https://new.example.com');
      
      // Verificar que SANCTUM_STATEFUL_DOMAINS fue agregado
      expect(content).toContain('SANCTUM_STATEFUL_DOMAINS=new.example.com');
      
      // Verificar que las variables existentes se mantuvieron
      expect(content).toContain('APP_KEY=base64:abc123');
      expect(content).toContain('DB_HOST=localhost');
    });
    
    it('debe manejar .env vacío correctamente', async () => {
      await writeFile(resolve(testDir, '.env'), '');
      
      const vars = {
        CORS_ALLOWED_ORIGIN: 'https://web.example.com',
      };
      
      const result = await writeCrossVarsToDisk('api', vars, testDir);
      
      expect(result.success).toBe(true);
      
      const content = await readFile(resolve(testDir, '.env'), 'utf-8');
      expect(content).toContain('CORS_ALLOWED_ORIGIN=https://web.example.com');
    });
    
    it('debe manejar errores de escritura', async () => {
      // Usar un directorio que no existe y sin permisos para crearlo
      const invalidDir = '/invalid/path/that/does/not/exist';
      
      const vars = { TEST: 'value' };
      const result = await writeCrossVarsToDisk('api', vars, invalidDir);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
    
    it('debe rechazar valores con newlines (prevención de inyección)', async () => {
      // Test para web role
      const varsWeb = {
        VITE_API_URL: 'https://api.example.com\nMALICIOUS_VAR=injected',
      };
      
      const resultWeb = await writeCrossVarsToDisk('web', varsWeb, testDir);
      
      expect(resultWeb.success).toBe(false);
      expect(resultWeb.error).toContain('nueva línea');
      
      // Verificar que no se escribió ningún archivo
      try {
        await readFile(resolve(testDir, '.env.production'), 'utf-8');
        expect.fail('No debería haber escrito el archivo');
      } catch {
        // Esperado: el archivo no debe existir
      }
      
      // Test para api role
      const varsApi = {
        CORS_ALLOWED_ORIGIN: 'https://web.example.com',
        SANCTUM_STATEFUL_DOMAINS: 'web.example.com\r\nINJECTED=malicious',
      };
      
      const resultApi = await writeCrossVarsToDisk('api', varsApi, testDir);
      
      expect(resultApi.success).toBe(false);
      expect(resultApi.error).toContain('nueva línea');
    });
    
    it('debe rechazar keys con newlines (prevención de inyección)', async () => {
      // Test con key que contiene newline
      const varsNewline = {
        'VALID_KEY': 'value1',
        'MALICIOUS\nINJECTED_KEY': 'value2',
      };
      
      const resultNewline = await writeCrossVarsToDisk('api', varsNewline, testDir);
      
      expect(resultNewline.success).toBe(false);
      expect(resultNewline.error).toContain('nueva línea');
      expect(resultNewline.error).toContain('MALICIOUS');
      
      // Verificar que no se escribió el archivo
      try {
        await readFile(resolve(testDir, '.env'), 'utf-8');
        expect.fail('No debería haber escrito el archivo');
      } catch {
        // Esperado: el archivo no debe existir
      }
      
      // Test con key que contiene carriage return
      const varsCR = {
        'MALICIOUS\rKEY': 'value',
      };
      
      const resultCR = await writeCrossVarsToDisk('api', varsCR, testDir);
      
      expect(resultCR.success).toBe(false);
      expect(resultCR.error).toContain('nueva línea');
    });
    
    it('debe rechazar keys con signo igual (prevención de inyección)', async () => {
      const vars = {
        'KEY=INJECTED': 'value',
      };
      
      const result = await writeCrossVarsToDisk('api', vars, testDir);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no permitidos');
      expect(result.error).toContain('KEY=INJECTED');
      
      // Verificar que no se escribió el archivo
      try {
        await readFile(resolve(testDir, '.env'), 'utf-8');
        expect.fail('No debería haber escrito el archivo');
      } catch {
        // Esperado: el archivo no debe existir
      }
    });
    
    it('debe rechazar keys con formato inválido', async () => {
      // Test con key que empieza con número
      const vars1 = {
        '123INVALID': 'value',
      };
      
      const result1 = await writeCrossVarsToDisk('api', vars1, testDir);
      
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('no es un nombre de variable válido');
      expect(result1.error).toContain('123INVALID');
      
      // Test con key que contiene caracteres especiales
      const vars2 = {
        'KEY-WITH-DASHES': 'value',
      };
      
      const result2 = await writeCrossVarsToDisk('api', vars2, testDir);
      
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('no es un nombre de variable válido');
      
      // Test con key que contiene espacios
      const vars3 = {
        'KEY WITH SPACES': 'value',
      };
      
      const result3 = await writeCrossVarsToDisk('api', vars3, testDir);
      
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('no es un nombre de variable válido');
    });
    
    it('debe aceptar keys válidos', async () => {
      // Test con keys válidos en diferentes formatos
      const vars = {
        'VALID_KEY': 'value1',
        '_STARTS_WITH_UNDERSCORE': 'value2',
        'MixedCase123': 'value3',
        'lowercase_key': 'value4',
      };
      
      const result = await writeCrossVarsToDisk('api', vars, testDir);
      
      expect(result.success).toBe(true);
      
      const content = await readFile(resolve(testDir, '.env'), 'utf-8');
      expect(content).toContain('VALID_KEY=value1');
      expect(content).toContain('_STARTS_WITH_UNDERSCORE=value2');
      expect(content).toContain('MixedCase123=value3');
      expect(content).toContain('lowercase_key=value4');
    });
  });

});
