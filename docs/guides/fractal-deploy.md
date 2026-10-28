# Guía de usuario: `fractal deploy`

`fractal deploy` toma un VPS recién creado y tu repositorio Git, y deja tu
aplicación online con HTTPS y deploy automático por merge, sin que escribas un
solo comando de servidor. Corrés el comando una vez dentro del proyecto
generado y el CLI se encarga de validar el servidor, endurecerlo, instalar el
runtime, configurar DNS y SSL, y generar el pipeline de CI/CD. Esta guía
describe el flujo real del comando, paso por paso.

> Fuente de verdad: el comando vive en `packages/core`
> (`src/commands/deploy.ts`) y orquesta los módulos de `@fractal/deploy`
> (validación, hardening, runtime, DNS, SSL, estado, manifiesto, cross-vars y
> CI/CD). El lenguaje y los criterios de aceptación están en
> `docs/specs/0003-deploy-inicial-vps.md`, y las decisiones técnicas en
> `docs/adr/0006-runtime-docker-compose.md`,
> `docs/adr/0007-cicd-github-actions.md`,
> `docs/adr/0011-deploy-multirepo.md`,
> `docs/adr/0012-deploy-multirepo-orquestacion-inicial.md`,
> `docs/adr/0013-runtime-frontend-multirepo.md` y
> `docs/adr/0014-stubs-laravel-versionados.md`. El runtime que se despliega lo
> declara el contrato del adapter (`packages/deploy/README.md`,
> `docs/specs/0006-contrato-adapter-v0.md`). Esta guía refleja el código en
> `master`; si algo diverge, el código manda.

---

## Sinopsis

```bash
fractal deploy [opciones]
```

