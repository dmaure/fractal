/**
 * Generador de package.json para proyectos Laravel.
 */

export function generatePackageJson(
  name: string,
  topology: 'monolith' | 'monorepo-web' | 'multirepo-web'
): string {
  const packageName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  const baseConfig = {
    name: packageName,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {},
    dependencies: {},
    devDependencies: {},
  };

  if (topology === 'monolith') {
    baseConfig.scripts = {
      dev: 'vite',
      build: 'vite build',
    };
    baseConfig.devDependencies = {
      '@vitejs/plugin-react': '^4.0.0',
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      'typescript': '^5.0.0',
      'vite': '^5.0.0',
    };
  } else {
    baseConfig.scripts = {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    };
    baseConfig.dependencies = {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
    };
    baseConfig.devDependencies = {
      '@vitejs/plugin-react': '^4.0.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      'typescript': '^5.0.0',
      'vite': '^5.0.0',
    };
  }

  return JSON.stringify(baseConfig, null, 2);
}
