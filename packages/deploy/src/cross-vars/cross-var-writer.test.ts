import { describe, it, expect } from 'vitest';
import { CrossVarWriter } from './cross-var-writer.js';

describe('CrossVarWriter', () => {
  describe('write - role: web', () => {
    it('escribe VITE_API_URL con el dominio del hermano api', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'web',
        currentDomain: 'web.example.com',
        siblingDomain: 'api.example.com',
      });
      
      expect(result.success).toBe(true);
      expect(result.writtenVars).toEqual({
        VITE_API_URL: 'https://api.example.com',
      });
    });
    
    it('genera instrucciones para el repo hermano (api)', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'web',
        currentDomain: 'web.example.com',
        siblingDomain: 'api.example.com',
      });
      
      expect(result.siblingInstructions).toBeDefined();
      expect(result.siblingInstructions?.siblingRole).toBe('api');
      expect(result.siblingInstructions?.varsToSet).toEqual({
        CORS_ALLOWED_ORIGIN: 'https://web.example.com',
        SANCTUM_STATEFUL_DOMAINS: 'web.example.com',
      });
    });
    
    it('formatea mensaje de instrucciones para el hermano', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'web',
        currentDomain: 'web.example.com',
        siblingDomain: 'api.example.com',
      });
      
      const message = result.siblingInstructions?.message || '';
      expect(message).toContain('repositorio hermano (api)');
      expect(message).toContain('CORS_ALLOWED_ORIGIN=');
      expect(message).toContain('SANCTUM_STATEFUL_DOMAINS=');
    });
  });
  
  describe('write - role: api', () => {
    it('escribe CORS_ALLOWED_ORIGIN y SANCTUM_STATEFUL_DOMAINS', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'api',
        currentDomain: 'api.example.com',
        siblingDomain: 'web.example.com',
      });
      
      expect(result.success).toBe(true);
      expect(result.writtenVars).toEqual({
        CORS_ALLOWED_ORIGIN: 'https://web.example.com',
        SANCTUM_STATEFUL_DOMAINS: 'web.example.com',
      });
    });
    
    it('genera instrucciones para el repo hermano (web)', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'api',
        currentDomain: 'api.example.com',
        siblingDomain: 'web.example.com',
      });
      
      expect(result.siblingInstructions).toBeDefined();
      expect(result.siblingInstructions?.siblingRole).toBe('web');
      expect(result.siblingInstructions?.varsToSet).toEqual({
        VITE_API_URL: 'https://api.example.com',
      });
    });
    
    it('formatea mensaje de instrucciones para el hermano', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'api',
        currentDomain: 'api.example.com',
        siblingDomain: 'web.example.com',
      });
      
      const message = result.siblingInstructions?.message || '';
      expect(message).toContain('repositorio hermano (web)');
      expect(message).toContain('VITE_API_URL=');
    });
  });
  
  describe('URLs con HTTPS', () => {
    it('siempre usa HTTPS para URLs de producción', () => {
      const writer = new CrossVarWriter();
      
      const webResult = writer.write({
        role: 'web',
        currentDomain: 'web.example.com',
        siblingDomain: 'api.example.com',
      });
      
      expect(webResult.writtenVars?.VITE_API_URL).toBe('https://api.example.com');
      
      const apiResult = writer.write({
        role: 'api',
        currentDomain: 'api.example.com',
        siblingDomain: 'web.example.com',
      });
      
      expect(apiResult.writtenVars?.CORS_ALLOWED_ORIGIN).toBe('https://web.example.com');
    });
  });
  
  describe('Sanctum stateful domains', () => {
    it('usa el dominio sin protocolo para SANCTUM_STATEFUL_DOMAINS', () => {
      const writer = new CrossVarWriter();
      
      const result = writer.write({
        role: 'api',
        currentDomain: 'api.example.com',
        siblingDomain: 'app.example.com',
      });
      
      expect(result.writtenVars?.SANCTUM_STATEFUL_DOMAINS).toBe('app.example.com');
    });
  });
});