Se ejecuta **dentro del directorio del proyecto generado** (el que creó
`fractal new`). No recibe argumentos posicionales: por defecto toda la
configuración se recolecta de forma interactiva, pero con `--non-interactive`
se lee de variables de entorno (ver [Modo no interactivo](#modo-no-interactivo-cicd)).

Si corriste el wizard de `fractal new` (FRA-77), los mismos valores ya están
mapeados a `FRACTAL_DEPLOY_*` — ver
[Mapping con fractal new](#mapping-con-fractal-new-fra-77). `fractal new --deploy`
encadena este comando sin volver a preguntar.

| Opción | Descripción |
|---|---|
| `--reconfigure` | Reconfigura las variables cruzadas en multirepo: fuerza volver a preguntar la URL y el dominio del repositorio hermano y reescribe las variables cruzadas, incluso si el manifiesto ya estaba `resolved`. Útil si cambiás de dominio después del primer deploy. |
| `--non-interactive` | Ejecuta el deploy **sin prompts**: lee todos los parámetros de variables de entorno `FRACTAL_DEPLOY_*` y da por confirmado el resumen. Pensado para CI/CD (es lo que usa el e2e real). Ver [Modo no interactivo](#modo-no-interactivo-cicd). |

En modo interactivo (el default) todo —IP, usuario SSH, método de autenticación,
dominio, proveedor DNS, repositorio Git y rama de producción— se pregunta en
prompts. `--non-interactive` es la alternativa no interactiva: esos mismos datos
se toman de variables de entorno en vez de preguntarse.

---

## Requisitos previos

Antes de correr `fractal deploy` necesitás:

- **Un proyecto generado con `fractal new`.** El comando se ejecuta dentro de
  ese directorio; de ahí deriva el nombre del proyecto (de `package.json` o del
  nombre del directorio) y, en multirepo, lee el manifiesto
  `fractal.project.yml`.
- **Un VPS accesible por SSH.** En el primer provisioning te conectás
  típicamente como `root` (usuario SSH por defecto del prompt). Puede ser por
  clave privada (recomendado) o por contraseña.
- **Un VPS que cumpla los requisitos mínimos:**

  | Requisito | Mínimo |
  |---|---|
  | Sistema operativo | Ubuntu 22.04 LTS o 24.04 LTS |
  | CPU | 1 vCPU |
  | RAM | 2 GB |
  | Disco disponible | 20 GB |
  | Puertos libres | 80 y 443 (sin servicios preexistentes) |

  El CLI detecta estos valores por SSH y aborta con un mensaje claro si algo no
  alcanza (ver [Errores típicos](#errores-típicos)). Con menos de 4 GB de RAM o
  menos de 40 GB de disco el deploy continúa, pero muestra una advertencia no
  bloqueante.

- **Un dominio** apuntable al VPS (lo configura el paso de DNS, automático con
  Cloudflare o manual).
- **La URL del repositorio Git** y la rama de producción (por defecto `main`).
- **Un par de claves SSH.** Con autenticación por clave, el CLI deriva la clave
  pública de tu clave privada con `ssh-keygen -y`. Con autenticación por
  contraseña, te pide pegar una clave pública y la ruta de su clave privada,
  porque el hardening deshabilita el login por contraseña y los pasos
  siguientes se reconectan como el usuario `deploy` usando esa clave.
- **Un API token de Cloudflare**, solo si elegís Cloudflare como proveedor DNS.

Para el CLI en sí, ver los requisitos de desarrollo del repositorio
(Node.js >= 20, pnpm) en el [README](../../README.md).

---

## Flujo del comando

Al correr `fractal deploy` dentro del proyecto, el comando ejecuta en orden:

1. **Detecta el manifiesto de multirepo.** Lee `fractal.project.yml` en el
   directorio actual. Si existe, toma el rol (`api` o `web`) y decide si tiene
   que preguntar por el repositorio hermano: lo hace si
   `orchestration_state` es `pending` (primer deploy) o si pasaste
   `--reconfigure`. En monolito y monorepo no hay manifiesto y este paso no
   pregunta nada. Ver [Multirepo](#multirepo-api-web).
2. **Recolecta los datos (AC-1).** Prompts interactivos: IP del VPS, usuario
   SSH (default `root`), método de autenticación (clave o contraseña), dominio,
   email para Let's Encrypt, proveedor DNS (default `manual`), token del
   proveedor si aplica, URL del repositorio Git y rama de producción (default
   `main`). En multirepo con coordinación pendiente, además pregunta la URL git
   y el dominio del hermano. Al final muestra un resumen y pide confirmación.
3. **Valida la conexión SSH (AC-2).** Verifica conectividad contra el VPS. La
   clave del host se verifica contra `known_hosts`: un host nuevo pide
   confirmación interactiva de la huella (TOFU); un cambio de clave aborta
   (protección MITM). Ver [host-key desconocido](#host-key-desconocido-tofu).
4. **Valida distribución y recursos (AC-2).** Detecta sistema operativo,
   CPUs, RAM y disco, y aborta si no cumple los mínimos.
5. **Valida los puertos (AC-14).** Comprueba que 80 y 443 estén libres. Si hay
   servicios preexistentes **no gestionados por Fractal**, aborta sin
   modificar nada. Si `/etc/fractal/state.json` ya existe (redeploy), 80/443
   ocupados por el propio nginx se aceptan y el comando sigue.
6. **Endurece el sistema (AC-3).** Obtiene la clave pública SSH (la deriva de la
   privada, o la pide si usás contraseña) y crea el usuario `deploy` no-root
   con sudo acotado (NOPASSWD solo para docker, certbot, systemctl, apt-get y
   la escritura de `/etc/fractal/state.json`; no `NOPASSWD:ALL`), deshabilita
   el login root y la autenticación por contraseña por SSH, y configura el
   firewall dejando abiertos solo los puertos 22, 80 y 443. Ver
   [modelo de confianza](#modelo-de-confianza).
7. **Se reconecta como `deploy`.** Cierra la conexión inicial (como `root`) y
   abre una nueva como el usuario `deploy` no-root con la clave privada
   correspondiente. Todos los pasos siguientes corren sin privilegios de root.
8. **Configura el runtime Docker (AC-4).** Resuelve el adapter instalado,
   le pide el contrato para el target (`get-contract`) y lee su `deployRuntime`
   —servicios, comandos de build/migración, puerto y healthcheck— en vez de
   hardcodearlos. Instala Docker CE y el plugin de Compose de forma idempotente,
   agrega al usuario `deploy` al grupo `docker` (para hablar con el socket
   sin sudo), escribe `docker-compose.yml` en `/home/deploy/` y, si el runtime
   declara servicio `db`, genera `DB_PASSWORD` en `/home/deploy/.env` la
   primera vez (el compose la interpola; no viaja por el repositorio). Sube el
   proyecto y levanta los contenedores con la secuencia _build → down →
   recreación del volumen `app_code` → up de `app` → up del resto_. El volumen
   `app_code` guarda el código de la app y Docker solo lo puebla al crearlo;
   recrearlo en cada (re)deploy fuerza a que se repueble desde la imagen recién
   construida, de modo que un cambio pusheado realmente llega a producción. El
   `up` de `app` primero serializa esa copia: si `app`, `worker` y `scheduler`
   se crean juntos sobre el volumen vacío, el daemon falla con `mkdir … file
   exists`. El volumen de la base de datos **no** se toca, así que los datos
   persisten entre deploys.
9. **Configura el DNS (AC-5 / AC-6).** Crea el registro A del dominio y espera
   la propagación. La variante `www` solo se pide si el dominio es raíz
   (`codigofractal.dev`); un subdominio (p.ej. el e2e) no crea ni espera
   `www.<subdominio>`. En manual te muestra exactamente esos registros. Ver
   [Proveedores de DNS](#proveedores-de-dns).
10. **Escribe las variables cruzadas al disco (multirepo).** Si recolectaste la
    info del hermano, persiste las variables cruzadas: `.env.production` si el
    rol es `web`, `.env` si es `api`.
11. **Configura SSL (AC-7).** Emite un certificado Let's Encrypt, configura la
    renovación automática y deja el tráfico HTTP redirigido a HTTPS. Ver
    [SSL](#ssl).
12. **Genera el workflow de CI/CD (AC-8).** Infiere el proveedor desde la URL
    del repositorio (o te lo pregunta), genera el pipeline y lista los secrets
    que tenés que cargar. Ver [CI/CD y deploy por merge](#cicd-y-deploy-por-merge).
13. **Muestra el resumen final** con la URL `https://<dominio>` donde quedó tu
    aplicación.

Cada paso que describe el servidor (hardening, runtime, DNS, SSL) se envuelve
con control de estado: el progreso del provisioning se guarda en un archivo en
el propio VPS (`/etc/fractal/state.json`), no en el repositorio. Por eso el
comando es **idempotente** (AC-11): si lo volvés a correr con los mismos
parámetros, los pasos ya aplicados no se repiten.

---

## Modo no interactivo (CI/CD)

Con `fractal deploy --non-interactive` el comando no abre ningún prompt: toma
todos los parámetros de variables de entorno `FRACTAL_DEPLOY_*` y da por
confirmado el resumen. La host key **no** se acepta a ciegas si hay un pin
(`FRACTAL_DEPLOY_SSH_KNOWN_HOSTS` o `--ssh-known-hosts`); sin pin, autenticación
por clave hace TOFU explícito y autenticación por contraseña contra un host
desconocido **falla** (la contraseña no se envía). Es el modo que usa el
**e2e real** del repositorio (`.github/workflows/deploy-e2e.yml`), que
provisiona un VPS efímero, pinea la host key con `ssh-keyscan` y corre
`fractal new` + `fractal deploy --non-interactive` de punta a punta.

Si falta una variable requerida o alguna tiene formato inválido, el comando
aborta con un error que lista exactamente qué variable arreglar (se aplican las
mismas validaciones de IP, dominio y email que en los prompts).

| Variable | Requerida | Default | Notas |
|---|---|---|---|
| `FRACTAL_DEPLOY_SERVER_IP` | sí | — | IPv4 del VPS |
| `FRACTAL_DEPLOY_SSH_USER` | no | `root` | usuario SSH del primer provisioning. En un redeploy, después del hardening, tiene que ser `deploy` (`PermitRootLogin no`) |
| `FRACTAL_DEPLOY_AUTH_METHOD` | no | `key` | `key` o `password` |
| `FRACTAL_DEPLOY_SSH_KEY_PATH` | si `AUTH_METHOD=key` | — | ruta a la clave privada |
| `FRACTAL_DEPLOY_SSH_PASSWORD` | si `AUTH_METHOD=password` | — | contraseña SSH |
| `FRACTAL_DEPLOY_SSH_KNOWN_HOSTS` | no | — | pin de host key: ruta a un `known_hosts` **o** el contenido (líneas `ssh-keyscan`). Equivale a `--ssh-known-hosts <path>`. Si está seteado, un host desconocido se rechaza (no se acepta a ciegas). Aplica al SSH inicial y a la reconexión como `deploy` |
| `FRACTAL_DEPLOY_DOMAIN` | sí | — | dominio de la app (se normaliza a minúsculas) |
| `FRACTAL_DEPLOY_EMAIL` | sí | — | email para Let's Encrypt |
| `FRACTAL_DEPLOY_DNS_PROVIDER` | no | `manual` | `cloudflare`, `route53` o `manual` |
| `FRACTAL_DEPLOY_DNS_API_TOKEN` | si el proveedor es `cloudflare`/`route53` | — | token/credenciales del proveedor DNS |
| `FRACTAL_DEPLOY_GIT_REPOSITORY` | sí | — | URL del repositorio Git (infiere el proveedor de CI/CD) |
| `FRACTAL_DEPLOY_PRODUCTION_BRANCH` | no | `main` | rama de producción |
| `FRACTAL_DEPLOY_SSL_ENV` | no | `production` | `production` o `staging` (staging evita los rate limits de Let's Encrypt; útil en CI) |
| `FRACTAL_DEPLOY_UPLOAD_TIMEOUT` | no | `600` | timeout **en segundos** para la subida del proyecto al servidor (pack + transfer + extract). Independiente del timeout de conexión SSH (120s); subílo para proyectos grandes o enlaces lentos |
| `FRACTAL_DEPLOY_DB_PASSWORD` | no | se genera en el VPS | si el wizard de `fractal new` la recolectó, se escribe en `/home/deploy/.env`. No viaja en un `.env` local (FRA-76) |

### Mapping con fractal new (FRA-77)

`fractal new` reutiliza estas mismas variables para el subset compartido
(IP, SSH, dominio, email, DNS, rama, DB password). Los valores **solo de
`new`** (nombre, topología, token de GitHub para crear el repo) viven en
`FRACTAL_NEW_*` y no tienen equivalente `FRACTAL_DEPLOY_*`. Precedencia en
`new`: flag > `FRACTAL_NEW_*` > `FRACTAL_DEPLOY_*`. Tabla completa en
[`fractal-new.md`](./fractal-new.md#modo-no-interactivo).

El token `FRACTAL_NEW_GITHUB_TOKEN` crea el remoto y setea secrets
(`SSH_KNOWN_HOSTS` entre ellos). `fractal deploy` sigue generando el
workflow; no vuelve a crear el repo.

En **multirepo** con coordinación pendiente (o con `--reconfigure`) se requieren
además `FRACTAL_DEPLOY_SIBLING_GIT_URL` y `FRACTAL_DEPLOY_SIBLING_DOMAIN` (URL y
dominio del repositorio hermano).

Con **autenticación por contraseña** (`FRACTAL_DEPLOY_AUTH_METHOD=password`), como
no se pueden pedir las claves del usuario `deploy` por prompt, hay que proveerlas
por entorno: `FRACTAL_DEPLOY_DEPLOY_PUBLIC_KEY` (la clave pública que se instala
para el usuario `deploy`) y `FRACTAL_DEPLOY_DEPLOY_KEY_PATH` (ruta a la clave
privada correspondiente para reconectarse como `deploy`). Además, si el host no
está en `known_hosts` y no hay pin, el comando aborta: nunca manda la
contraseña a un host sin verificar.

---

## Modelo de confianza

### Host key SSH

| Modo | Host desconocido | Host con clave distinta |
|---|---|---|
| Interactivo | pide confirmación (TOFU; default **no**) | aborta (MITM) |
| `--non-interactive` **con** pin (`FRACTAL_DEPLOY_SSH_KNOWN_HOSTS` / `--ssh-known-hosts`) | rechaza; no acepta a ciegas | aborta (MITM) |
| `--non-interactive` **sin** pin, `AUTH_METHOD=key` | TOFU explícito: acepta y persiste. Documentado; preferí pinear | aborta (MITM) |
| `--non-interactive` **sin** pin, `AUTH_METHOD=password` | **falla** con error claro; la contraseña no se envía | aborta (MITM) |

El pin se aplica a **las dos** conexiones SSH del comando: la inicial (como
`root` o el usuario que indiques) y la reconexión como `deploy`.

El e2e de CI pinea la host key del VPS efímero con `ssh-keyscan` después de que
SSH responde. Vultr no expone la host key por API; no hay TOFU ciego en ese job.

### Riesgo de la clave `deploy`

Después del hardening, el login root y la autenticación por contraseña quedan
deshabilitados. Quien tenga la clave privada de `deploy` (en tu laptop o en el
secret `SSH_PRIVATE_KEY` de CI) puede entrar al VPS y correr, sin contraseña,
los comandos de la allowlist: Docker, certbot, systemctl (docker / certbot.timer),
apt-get, snap, y leer/escribir `/etc/fractal/state.json`.

Eso **no** es `sudo -i` ni un shell root: el drop-in
`/etc/sudoers.d/90-fractal-deploy` lista binarios y rutas, no `NOPASSWD:ALL`.
Igual, `sudo docker` equivale a root de facto (podés montar el disco). Tratala
como secreto: no la commitees, rotá si se filtra, y restringí quién lee
`SSH_PRIVATE_KEY` en el proveedor de CI.

---

## Multirepo (api / web)

En las topologías monolito y monorepo, un solo `fractal deploy` cubre todo el
proyecto. En **multirepo** (ADR-0010) hay dos repositorios independientes, y
`fractal deploy` se ejecuta **una vez dentro de cada uno** (`mi-app-api/` y
`mi-app-web/`). Cada ejecución es independiente: su propio VPS, dominio y
pipeline; ningún pipeline dispara ni coordina al otro (ADR-0012).

La única coordinación ocurre en el **primer deploy de cada lado**, a través del
manifiesto local `fractal.project.yml` (que `fractal new` genera y deja
excluido de git). Cuando `orchestration_state` es `pending`, el CLI pregunta:

- la **URL git** del repositorio hermano, y
- el **dominio** donde vivirá el hermano.

Con esa respuesta hornea la **variable cruzada** correspondiente y marca el
manifiesto como `resolved`, para que deploys posteriores —incluidos los
disparados por merge— no vuelvan a preguntar:

| Rol del repo | Variable que se escribe | Archivo |
|---|---|---|
| `web` | `VITE_API_URL` (apunta al dominio del `api`; Vite la lee en build time) | `.env.production` |
| `api` | `CORS_ALLOWED_ORIGIN` / dominio de Sanctum (apunta al dominio del `web`) | `.env` (se lee en runtime) |

El CLI **no se conecta** al repo hermano: solo usa datos que vos ya tenés, y
además imprime qué secret cargar a mano en el pipeline del hermano (ver
[CI/CD](#cicd-y-deploy-por-merge)).

Si el manifiesto se pierde (por ejemplo, un VPS reconstruido), el comando
simplemente vuelve a preguntar el dato del hermano: es una degradación
aceptable, no un bloqueo. Y si cambiás de dominio después del primer deploy,
corré `fractal deploy --reconfigure` para volver a preguntar y reescribir la
variable cruzada.

---

## Proveedores de DNS

En el prompt de proveedor DNS hay tres opciones; la opción por defecto es
**manual**:

- **Cloudflare** — automatizado. Te pide un API token y crea el registro A
  del dominio apuntando a la IP del VPS (y `www` solo si el dominio es raíz),
  y espera a que la propagación se confirme.
- **Manual** — el CLI te muestra los registros exactos a crear en tu proveedor
  (los mismos: `@`, más `www` solo en dominio raíz) y hace polling hasta
  detectar la propagación. Ejemplo para un dominio raíz:

  ```
  → Configuración DNS manual requerida

  Crea los siguientes registros DNS en tu proveedor:

     Tipo: A
     Nombre: @
     Valor: 203.0.113.10
     TTL: 300

     Tipo: A
     Nombre: www
     Valor: 203.0.113.10
     TTL: 300
  ```

- **AWS Route53** — aparece en el prompt pero **no está soportado** en esta
  versión: si lo elegís, el comando aborta antes de hacer cualquier trabajo (ver
  [Errores típicos](#route53-no-soportado)). Los proveedores DNS soportados son
  Cloudflare (automatizado) y manual.

---

## SSL

El paso de SSL (AC-7) emite un certificado **Let's Encrypt** para tu dominio,
usando el email que diste para las notificaciones. Si el paso de DNS creó un
registro `www`, el certificado se emite también para el subdominio `www`.

La renovación automática queda configurada, con un hook post-renovación que
recarga nginx dentro de Docker:

```
docker exec <nombre-del-proyecto>_nginx nginx -s reload
```

El paso es idempotente: si ya hay un certificado válido con más de 30 días de
vigencia, no se vuelve a emitir; si está por expirar o no existe, se re-emite.
El chequeo lee `/etc/letsencrypt/live` con `sudo openssl` (ese directorio es
700 root; un `test -f` sin privilegios da un falso negativo). Todo el tráfico
HTTP queda redirigido a HTTPS.

---

## CI/CD y deploy por merge

El último paso genera el pipeline de deploy por merge (AC-8). El proveedor se
**infiere desde la URL del repositorio**: `github.com` → GitHub Actions,
`gitlab.com` → GitLab CI. Si no se puede inferir, el CLI te lo pregunta. Según
el proveedor, el archivo generado es:

- GitHub Actions: `.github/workflows/deploy.yml`
- GitLab CI: `.gitlab-ci.yml`

El workflow se dispara con un push a la rama de producción y, en GitHub
Actions, ejecuta:

1. **Build y push** de la imagen Docker a GitHub Container Registry
   (`ghcr.io`), etiquetada con el SHA corto del commit y `latest`.
2. **Deploy al servidor** por SSH (con `StrictHostKeyChecking=yes`): `docker
   compose pull`, recreación del volumen `app_code` (el `down` + `docker volume
   rm` del volumen de código) y `docker compose up -d app` seguido de
   `docker compose up -d`. Recrear el volumen en cada redeploy hace que la
   imagen recién publicada repueble el código, de modo que el merge realmente
   llega a producción; el `up` de `app` primero evita que worker y scheduler
   copien en paralelo sobre el volumen vacío. El volumen de la base de datos no
   se toca. El rollback aplica el mismo refresco antes de volver a levantar la
   imagen anterior.
3. **Migraciones** y **comandos post-deploy** (los declara el contrato del
   adapter; para el backend de referencia son `migrate` y limpieza de caches).
4. **Healthcheck** contra `https://<dominio><ruta-de-healthcheck>`, reintentando
   hasta 30 veces cada 2 segundos.
5. **Rollback automático (AC-10)** si el healthcheck falla: vuelve al **tag de
   imagen versionado anterior** (leído del estado del servidor en
   `/etc/fractal/state.json`), no al contenedor previo, y vuelve a verificar con
   un healthcheck. El estado del deploy (exitoso o fallido) queda registrado en
   ese archivo.

Al terminar, el CLI imprime los **secrets que tenés que cargar** en el proveedor
de CI/CD. Para todos los targets:

| Secret | Para qué |
|---|---|
| `SSH_HOST` | IP del VPS |
| `SSH_USER` | usuario SSH (generalmente `deploy`) |
| `SSH_PRIVATE_KEY` | clave privada para autenticarse en el servidor |
| `SSH_KNOWN_HOSTS` | host key del servidor, en formato known_hosts (ver abajo) |
| `DOCKER_REGISTRY_USER` | usuario del registry de Docker |
| `DOCKER_REGISTRY_TOKEN` | token del registry de Docker |

Para un backend completo se agregan además `DB_PASSWORD` y `APP_KEY`.

### Cómo obtener `SSH_KNOWN_HOSTS`

El secret `SSH_KNOWN_HOSTS` es la **línea known_hosts** del servidor (el mismo
formato que produce `ssh-keyscan`): el pipeline la escribe en
`~/.ssh/known_hosts` del runner para verificar la identidad del VPS con
`StrictHostKeyChecking=yes` antes de conectarse. Su valor se ve así:

```
203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

Hay dos formas de obtenerlo:

- **El CLI lo imprime por vos.** Durante el deploy, `fractal deploy` ya se
  conecta al servidor y verifica su host key (TOFU). Al listar los secrets
  requeridos al final, imprime el **valor real** de `SSH_KNOWN_HOSTS` listo para
  copiar tal cual al secret. Si por algún motivo no pudo capturarlo, imprime en
  su lugar el comando exacto a correr (el del punto siguiente).
- **A mano con `ssh-keyscan`.** Ejecutá, reemplazando `<IP_DEL_SERVIDOR>` por la
  IP de tu VPS:

  ```bash
  ssh-keyscan -t ed25519,rsa,ecdsa <IP_DEL_SERVIDOR>
  ```

  Cargá la **salida completa** (todas las líneas que imprima) como valor del
  secret, no solo una.

En **multirepo**, la lista incluye también el secret cruzado que tenés que
cargar en el pipeline del repositorio **hermano** (ADR-0012): por ejemplo, al
desplegar `api/`, el CLI imprime que en `web/` hay que cargar `API_URL` con la
URL de la API; al desplegar `web/`, imprime `CORS_ALLOWED_ORIGIN` y
`SANCTUM_STATEFUL_DOMAINS` para el lado `api/`. El CLI no los carga por vos: los
cargás a mano, igual que los secrets propios de cada repo.

---

## Ejemplos

```bash
# Deploy de un proyecto monolito o monorepo (una sola ejecución)
cd mi-app
fractal deploy

# Multirepo: una ejecución por repositorio, cada una independiente
cd mi-app-api
fractal deploy          # primer deploy: pregunta la URL y el dominio del web

cd ../mi-app-web
fractal deploy          # primer deploy: pregunta la URL y el dominio del api

# Reconfigurar las variables cruzadas tras cambiar de dominio en multirepo
cd mi-app-api
fractal deploy --reconfigure
```

Durante la ejecución verás una salida parecida a esta:

```
🚀 Fractal Deploy — Provisioning de VPS production-ready

Configuración del servidor VPS

✔ Dirección IP del VPS: 203.0.113.10
✔ Usuario SSH: root
✔ Método de autenticación SSH: Clave SSH (recomendado)
...

🔍 Validando servidor...

→ Probando conectividad SSH...
✓ Conectividad SSH verificada
→ Detectando información del servidor...
✓ Distribución compatible
✓ Recursos suficientes
✓ Puertos 80 y 443 disponibles

🔐 Endureciendo el sistema...
✓ Hardening completado

🔄 Reconectando como usuario deploy...
✓ Conectado como usuario deploy

🐳 Configurando runtime de Docker...
✓ Runtime configurado
✓ Contenedores iniciados

🌐 Configurando DNS...
✓ DNS configurado

🔒 Configurando SSL...
✓ SSL configurado exitosamente

🔄 Generando workflow de CI/CD...
✓ Workflow generado: .github/workflows/deploy.yml

✅ Deploy completado exitosamente

   Tu aplicación está disponible en: https://example.com
```

---

## Errores típicos

### Route53 no soportado

```
❌ Error: Route53 no está soportado en esta versión

Proveedores DNS soportados:
  • Cloudflare (automatizado)
  • Manual (configuración manual)

Por favor, ejecuta nuevamente el comando y selecciona un proveedor soportado.
```

Elegiste AWS Route53 en el prompt de proveedor DNS. En esta versión solo están
soportados Cloudflare (automatizado) y manual. Volvé a correr el comando y
elegí uno de esos dos.

### Host-key desconocido (TOFU)

```
La autenticidad del host '203.0.113.10' no pudo establecerse.
Huella ssh-ed25519: SHA256:abc123...
Verificá esta huella con la consola del proveedor del VPS antes de continuar.

? ¿Confiar en este host y guardar la clave en known_hosts? (y/N)
```

El VPS no está en tu `known_hosts`. Como en OpenSSH, el default es **no**: tenés
que aceptar explícitamente. Antes de confiar, verificá la huella con la consola
del proveedor del VPS. Si en cambio la clave del host **cambió** respecto de la
que ya tenías guardada, la conexión aborta sin preguntar (protección contra
ataques MITM).

En `--non-interactive` no hay prompt. Pineá la host key con
`FRACTAL_DEPLOY_SSH_KNOWN_HOSTS` o `--ssh-known-hosts` (el e2e lo hace con
`ssh-keyscan`). Sin pin, una autenticación por contraseña contra un host
desconocido falla y **no** manda la contraseña; con clave, el TOFU queda
explícito y documentado. Ver [modelo de confianza](#modelo-de-confianza).

### Puertos 80 / 443 ocupados

```
❌ Error: El servidor tiene servicios preexistentes en puertos requeridos:

   • Puerto 80 (proceso: apache2) ocupado

El servidor debe tener los puertos 80 y 443 disponibles.
Fractal requiere control completo del servidor para provisioning seguro.

Si deseas usar este VPS, detén los servicios que ocupan estos puertos.
```

Hay un servicio no gestionado por Fractal escuchando en 80 o 443 (AC-14). El
comando aborta **sin modificar nada**: sobrescribir un servidor de producción en
uso es demasiado riesgoso, y no hay flag de override en esta versión. Detené el
servicio que ocupa esos puertos y volvé a correr. Si el ocupante es el runtime
que Fractal levantó en un deploy anterior (`/etc/fractal/state.json` presente),
no es este error: el comando continúa y refresca el volumen `app_code`.

### Recursos insuficientes o distribución no soportada

```
❌ El servidor no cumple con los requisitos mínimos:

   • CPUs insuficientes: detectadas 1, mínimo requerido 1
   • RAM insuficiente: detectados 1.0 GB, mínimo requerido 2 GB
   • Distribución no soportada: Debian 12. Distribuciones soportadas: Ubuntu 22.04, Ubuntu 24.04

📊 Información detectada del servidor:
   Sistema: Debian 12
   CPUs: 1
   RAM: 1.0 GB
   Disco disponible: 15.0 GB / 20.0 GB

Requisitos mínimos (SPEC-0003):
  • Ubuntu 22.04 LTS o 24.04 LTS
  • 1 vCPU
  • 2 GB RAM
  • 20 GB disco disponible
```

El VPS no llega a los mínimos: Ubuntu 22.04 o 24.04 LTS, 1 vCPU, 2 GB de RAM y
20 GB de disco disponible. Usá un VPS que los cumpla. El chequeo ocurre antes de
tocar nada en el servidor.

### No se pudo conectar por SSH

```
❌ Error de conectividad SSH:
   <detalle del error>

Verifica que:
  • La dirección IP sea correcta
  • El servidor esté encendido y accesible
  • Las credenciales SSH sean válidas
  • El firewall permita conexiones SSH (puerto 22)
  • La clave del host coincida con known_hosts (o sea un VPS nuevo)
```

El CLI no pudo establecer la conexión SSH inicial. Revisá la IP, que el servidor
esté encendido, que las credenciales sean válidas y que el puerto 22 esté
accesible.

---

## Referencias

- [`docs/specs/0003-deploy-inicial-vps.md`](../specs/0003-deploy-inicial-vps.md) — especificación de `fractal deploy`
- [`docs/specs/0006-contrato-adapter-v0.md`](../specs/0006-contrato-adapter-v0.md) — contrato del adapter (de donde sale el `deployRuntime`)
- [`docs/adr/0006-runtime-docker-compose.md`](../adr/0006-runtime-docker-compose.md) — Docker Compose como runtime de producción
- [`docs/adr/0007-cicd-github-actions.md`](../adr/0007-cicd-github-actions.md) — CI/CD para deploy por merge
- [`docs/adr/0011-deploy-multirepo.md`](../adr/0011-deploy-multirepo.md) — deploy multirepo
- [`docs/adr/0012-deploy-multirepo-orquestacion-inicial.md`](../adr/0012-deploy-multirepo-orquestacion-inicial.md) — coordinación en el primer deploy y manifiesto
- [`docs/adr/0013-runtime-frontend-multirepo.md`](../adr/0013-runtime-frontend-multirepo.md) — runtime nginx-only para `web/` en multirepo
- [`docs/adr/0014-stubs-laravel-versionados.md`](../adr/0014-stubs-laravel-versionados.md) — stubs versionados del adapter
- [`packages/deploy/README.md`](../../packages/deploy/README.md) — módulos de provisioning y CI/CD
- [`docs/guides/fractal-new.md`](./fractal-new.md) — generación del proyecto base (paso previo a `fractal deploy`)
