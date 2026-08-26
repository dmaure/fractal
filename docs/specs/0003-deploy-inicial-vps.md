# SPEC-0003: Deploy inicial a VPS

**Estado:** Draft
**Autor:** Diego
**Fecha:** 2026-08-01
**Última revisión:** 2026-08-16 — agregado AC-13 (deploy multirepo) por
ADR-0011; ampliado AC-1, AC-4, AC-8 y AC-13 por ADR-0012 (coordinación de
dominios en el primer deploy) y ADR-0013 (runtime nginx-only para web/)
**Issue:** #

---

## 1. Objetivo

Permitir que un usuario, partiendo de un VPS recién creado y un repositorio Git,
tenga su aplicación accesible en internet con HTTPS y deploy automático por merge,
sin escribir un solo comando de servidor.

---

## 2. Motivación

El deploy inicial es el mayor bloqueo entre "tengo código" y "el cliente lo puede ver".
Consume días de trabajo repetitivo y es donde más errores de seguridad se cometen
(puertos abiertos, root habilitado, secrets en el repo).

Automatizarlo permite el principio deploy-first: mostrar avances desde el día uno.

---

## 3. Historias de usuario

- Como **desarrollador**, quiero dar la IP y credenciales de mi VPS para que el
  sistema instale todo lo necesario, sin tener que saber administración de servidores.
- Como **desarrollador**, quiero que mi dominio apunte al servidor automáticamente
  cuando uso Cloudflare, para no configurar DNS a mano.
- Como **desarrollador**, quiero que al mergear a `production` mis cambios estén
  online en pocos minutos, sin intervención manual.
- Como **desarrollador**, quiero que si un deploy falla, la versión anterior siga
  funcionando, para no dejar al cliente sin servicio.

---

## 4. Criterios de aceptación

### AC-1: Recolección de datos
- **Dado** que ejecuto `fractal deploy` en un proyecto generado
- **Cuando** el CLI arranca
- **Entonces** se me solicitan: IP, usuario SSH, método de autenticación, dominio,
  proveedor DNS, repositorio Git y rama de producción
- **Nota de topología (ADR-0012, reemplaza a ADR-0011):** en monolito y
  monorepo desacoplado esto cubre todo el proyecto en una sola ejecución.
  En multirepo, `fractal deploy` se ejecuta una vez dentro de cada repo
  (`api/` y `web/`); cada ejecución es independiente, con su propio
  VPS/hosting, dominio y pipeline — ver AC-13
- **Nota de coordinación inicial (ADR-0012):** en multirepo, si el
  manifiesto local `fractal.project.yml` (SPEC-0001 AC-11) todavía tiene
  `orchestration_state: pending`, el CLI agrega dos preguntas a esta lista:
  la URL git del repo hermano y el dominio donde vivirá. No se conecta a
  ese repo — es información que el usuario ya tiene. Con esa respuesta
  escribe la variable cruzada correspondiente (`API_URL` en `web/`,
  `CORS_ALLOWED_ORIGIN`/dominio Sanctum en `api/`) y marca el manifiesto
  como `resolved`. Deploys posteriores, incluidos los disparados por merge,
  no repiten esta pregunta.

### AC-2: Validación previa
- **Dado** que ingresé los datos del servidor
- **Cuando** el CLI intenta conectarse
- **Entonces** verifica conectividad SSH, distribución compatible (Ubuntu LTS),
  recursos mínimos (1 vCPU, 2 GB RAM, 20 GB disco) y aborta con mensaje claro si algo falla

### AC-3: Hardening del sistema
- **Dado** que la conexión SSH es exitosa
- **Cuando** corre el provisioning
- **Entonces** se crea un usuario `deploy` no-root, se deshabilita el login root por SSH,
  se deshabilita la autenticación por contraseña y se configura UFW con solo 22, 80 y 443 abiertos

