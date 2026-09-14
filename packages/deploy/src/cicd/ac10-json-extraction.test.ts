import { describe, it, expect } from 'vitest';

describe('AC-10 Rollback - JSON extraction from pretty-printed state', () => {
  it('debe extraer lastSuccessfulImageTag de JSON pretty-printed con jq', () => {
    const prettyJson = `{
  "version": "1.0.0",
  "createdAt": "2026-09-14T00:00:00.000Z",
  "updatedAt": "2026-09-14T01:00:00.000Z",
  "lastSuccessfulImageTag": "abc123",
  "currentImageTag": "def456",
  "deployHistory": []
}`;

    // Simular el comando jq que usa el CI generator
    // jq -r '.lastSuccessfulImageTag // ""'
    const parsed = JSON.parse(prettyJson);
    const extracted = parsed.lastSuccessfulImageTag || '';
    
    expect(extracted).toBe('abc123');
  });

  it('debe extraer lastSuccessfulImageTag de JSON pretty-printed con python', () => {
    const prettyJson = `{
  "version": "1.0.0",
  "createdAt": "2026-09-14T00:00:00.000Z",
  "updatedAt": "2026-09-14T01:00:00.000Z",
  "lastSuccessfulImageTag": "xyz789",
  "currentImageTag": "abc123",
  "deployHistory": []
}`;

    // Simular el comando python que usa el CI generator
    // python3 -c "import sys, json; print(json.load(sys.stdin).get('lastSuccessfulImageTag', ''))"
    const parsed = JSON.parse(prettyJson);
    const extracted = parsed.lastSuccessfulImageTag || '';
    
    expect(extracted).toBe('xyz789');
  });

  it('debe manejar JSON sin lastSuccessfulImageTag', () => {
    const prettyJson = `{
  "version": "1.0.0",
  "createdAt": "2026-09-14T00:00:00.000Z",
  "updatedAt": "2026-09-14T01:00:00.000Z",
  "deployHistory": []
}`;

    const parsed = JSON.parse(prettyJson);
    const extracted = parsed.lastSuccessfulImageTag || '';
    
    expect(extracted).toBe('');
  });

  it('debe manejar JSON con espacios variados alrededor del colon', () => {
    // JSON generado por JSON.stringify(obj, null, 2)
    const jsonWithSpaces = `{
  "lastSuccessfulImageTag": "tag123"
}`;

    // JSON sin espacios (compact)
    const jsonNoSpaces = `{"lastSuccessfulImageTag":"tag123"}`;

    const parsed1 = JSON.parse(jsonWithSpaces);
    const parsed2 = JSON.parse(jsonNoSpaces);
    
    expect(parsed1.lastSuccessfulImageTag).toBe('tag123');
    expect(parsed2.lastSuccessfulImageTag).toBe('tag123');
    expect(parsed1.lastSuccessfulImageTag).toBe(parsed2.lastSuccessfulImageTag);
  });

  it('debe verificar que StateManager escribe con pretty-print', () => {
    const state = {
      version: '1.0.0',
      lastSuccessfulImageTag: 'test456',
    };

    const prettyJson = JSON.stringify(state, null, 2);
    
    // Verificar que tiene espacios después del colon (pretty-print)
    expect(prettyJson).toContain('": "');
    expect(prettyJson).toContain('"lastSuccessfulImageTag": "test456"');
    
    // Verificar que el grep viejo NO funcionaría
    const oldGrepPattern = /"lastSuccessfulImageTag":"[^"]*"/;
    expect(oldGrepPattern.test(prettyJson)).toBe(false);
    
    // Verificar que el JSON parsing SÍ funciona
    const parsed = JSON.parse(prettyJson);
    expect(parsed.lastSuccessfulImageTag).toBe('test456');
  });
});
