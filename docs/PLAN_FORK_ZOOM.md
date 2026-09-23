# Plan de fork → Zoom (paso a paso)

> **Movido desde el repo de High el 2026-09-22**, donde nunca estuvo versionado. La fase 0 se ejecutó en High (sus comandos usan esa ruta); todo lo demás es de este repo. Estado al moverlo: fases 0 a 4 cerradas, ambiente de pruebas (fase 7) arriba en Railway, producción sin crear, Meta aplazada. Lo decidido después vive en [DIVERGENCIA.md](../DIVERGENCIA.md).

**Fecha:** 2026-09-18 · **Punto de partida:** `develop` @ `eee96a9` · **Alcance de este plan:** fases 0 a 9 (clon funcional sin sedes). La dimensión de sede (`locationId`) es la fase 10 y va **después** de que Zoom esté en producción sin ella.

> **Decisión 2026-09-18: Meta / WhatsApp se deja para el final.** No hay afán con las aprobaciones, así que la fase 1 se ejecuta al cierre, después de la aceptación funcional. Consecuencias asumidas: (a) los ítems de WhatsApp de la fase 9 quedan pendientes hasta que Meta responda; (b) **el dominio sí tiene que estar decidido antes de enviar las plantillas**, porque la URL del botón "Ver detalle" se quema dentro de la plantilla; (c) hasta entonces, las aprobaciones se gestionan desde la UI, que es el camino completo de todos modos.

---

## Orden real de ejecución (resumen)

| Orden | # | Fase | Bloquea a | Tiempo |
|---|---|------|-----------|--------|
| 1.º | 0 | Pre-vuelo | todo | ✅ hecho (drift 0, 2892 tests verdes) |
| 2.º | 2 | **Dominio: comprar y delegar DNS** | Railway, plantillas | arrancar YA (propagación) |
| 3.º | 3 | Fork del repo con historia | 4–9 | 30 min |
| 4.º | 4 | Rebranding | build | 45 min |
| 5.º | 5 | Railway: proyecto, DB, servicios | 6–9 | 1 h |
| 6.º | 6 | Dominios en Railway + CORS | 7–9 | 30 min + DNS |
| 7.º | 7 | **Ambiente de pruebas (staging + local)** | 8–9 | 1 h |
| 8.º | 8 | Arranque de la base de producción | 9 | 20 min |
| 9.º | 9 | Aceptación funcional (sin WhatsApp) | — | medio día |
| 10.º | 1 | **Meta / WhatsApp** (aplazada por decisión) | — | 1–3 días de Meta |
| — | 10 | Sedes (`locationId`) — **después** de producción | — | otro proyecto |

La fase 2 (dominio) se lanza en paralelo con la 3 porque el reloj de la propagación lo corre un tercero.

---

## Fase 0 — Pre-vuelo (en este repo, antes de forkear)

```bash
cd /Users/jeffersonrivera/dev/Hight-Solutions/hight-solutions-backoffice
git checkout develop && git pull
cd backend && npm run prisma:drift   # debe salir 0: schema.prisma == migraciones
npm run test:ci
cd ../frontend && npm run lint && npm run test
```

- [x] `prisma:drift` en 0 (2026-09-18: «No difference detected»).
- [x] Backend: 189 suites / 2892 tests verdes (2026-09-18).
- [ ] Frontend: `npm run lint && npm run test`.
- [ ] Marca el punto de bifurcación:

```bash
git tag -a fork-zoom-2026-09 -m "Punto de bifurcación del fork de Zoom" && git push origin fork-zoom-2026-09
```

---

## Fase 1 — Meta / WhatsApp Cloud API (**aplazada: se ejecuta al final**)

> Decisión del 2026-09-18: esta fase va después de la aceptación funcional. Se queda numerada como 1 para no romper las referencias del resto del documento. Lo único que no se puede aplazar es **el dominio**, porque la URL del botón viaja dentro de la plantilla.