### AC-4: Runtime
- **Dado** que el sistema está endurecido
- **Cuando** continúa el provisioning
- **Entonces** quedan instalados y activos: Docker CE, Docker Compose plugin, Git,
  y los contenedores que correspondan según lo que declare el contrato del
  adapter para lo que se está desplegando (SPEC-0006): `app`, `nginx`, `db`,
  `redis`, `worker` y `scheduler` para un backend Laravel completo (monolito,
  monorepo desacoplado, o el repo `api/` en multirepo); solo `nginx`
  sirviendo el build estático de Vite cuando lo desplegado es el repo `web/`
  en multirepo (ADR-0013)

### AC-5: DNS automatizado
- **Dado** que elegí Cloudflare y proporcioné un API token
- **Cuando** corre el paso de DNS
- **Entonces** se crean los registros A para el dominio raíz y `www` apuntando a la IP,
  y se espera a que la propagación se confirme

### AC-6: DNS manual
- **Dado** que elegí configuración manual
- **Cuando** corre el paso de DNS
- **Entonces** el CLI muestra los registros exactos a crear y hace polling hasta
  detectar la propagación, con opción de continuar más tarde

### AC-7: SSL
- **Dado** que el DNS resuelve a la IP del servidor
- **Cuando** corre el paso de SSL
- **Entonces** se emite un certificado Let's Encrypt válido, se configura la
  renovación automática y todo el tráfico HTTP redirige a HTTPS

### AC-8: CI/CD
- **Dado** que el provisioning terminó
- **Cuando** el CLI genera el workflow
- **Entonces** se genera el workflow o pipeline correspondiente al proveedor
  de CI/CD elegido (GitHub Actions o GitLab CI, según ADR-0007), y se listan
  los secrets exactos que debo cargar en ese proveedor; en el primer deploy
  de un proyecto multirepo, esa lista incluye además el secret con el valor
  cruzado hacia el repo hermano (ADR-0012) — por ejemplo, al desplegar
  `api/`, el CLI imprime también qué secret cargar en `web/` con la URL de
  la API

### AC-9: Deploy por merge
- **Dado** que los secrets están configurados
- **Cuando** mergeo un PR a la rama de producción
- **Entonces** el workflow despliega, ejecuta migraciones, limpia caches y
  verifica un healthcheck en menos de 3 minutos

### AC-10: Rollback
- **Dado** que un deploy fue disparado
- **Cuando** el healthcheck posterior falla
- **Entonces** se restaura la versión anterior automáticamente y el workflow
  reporta fallo sin haber dejado el sitio caído

### AC-11: Idempotencia
- **Dado** que ya ejecuté `fractal deploy` con éxito
- **Cuando** lo ejecuto nuevamente con los mismos parámetros
- **Entonces** el resultado es idéntico, sin duplicar configuración ni romper el servicio

### AC-12: Agnosticismo de framework
- **Dado** el código de `packages/deploy`
- **Cuando** corre el lint de acoplamiento en CI
- **Entonces** no se detecta ninguna referencia a un framework concreto, y todo dato
  específico del target proviene del contrato del adapter (comando de build, comando
  de migración, puerto expuesto, ruta de healthcheck)

### AC-13: Deploy independiente en multirepo, coordinado solo la primera vez
- **Dado** un proyecto generado con topología multirepo (ADR-0010)
- **Cuando** ejecuto `fractal deploy` dentro del repo `api/` y, por separado,
  dentro del repo `web/`
- **Entonces** cada ejecución corre el flujo completo (AC-1 a AC-12) de forma
  independiente — ningún pipeline dispara ni coordina al otro (ADR-0012,
  reemplaza a ADR-0011);
  la **primera** ejecución de cada lado además pregunta la URL git y el
  dominio del hermano, hornea la variable cruzada correspondiente, y marca
  su manifiesto local `fractal.project.yml` como `resolved` (ADR-0012); las
  ejecuciones siguientes —incluidas las disparadas por merge vía CI/CD— no
  vuelven a preguntar nada, usan el valor ya guardado

---

## 5. Fuera de alcance

