/**
 * Generador de la vista raíz (resources/views/app.blade.php) del monolito.
 *
 * Shell del SPA React. El landing estático vive dentro de `#root` y siempre se
 * renderiza (así `/` responde 200 con `php artisan serve` sin `npm run build`).
 * Si existen los assets compilados (`public/build/assets/app.js`, los genera el
 * Dockerfile en producción) se cargan y React reemplaza el landing por la SPA,
 * que consume `/api/health`.
 */
export function generateAppBladeView(): string {
  return `<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name', 'Fractal') }}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0f172a;
            color: #e2e8f0;
        }
        .card { text-align: center; padding: 3rem 2rem; max-width: 34rem; }
        .badge {
            display: inline-block;
            margin-bottom: 1.5rem;
            padding: 0.35rem 0.9rem;
            border-radius: 9999px;
            background: #1e293b;
            color: #38bdf8;
            font-size: 0.8rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        h1 { font-size: 2rem; margin-bottom: 0.75rem; }
        p { color: #94a3b8; line-height: 1.7; }
        code { background: #1e293b; color: #38bdf8; padding: 0.15rem 0.4rem; border-radius: 0.3rem; }
    </style>
    @if (file_exists(public_path('build/assets/app.css')))
    <link rel="stylesheet" href="/build/assets/app.css?v={{ filemtime(public_path('build/assets/app.css')) }}">
    @endif
</head>
<body>
    <div id="root">
    <div class="card">
        <span class="badge">Fractal</span>
        <h1>{{ config('app.name') }} está corriendo 🎉</h1>
        <p>
            Tu aplicación Laravel se generó y está lista para desarrollar.<br>
            La API de salud responde en <code>/api/health</code>.
        </p>
    </div>
    </div>
    @if (file_exists(public_path('build/assets/app.js')))
    <script type="module" src="/build/assets/app.js?v={{ filemtime(public_path('build/assets/app.js')) }}"></script>
    @endif
</body>
</html>
`;
}
