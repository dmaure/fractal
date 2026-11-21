# Distribución del CLI (FRA-123)

Decisión de Diego (21/11): el código **no se publica** en npm. Se instala desde
el repo privado `dmaure/fractal`; solo quien tenga acceso al repo puede instalar.

## Mecanismo

Tarball `fractal-cli-X.Y.Z.tgz` adjunto a un **GitHub Release** del repo.
`scripts/pack-release.js` (tras `pnpm build`) arma un paquete `@fractal/cli` que
lleva los paquetes compilados en `vendor/` (dependencias `file:`) y las
dependencias de terceros declaradas normalmente; `npm install -g` lo instala sin
checkout, sin pnpm y sin compilar.

Por qué no `npm install -g github:dmaure/fractal`: el repo es un monorepo pnpm con
dependencias `workspace:*`, que npm no entiende, y compilar en el cliente exige
pnpm. Por qué `vendor/` y no `bundleDependencies`: con bundle, npm corre los
install scripts de todo el árbol y el build nativo opcional de `cpu-features`
(dep de `ssh2`) rompe la instalación.

## Publicar una versión (manual, lo hace Diego)

```bash
pnpm version:set 0.1.0            # misma versión en todos los paquetes
git commit -am "Release 0.1.0" && git tag v0.1.0 && git push --follow-tags
pnpm pack:release                 # genera release/fractal-cli-0.1.0.tgz
gh release create v0.1.0 release/fractal-cli-0.1.0.tgz --title v0.1.0 --notes "..."
```

## Instalar y actualizar

```bash
# instalar (requiere `gh auth login`, o GH_TOKEN con acceso al repo)
d=$(mktemp -d) && gh release download -R dmaure/fractal -p 'fractal-cli-*.tgz' -D "$d" && npm install -g "$d"/fractal-cli-*.tgz

fractal self-update   # reinstala el último release; sin releases, clona master, compila y empaqueta
```

`self-update` no toca un `fractal` que corre desde un checkout (indica
`git pull && pnpm install && pnpm build`). Si falta acceso al repo, imprime cómo
configurar SSH o token.

## Pasar a npm más adelante

El tarball ya es un paquete npm normal (`@fractal/cli`, bin `fractal`). Para
publicar (público o registry privado): `npm publish release/fractal-cli-X.Y.Z.tgz`
(requiere crear la org/scope `@fractal` o renombrar el paquete en
`buildCliManifest`), y en `self-update` cambiar `latestRelease`/`download` por
`npm install -g @fractal/cli@latest`. La instalación pasa a ser
`npm install -g @fractal/cli`. Nada más cambia: versionado y empaquetado ya son los mismos.