- Compra de dominios
- Proveedores DNS distintos de Cloudflare y Route53 (los demás son manuales)
- Sistemas operativos distintos de Ubuntu LTS
- Balanceo de carga, múltiples servidores, alta disponibilidad
- Backups automatizados (SPEC futuro)
- Monitoreo y alertas (SPEC futuro)
- Un comando único que despliegue ambos repos de multirepo a la vez, o
  pipelines CI/CD que se disparen entre sí (repository_dispatch /
  workflow_dispatch cruzado) — descartado explícitamente en ADR-0012, no
  solo pospuesto: la coordinación ocurre a nivel de CLI interactivo en el
  primer deploy, no a nivel de infraestructura de CI
- Creación o escritura automática de secrets en el proveedor de CI/CD del
  repo hermano — el CLI imprime qué cargar (AC-8), el usuario lo carga a
  mano, igual que para los secrets propios de cada repo
- Hosting estático de terceros (Vercel, Netlify, S3+CloudFront) para el
  repo `web/` en multirepo — evaluado y pospuesto en ADR-0013, se mantiene
  el mismo modelo de VPS + Docker Compose que el resto de Fractal

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| SPEC-0001 (comando `new`) | Bloqueante | Draft — reabierto por ADR-0010 |
| SPEC-0002 (bridge Node → toolchain) | Bloqueante | Aprobado |
| ADR-0006 (runtime de producción) | Bloqueante | Aceptado |
| ADR-0007 (CI/CD para deploy por merge) | Bloqueante | Aceptado |
| ADR-0010 (topología del proyecto generado) | Bloqueante | Aceptado |
| ADR-0012 (deploy multirepo: coordinación en el primer deploy) | Bloqueante | Aceptado |
| ADR-0013 (runtime nginx-only para web/ en multirepo) | Bloqueante | Aceptado |

---

## 7. Consideraciones técnicas

**Seguridad**
- Las credenciales SSH nunca se persisten en disco en texto plano
- El `.env` de producción se genera en el servidor, nunca viaja por el repositorio
- `APP_KEY` se genera en el servidor en el primer provisioning

**Rendimiento**
- El provisioning completo debe terminar en menos de 15 minutos
- Los deploys posteriores no reconstruyen la imagen salvo que cambien las dependencias

**Compatibilidad**
- Ubuntu 22.04 LTS y 24.04 LTS

---

## 8. Preguntas abiertas

- [ ] ¿Rollback por reinicio de contenedor anterior o por tag de imagen versionada?
- [ ] ¿Dónde se almacena el estado del provisioning para garantizar idempotencia?
- [ ] ¿Se soporta el escenario de múltiples entornos (staging + production) en v1?
- [ ] ¿Qué hacer si el usuario ya tiene servicios corriendo en el VPS?

Resuelto el 2026-08-16 (ADR-0011, ampliado por ADR-0012): multirepo se cubre
con dos ejecuciones independientes de `fractal deploy`, una por repo, con la
primera ejecución de cada lado coordinando el dominio del hermano vía el
manifiesto `fractal.project.yml` — ver AC-13. Resuelto también el runtime
del lado `web/` (ADR-0013: Docker Compose con solo `nginx`) — ver AC-4.

Nuevas preguntas abiertas por ADR-0012 y ADR-0013:

- [ ] ¿`fractal.project.yml` se commitea al repo (visible en el historial,
  incluye el dominio de producción) o va en `.gitignore` como el `.env`?
- [ ] Si el usuario cambia de dominio después del primer deploy, ¿hay un
  flag (`fractal deploy --reconfigure`) para volver a pedir el dato del
  hermano, o queda como edición manual del `.env`/secret?
- [ ] El CDN queda fuera de alcance para `web/` en multirepo (ADR-0013) —
  ¿vale la pena, igualmente, dejar Cloudflare como proxy delante del VPS
  del lado `web/` para mitigar la falta de CDN, ya que AC-5/AC-6 de este
  spec ya asumen Cloudflare como proveedor DNS soportado?

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Test end-to-end contra un VPS efímero real pasa en CI
- [ ] Documentación de usuario escrita
- [ ] ADR-0006 y ADR-0007 creados y aceptados
- [ ] Spec marcado como Implementado
