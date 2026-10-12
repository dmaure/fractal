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
`fractal new`). No recibe argumentos posicionales: toda la configuración se
recolecta de forma interactiva.

| Opción | Descripción |
|---|---|
| `--reconfigure` | Reconfigura las variables cruzadas en multirepo: fuerza volver a preguntar la URL y el dominio del repositorio hermano y reescribe las variables cruzadas, incluso si el manifiesto ya estaba `resolved`. Útil si cambiás de dominio después del primer deploy. |

`--reconfigure` es la única opción del comando. Todo lo demás —IP, usuario SSH,
método de autenticación, dominio, proveedor DNS, repositorio Git y rama de
producción— se pregunta en prompts interactivos.

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
   servicios preexistentes, aborta sin modificar nada.
6. **Endurece el sistema (AC-3).** Obtiene la clave pública SSH (la deriva de la
   privada, o la pide si usás contraseña) y crea el usuario `deploy` no-root,
   deshabilita el login root y la autenticación por contraseña por SSH, y
   configura el firewall dejando abiertos solo los puertos 22, 80 y 443.
7. **Se reconecta como `deploy`.** Cierra la conexión inicial (como `root`) y
   abre una nueva como el usuario `deploy` no-root con la clave privada
   correspondiente. Todos los pasos siguientes corren sin privilegios de root.
8. **Configura el runtime Docker (AC-4).** Resuelve el adapter instalado,
   le pide el contrato para el target (`get-contract`) y lee su `deployRuntime`
   —servicios, comandos de build/migración, puerto y healthcheck— en vez de
   hardcodearlos. Instala Docker CE y el plugin de Compose de forma idempotente,
   escribe `docker-compose.yml` en `/home/deploy/` y después corre
   `docker compose up -d` para levantar los contenedores.
9. **Configura el DNS (AC-5 / AC-6).** Con Cloudflare crea los registros A del
   dominio raíz y `www` y espera la propagación. En manual, te muestra los
   registros exactos a crear y hace polling. Ver
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
| `web` | `API_URL` (apunta al dominio del `api`) | `.env.production` (Vite la lee en build time) |
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

- **Cloudflare** — automatizado. Te pide un API token y crea los registros A
  del dominio raíz y `www` apuntando a la IP del VPS, y espera a que la
  propagación se confirme.
- **Manual** — el CLI te muestra los registros exactos a crear en tu proveedor
  y hace polling hasta detectar la propagación:

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
Todo el tráfico HTTP queda redirigido a HTTPS.

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
   compose pull` y `docker compose up -d`.
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
| `SSH_KNOWN_HOSTS` | host key del servidor (del `ssh-keyscan` del provisioning) |
| `DOCKER_REGISTRY_USER` | usuario del registry de Docker |
| `DOCKER_REGISTRY_TOKEN` | token del registry de Docker |

Para un backend completo se agregan además `DB_PASSWORD` y `APP_KEY`.

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
servicio que ocupa esos puertos y volvé a correr.

### Recursos insuficientes o distribución no soportada

```
❌ El servidor no cumple con los requisitos mínimos:

   • CPUs insuficientes: detectadas 1, se requiere 1
   • RAM insuficiente: detectados 1.0 GB, se requiere 2 GB
   • Distribución no soportada: Debian 12

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