Zoom necesita **su propio WABA, su propio número y sus propias plantillas**. Nada se reutiliza de High: el `WHATSAPP_ACCESS_TOKEN` está atado a la app y el `PHONE_NUMBER_ID` al número.

### 1.1 Cuenta y número
1. [business.facebook.com](https://business.facebook.com) → crea el **Business Portfolio de Zoom** (o usa el existente si el cliente ya tiene uno).
2. **Verificación de negocio**: documento de cámara de comercio/RUT a nombre de Zoom. ⏳ Es lo más lento — súbelo hoy.
3. Crea una **app de tipo Business** → agrega el producto **WhatsApp**.
4. Registra el **número nuevo** (no puede estar activo en WhatsApp normal; si lo está, hay que borrar esa cuenta primero). Verifica por SMS/llamada.
5. Anota: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`.
6. **Token permanente**: Business Settings → Usuarios del sistema → crea uno con rol Admin → asígnale la app y el WABA → genera token con `whatsapp_business_messaging` + `whatsapp_business_management`. Ese es `WHATSAPP_ACCESS_TOKEN`.
7. App → Configuración → Básica → **Clave secreta** = `WHATSAPP_APP_SECRET` (el webhook valida la firma con ella).
8. Inventa un `WHATSAPP_VERIFY_TOKEN` (cadena aleatoria tuya, no de Meta).

### 1.2 Plantillas — el detalle que muerde
Los nombres de plantilla están **quemados en el código** (`backend/src/modules/whatsapp/whatsapp.service.ts:277-292`):

| Ambiente | Aprobación genérica | Edición de OP |
|---|---|---|
| production | `solicitud_aprobacion_general_prod_v2` | `solicitud_edicion_op_v4_prod` |
| dev/staging | `solicitud_aprobacion_v1` | `solicitud_edicion_op_v2` |

Créalas en el WABA de Zoom **con exactamente esos nombres** (así no tocas código), idioma `es_CO`, y la misma estructura: body con `{{1}}` solicitante, `{{2}}` rol, `{{3}}` acción, `{{4}}` motivo; botones en este orden → **0: URL dinámica "Ver detalle"**, 1: Quick Reply "Autorizar", 2: Quick Reply "Rechazar".

⚠️ **El prefijo de la URL del botón 0 vive dentro de la plantilla, en Meta, y no se puede cambiar sin volver a aprobarla.** Debe ser el dominio de Zoom, no el de High:

```
https://api.<dominio-zoom>/api/v1/approvals/{{1}}
```

Por eso la fase 2 (dominio) tiene que estar decidida **antes** de enviar las plantillas a revisión. La plantilla de producción y la de pruebas apuntan a hosts distintos (`api.` y `api.pruebas.`), así que son dos plantillas por tipo.

- [ ] 4 plantillas enviadas a revisión (2 de prod + 2 de pruebas).

### 1.3 Webhook (se conecta en la fase 6, cuando exista el dominio)
- URL de callback: `https://api.<dominio-zoom>/api/v1/webhooks/whatsapp`
- Token de verificación: el `WHATSAPP_VERIFY_TOKEN` que inventaste.
- Suscribe el campo **`messages`** (sin eso, los botones Autorizar/Rechazar no llegan).

---

## Fase 2 — Dominio y DNS (arráncala en paralelo)

**Dominio confirmado el 2026-09-20: `zoompublicidadcrm.com`**, registrado en **Name.com** y usando sus nameservers (`ns1kpv/ns2cvx/ns3gnv/ns4fpy.name.com`). Se necesitan **5 hosts**:

| Host | Apunta a | Uso |
|---|---|---|
| `zoompublicidadcrm.com` (apex) | servicio frontend (prod) | app |
| `www.zoompublicidadcrm.com` | servicio frontend (prod) | redirección/alias |
| `api.zoompublicidadcrm.com` | servicio backend (prod) | API + webhook |
| `pruebas.zoompublicidadcrm.com` | frontend (staging) | QA |
| `api.pruebas.zoompublicidadcrm.com` | backend (staging) | API QA |

- [x] **Dominio comprado dentro de Railway** (USD 14/año, renueva 2027-08-21, auto-renovación activa). Railway gestiona la zona; los nameservers son de name.com porque Railway revende ahí.
- [x] **Dónde vive el DNS: en Railway.** No hace falta Cloudflare. Como Railway controla la zona, al agregar un dominio a un servicio crea los registros solo, **apex incluido** — que era el único punto espinoso, porque el estándar no permite CNAME en el apex. Tampoco hace falta transferir el dominio (bloqueado hasta 2026-11-19 por la espera de 60 días de ICANN).
- ℹ️ **El parking no es un comodín.** Hoy el apex y cualquier subdominio responden `91.195.240.94` porque la zona está **vacía** y name.com sirve su página de parking. No hay ningún registro `*` que borrar: en cuanto Railway cree los registros, los hosts configurados resuelven bien. Los subdominios no configurados pueden seguir mostrando parking; es cosmético.
- [ ] Correo: la zona no tiene MX y Railway ofrece **Email Forwarding** en el panel del dominio. Si el cliente quiere `algo@zoompublicidadcrm.com`, se resuelve ahí sin tocar nada de la app.

---

## Fase 3 — Fork del repo (con historia, no copia de archivos)

```bash
# 1) Repo nuevo y vacío en GitHub: zoom-crm (privado, SIN README/.gitignore/licencia)
cd /Users/jeffersonrivera/dev
git clone https://github.com/riverajefer/hight-solutions-backoffice.git zoom-crm
cd zoom-crm
git remote rename origin upstream
git remote add origin https://github.com/riverajefer/zoom-crm.git
git checkout develop
git push -u origin develop master --tags
```

- [ ] `git remote -v` muestra `origin` → zoom y `upstream` → high.
- [ ] Crea `DIVERGENCIA.md` en el commit inicial del fork: qué se cambió respecto a upstream y por qué (se llena en cada fase).
- [ ] Política de portabilidad escrita en ese mismo archivo: **los fixes de core nacen en High y se traen con `git cherry-pick` desde `upstream`**; lo específico de Zoom (sedes, branding) nunca vuelve.
- [ ] `npm install` en `backend/` y `frontend/`.

---

## Fase 4 — Rebranding (lista cerrada de archivos)

Estos son los puntos reales donde aparece "High Solutions" (verificado hoy):

| Archivo | Qué cambiar |
|---|---|
| `frontend/index.html:7` | `<title>` |
| `frontend/src/components/layout/Topbar.tsx:133` | nombre visible |
| `frontend/src/components/layout/Sidebar.tsx:621` | `alt` del logo |
| `frontend/src/features/auth/components/LoginForm.tsx:66,81` | `alt` y "Bienvenido a…" |
| `frontend/src/utils/environment.ts:87` | fallback de `VITE_APP_NAME` |
| `frontend/src/utils/pdfConstants.ts:1-7` | **datos reales que salen en todos los PDF**: nombre, dirección, ciudad, teléfonos, email |
| `frontend/src/features/orders/utils/generateOrderPdf.ts:163,170` | ⚠️ nombre y sitios web **quemados aparte** de `pdfConstants.ts` |
| `frontend/src/features/quotes/utils/generateQuotePdf.ts:162,169` | ⚠️ ídem |
| `frontend/src/features/expense-orders/utils/generateExpenseOrderPdf.ts:163,169` | ⚠️ ídem |
| `frontend/src/features/work-orders/utils/generateWorkOrderPdf.ts:118,124` | ⚠️ ídem |
| `frontend/src/features/orders/pages/OrderDetailPage.tsx:603` | mensaje de WhatsApp al cliente («…de High Solutions») |
| `frontend/src/features/quotes/pages/QuoteDetailPage.tsx:251` | ídem, en cotizaciones |
| `backend/src/modules/company/dto/create-company.dto.ts:14` | ejemplo de Swagger |
| `frontend/src/assets/logo.png`, `logo-dark.webp` | logos de Zoom |
| `frontend/public/favicon.png` | favicon |
| `backend/src/common/middleware/maintenance.middleware.ts:43` | título de la página de mantenimiento |
| `backend/prisma/seed.ts:2641-2646` | datos de la empresa sembrada |
| `backend/src/modules/client-errors/dto/report-client-error.dto.ts:47` | ejemplo de Swagger (cosmético) |
| `backend/src/modules/whatsapp/whatsapp.service.ts:419` | comentario con la URL base (cosmético, pero actualízalo o confunde) |
| `CLAUDE.md` y `backend/docs/ai-guides/` | **imprescindible**: si la doc para IA describe a High, se genera código que ignora el scoping por sede |

Verificación:

```bash
grep -rinE "high ?solutions|highsolutions|crmhighsolutions" backend/src frontend/src backend/prisma frontend/index.html *.md docs backend/docs | grep -v node_modules
```

- [ ] Solo quedan menciones en `.spec.ts` (fixtures, no importa) y en `DIVERGENCIA.md`.
- [ ] ⚠️ El rol admin se busca **por nombre** en 24 archivos: en Zoom debe seguir llamándose exactamente `admin`.
- [ ] `cd frontend && npm run build` compila.

---

## Fase 5 — Railway: proyecto, base de datos y servicios

**Dónde crearlo:** proyecto nuevo **dentro del workspace actual** (plan Pro, USD 20 de crédito incluido; el consumo real de High es ~USD 10–15/mes, así que Zoom probablemente cabe). Cuando entre en producción, "Transfer Project" al workspace de Zoom. Así no pagas un segundo piso durante el montaje.

> **Decisión 2026-09-22: primero pruebas, después producción.** Se monta y se acepta `staging` completo, y producción se crea **duplicando** un ambiente ya verificado. Producción no se toca hasta que la fase 9 pase en pruebas.

### 5.1 Servicios
1. Proyecto `zoom-crm`. **Renombra el ambiente por defecto de `production` a `staging`** (Settings del ambiente → Rename). Dos razones: el nombre tiene que ser literalmente `staging` para que `railway.toml` use `start:staging`, y así no queda un ambiente de producción a medio configurar intentando desplegar servicios sin variables. Producción se crea al final, duplicando este.
2. **+ New → Database → PostgreSQL** (Postgres 17, misma versión que PRD).
3. **+ New → Bucket** (Tigris) para archivos: entrega sus propias `AWS_*`. **No compartas el bucket de High.**
   - ⚠️ **Créalo ANTES del primer deploy del backend.** `StorageS3Service` lanza en el constructor si falta cualquiera de las `AWS_*`: el backend no arranca, el healthcheck falla y el despliegue se cae. Verificado en local el 2026-09-18. (WhatsApp no: ese degrada con un warning.)
4. **+ New → GitHub Repo** → `zoom-crm`, **root directory `backend`**.
5. **+ New → GitHub Repo** → `zoom-crm`, **root directory `frontend`**.
6. Confirma que cada servicio tomó su `railway.toml` (backend: healthcheck `/health`, `migrate deploy` + `start:prod`; frontend: `node server.js`, healthcheck `/`).

### 5.2 Variables — backend

| Variable | Valor en Zoom |
|---|---|
| `DATABASE_URL` | referencia a la Postgres del proyecto (`${{Postgres.DATABASE_URL}}`) |
| `NODE_ENV` | `production` / `staging` |
| `PORT` | lo inyecta Railway |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **nuevos**, `openssl rand -base64 48` cada uno. Jamás los de High |
| `JWT_ACCESS_EXPIRATION` / `JWT_REFRESH_EXPIRATION` | copia los valores de High |
| `SWAGGER_ENABLED` | `false` en prod |
| `FRONTEND_URL` | dominio del frontend. ⚠️ En High está guardada **sin esquema**; `cors-origins.util.ts` lo tolera, pero lo limpio es `https://zoompublicidadcrm.com` |
| `CORS_ORIGINS` | `https://zoompublicidadcrm.com,https://www.zoompublicidadcrm.com` (tiene prioridad sobre `FRONTEND_URL`) |
| `SEED_ADMIN_PASSWORD` | contraseña temporal fuerte (se cambia al primer ingreso) |
| `SEED_DEMO` | `false` |
| `ATTENDANCE_WORKDAY_END` | igual que High salvo que Zoom tenga otro horario |
| `LOG_LEVEL` | `info` |
| `LOKI_HOST` / `LOKI_USER` / `LOKI_API_KEY` | mismo Grafana Cloud. ⚠️ La etiqueta `app` está **quemada** en `logger.config.ts` (2 sitios) como `backoffice-backend`: en el fork hay que cambiarla (`zoom-backend`) o los logs de las dos empresas caen en el mismo stream |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_ENDPOINT_URL`, `AWS_S3_BUCKET_NAME` | los del Bucket **nuevo** |
| `AWS_S3_SIGNED_URL_EXPIRATION` | copia de High (tope 7 días) |
| `MAINTENANCE_MODE` | `false` |
| `MAINTENANCE_MESSAGE` | opcional |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | los de la fase 1 |
| `WHATSAPP_API_VERSION` | `v22.0` |

`WHATSAPP_ACTION_SECRET` aparece en el código viejo pero **ya no se usa**: no la crees.

### 5.3 Variables — frontend

| Variable | production | staging |
|---|---|---|
| `VITE_API_URL` | `https://api.zoompublicidadcrm.com/api/v1` | `https://api.pruebas.zoompublicidadcrm.com/api/v1` |
| `VITE_APP_NAME` | `Zoom CRM` | `Zoom CRM (pruebas)` |
| `VITE_ENVIRONMENT` | `production` | `staging` |
| `VITE_SHOW_DEMO_CREDENTIALS` | `false` | `false` |

⚠️ Vite quema las `VITE_*` en el build: cambiar una exige **redeploy**, no basta reiniciar.

### 5.4 Backups
- [ ] Activa backups automáticos del Postgres en Railway.
- [ ] **Prueba una restauración** antes de que entren datos reales. Un backup sin restaurar probada no es un backup.
- [ ] El volumen por defecto: revisa que no quede en 1 GB (a High se le llenó y tumbó producción ~41 min). Súbelo a 10 GB.

---

## Fase 6 — Dominios en Railway + CORS

1. Backend (prod) → Settings → Networking → **Custom Domain** → `api.zoompublicidadcrm.com` → copia el CNAME target que te dé Railway.
2. Repite para frontend prod (apex + www) y para ambos servicios de staging. **Cada uno da un target distinto.**
3. Crea los registros en el DNS. Apex: ALIAS/ANAME (o Cloudflare con proxy).
4. Espera el certificado (Railway lo emite solo; minutos a una hora).
5. Ajusta `FRONTEND_URL` y `CORS_ORIGINS` con los dominios finales y redeploy.
6. Ahora sí, conecta el **webhook de WhatsApp** (fase 1.3) a `https://api.zoompublicidadcrm.com/api/v1/webhooks/whatsapp`.

Verificación:

```bash
curl -i https://api.zoompublicidadcrm.com/health
curl -i -H "Origin: https://zoompublicidadcrm.com" https://api.zoompublicidadcrm.com/api/v1/auth/login  # debe traer access-control-allow-origin
```

---

## Fase 7 — Ambiente de pruebas (staging + local)

El ambiente de pruebas se monta **antes** que producción: es donde compruebas que el clon arranca, y es lo único que puedes romper sin consecuencias. La aceptación de la fase 9 se corre aquí primero.

### 7.1 La decisión que hay que tomar hoy: base de datos aparte

En High, **dev y staging comparten la misma base**. Es una deuda que obliga a que toda migración sea idempotente y hace que un `db:reset` en local borre lo de QA. El fork es el único momento en que se arregla gratis.

**Recomendación: tres bases separadas.**

| Ambiente | Base | Costo |
|---|---|---|
| production | Postgres del proyecto Railway | ya creada en la fase 5 |
| staging | **segunda Postgres en el mismo proyecto Railway**, adjunta al ambiente `staging` | ~USD 1–3/mes, cabe en el crédito del plan Pro |
| local (dev) | **Postgres en Docker, en tu máquina** | gratis |

```bash
docker run -d --name zoom-pg \
  -e POSTGRES_PASSWORD=zoomdev -e POSTGRES_DB=zoom_dev \
  -p 55432:5432 postgres:17
```

⚠️ **Hacen falta DOS archivos con el mismo `DATABASE_URL`**, no uno:

| Archivo | Quién lo lee |
|---|---|
| `backend/.env` | el **CLI de Prisma** (`prisma.config.ts` hace `import "dotenv/config"`, que solo carga `.env`) |
| `backend/.env.development` | la **aplicación NestJS**, que lee `.env.<NODE_ENV>` |

Sin el primero, `prisma migrate deploy` falla con `Cannot resolve environment variable: DATABASE_URL` aunque el `.env.development` esté bien.

Con esto, `npm run prisma:migrate` (que es `migrate dev` y puede reescribir el historial) nunca toca una base compartida, y dejas de depender de que cada migración escrita a mano sea idempotente.

- [ ] Si el cliente no quiere pagar la segunda Postgres: staging y local comparten base, **y entonces toda migración nueva tiene que ser idempotente** (`IF NOT EXISTS`, `DO $$ ... $$`). Escríbelo en `DIVERGENCIA.md` para que no se olvide.

### 7.2 Ambiente `staging` en Railway

1. En el proyecto de Zoom → **New Environment** → nombre **literalmente `staging`** (en minúscula). `backend/railway.toml` tiene `[environments.staging.deploy]` con `start:staging`; si el nombre no coincide, el backend arranca como producción y **los logs de QA se mezclan con los de PRD en Grafana**.
2. Duplica los dos servicios (backend y frontend) en ese ambiente, apuntando al mismo repo.
3. **Ramas de despliegue**: `develop` es el trabajo del día, el ambiente **`staging` sigue a la rama `staging`**, y `production` sigue a `master`. Flujo `develop → staging → master`, decidido el 2026-09-22:
   - `develop → staging`: **fast-forward directo** (`git merge --ff-only develop`), sin PR. Es QA; el `--ff-only` falla si `staging` tuviera algo propio, en vez de mezclar en silencio.
   - `staging → master`: **siempre por PR**. Despliega a producción, y el hook de pre-push rechaza el push directo.
4. Adjunta la Postgres de staging (7.1) y **un bucket aparte** — si compartes el bucket con producción, un borrado de prueba se lleva un adjunto real.

### 7.3 Variables de staging

Backend — igual que producción salvo estas:

| Variable | staging |
|---|---|
| `NODE_ENV` | `staging` |
| `DATABASE_URL` | la Postgres de staging |
| `SWAGGER_ENABLED` | `true` (aquí sí conviene) |
| `LOG_LEVEL` | `debug` |
| `FRONTEND_URL` | `https://pruebas.zoompublicidadcrm.com` |
| `CORS_ORIGINS` | `https://pruebas.zoompublicidadcrm.com` |
| `SEED_DEMO` | `true` |
| `SEED_ADMIN_PASSWORD` | una distinta a la de producción |
| `AWS_*` | las del bucket de staging |
| `WHATSAPP_*` | ver 7.5 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **distintos a los de producción** (un token de QA no debe valer en PRD) |

Frontend — las de la tabla de la fase 5.3, columna staging.

⚠️ Los archivos `.env.staging` y `.env.production` **no están en git** (`.gitignore` los excluye) y Railway no los usa: en Railway manda **solo** el dashboard. Los `.env.*` locales son para tu máquina.

⚠️ El `railway.toml` del frontend no tiene override por ambiente: staging compila con `npm run build` (modo production) y toma las `VITE_*` del dashboard de Railway. Funciona, pero **cada cambio de una `VITE_*` exige redeploy**, no reinicio.

### 7.4 Arranque de la base de staging

```bash
# migraciones: las corre el propio startCommand del backend al desplegar
# seed CON datos de demo, para tener con qué probar
NODE_ENV=staging SEED_DEMO=true SEED_ADMIN_PASSWORD='<la de QA>' npm run prisma:seed
```

- [ ] Entra a `https://pruebas.zoompublicidadcrm.com` con `adminsistema` (recuerda: **username, no email**).
- [ ] Las credenciales demo del login **no** deben verse: `VITE_SHOW_DEMO_CREDENTIALS=false`.
- [ ] Corre `backend/scripts/db-invariants.sh` contra la base de staging.

### 7.5 WhatsApp en pruebas — el límite que hay que entender

El webhook se configura **por app de Meta**, y un WABA se suscribe a **una sola app**. Es decir: un mismo número **no puede** entregar los botones Autorizar/Rechazar a producción y a staging al mismo tiempo. Dos caminos:

| Opción | Cómo | Cuándo |
|---|---|---|
| **A — app y número de pruebas** (recomendada) | Segunda app de Meta con el **número de prueba gratuito** que da Meta (envía a hasta 5 destinatarios verificados). Webhook → `https://api.pruebas.zoompublicidadcrm.com/api/v1/webhooks/whatsapp`. Plantillas `solicitud_aprobacion_v1` y `solicitud_edicion_op_v2` con el botón apuntando a `api.pruebas.…` | si vas a tocar el flujo de aprobaciones |
| **B — sin webhook en staging** | El webhook solo existe en producción. En QA las solicitudes se aprueban desde la UI; el WhatsApp no llega | si en Zoom no vas a modificar aprobaciones |

- [ ] Elegida la opción y escrita en `DIVERGENCIA.md`.
- [ ] Si es la A: los celulares de quienes vayan a probar, **agregados como destinatarios verificados** en Meta (sin eso el mensaje se envía y nunca llega, sin error visible).
- [ ] `WHATSAPP_VERIFY_TOKEN` distinto al de producción.

### 7.6 Cierre de la fase

- [ ] Un `git push` a `develop` despliega staging y **no** toca producción.
- [ ] Los logs de staging salen en Grafana con `env="staging"`, separados de los de producción.
- [ ] `curl -i https://api.pruebas.zoompublicidadcrm.com/health` → 200.
- [ ] Recorrido de la fase 9 ejecutado **completo aquí** antes de sembrar producción.
- [ ] Los datos de prueba se pueden dejar; solo que sean reconocibles (cliente "PRUEBA — …").

---

## Fase 8 — Producción (solo después de aceptar pruebas)

### 8.0 Crear el ambiente de producción duplicando staging

1. En el proyecto → **New Environment → duplicar `staging`**. Hereda los servicios y su configuración, que es justo lo que queremos después de haberla verificado.
2. ⚠️ **Verifica qué pasó con la base y el bucket.** Producción tiene que arrancar **vacía**: si el duplicado trajo una copia de la Postgres de pruebas con datos, bórrala y agrega una PostgreSQL nueva. Lo mismo con el bucket: producción necesita el suyo, no el de QA, o un borrado de prueba se lleva un archivo real.
3. Cambia las variables a las de producción (tabla 5.2): `NODE_ENV=production`, `SWAGGER_ENABLED=false`, `SEED_DEMO=false`, `LOG_LEVEL=info`, `FRONTEND_URL`/`CORS_ORIGINS` con el apex y el `www`, y **secretos JWT distintos a los de staging**.
4. Rama de despliegue: `master`. Y **una sola réplica**.
5. Agrega los dominios de producción (apex, `www`, `api.`).

### 8.1 Arranque de la base de producción

Las 124 migraciones aplican limpio sobre una base vacía (verificado en Postgres 17 el 2026-09-16).

```bash
# 1) migraciones: las corre el propio startCommand del backend (migrate deploy)
#    Confirma en los logs del deploy que aplicó las 124.

# 2) seed, una sola vez, desde Railway (railway run) o con DATABASE_URL apuntando a la nueva DB
NODE_ENV=production SEED_DEMO=false SEED_ADMIN_PASSWORD='<la fuerte>' npm run prisma:seed
```

- [ ] El seed siembra el catálogo de permisos (`prisma/permissions-catalog.ts`): **en base nueva no hace falta `sync-permissions`**.
- [ ] Entra con **`adminsistema`** + `SEED_ADMIN_PASSWORD`. Ojo: el login es por **username, no por email** (mandar email da 401).
- [ ] Cambia la contraseña del admin.
- [ ] Llena la pantalla de **Empresa** (nombre, NIT, dirección, logos, datos bancarios) — es lo que sale en los PDF junto con `pdfConstants.ts`.
- [ ] Crea los roles y usuarios reales de Zoom. Recuerda: solo puedes asignar permisos contenidos en los tuyos; `admin` es intocable y el nombre está reservado.
- [ ] Corre las invariantes contra la base nueva: `backend/scripts/db-invariants.sh`.

---

## Fase 9 — Aceptación funcional (sin sedes)

Ejecuta este recorrido completo en **staging** (fase 7) y repítelo en producción:

- [ ] Login, logout, refresh de token (deja la pestaña 20 min abierta: asistencia/presencia).
- [ ] Crear cliente, proveedor, producto.
- [ ] Abrir caja → crear OP → pago en efectivo → verificar `CashMovement` y arqueo.
- [ ] OP a crédito: se registra en **$0** (si nace con monto, la OP aparece pagada e infla la caja).
- [ ] Solicitud de aprobación **desde la UI**: se crea, el admin la ve en su bandeja, autoriza y rechaza. (El envío por WhatsApp queda pendiente de la fase 1 aplazada; verifica que la falta de credenciales de WhatsApp **no rompa** el flujo: la solicitud debe crearse igual y el log decir por qué no se envió.)
- [ ] Orden de gasto + cuenta por pagar espejo: se concilian.
- [ ] Devolución: `paidAmount` no resucita.
- [ ] Generar los PDF (OP, OT, cotización, OG): membrete y datos de Zoom.
- [ ] Subir un adjunto → se guarda en el bucket de Zoom y la URL prefirmada abre.
- [ ] Exportar a Excel una tabla larga (paginado).
- [ ] Logs visibles en Grafana con la etiqueta del ambiente de Zoom, separados de los de High.
- [ ] Un deploy nuevo con la pestaña abierta: aparece el banner de versión nueva, no la pantalla en blanco.

---

## Fase 10 — Sedes (después, y es el punto de no retorno)

No la toques hoy. Cuando llegue:
1. Define **primero** cómo funciona el inventario entre sedes (arrastra pedidos y producción).
2. `locationId` en las entidades core desde la **primera** migración de esa fase.
3. Scoping centralizado en los guards, no `if` regados por los servicios.
4. Caja: `findActiveCashSession()` ya acepta `cashRegisterId` — pásale la caja de la sede del usuario. Sin eso, con 3 sesiones `OPEN` a la vez un pago de una sede cae en la caja de otra.
5. Desde ese commit, reconverger con High deja de ser viable.

---

## Riesgos y cómo se ven venir

| Riesgo | Señal | Mitigación |
|---|---|---|
| Meta tarda en verificar el negocio | plantillas en "pendiente" días | arrancar la fase 1 lo primero; aceptar con pruebas manuales entretanto |
| Plantilla aprobada con la URL de High | el botón "Ver detalle" lleva al CRM equivocado | fijar el dominio **antes** de enviar plantillas |
| Reutilizar secretos de High | un token de High firmando sesiones de Zoom | secretos JWT nuevos, bucket nuevo, WABA nuevo |
| Volumen de Postgres pequeño | disco al 90% | 10 GB desde el inicio; medir antes de cualquier operación pesada |
| Backend con réplicas | 9 crons duplicados, socket.io sin adapter | **una sola réplica** en Railway |
| Doble mantenimiento | fixes que se pierden | `upstream` + `DIVERGENCIA.md` + cherry-pick como única vía |
