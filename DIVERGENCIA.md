# DIVERGENCIA.md — Zoom CRM respecto a High Solutions

Este repositorio es un **fork independiente** del backoffice de High Solutions, no un multi-tenant. Comparte historia de git con el original pero evoluciona por separado.

| | |
|---|---|
| **Origen** | `riverajefer/hight-solutions-backoffice` |
| **Punto de bifurcación** | tag `fork-zoom-2026-09` · commit `eee96a9` (rama `develop`) |
| **Fecha del fork** | 2026-09-18 |
| **Plan de montaje** | `docs/PLAN_FORK_ZOOM.md` |

---

## 1. Política de portabilidad de cambios

**Los arreglos del núcleo nacen en High y se traen aquí; nunca al revés.**

```bash
git fetch upstream
git cherry -v develop upstream/develop          # "-" ya aplicado, "+" pendiente
git cherry-pick <sha>
```

⚠️ **No uses `git log eee96a9..upstream/develop` para esto.** El cherry-pick crea un commit nuevo con otro `sha`, así que git nunca da por alcanzado el original de High: ese comando lista como pendiente todo lo que ya trajiste. `git cherry` compara el contenido de cada cambio y sí los reconoce. Su límite: un cherry-pick que hubo que ajustar a mano por un conflicto deja de ser idéntico y sigue saliendo con `+`; para esos está la bitácora de la sección 4.

- `upstream` está en **solo lectura**: su URL de push es `DISABLED`, así que `git push upstream` falla a propósito. Si algún día hay que revertirlo: `git remote set-url --push upstream <url>`.
- Lo específico de Zoom (branding, sedes, cualquier regla de negocio propia) **no vuelve** a High.
- Cada cherry-pick traído se anota en la bitácora de la sección 4 con su `sha` de origen.
- Un fix del núcleo descubierto **aquí** primero: arréglalo en High, y de allá lo traes. Así no se bifurca la lógica común.

### Flujo de ramas (decidido 2026-09-22)

| Salto | Cómo | Por qué |
|---|---|---|
| trabajo → `develop` | push directo | es la rama del día a día |
| `develop` → `staging` | **fast-forward directo**, sin PR | es QA: cada cambio se despliega en pruebas al instante |
| `staging` → `master` | **siempre por PR** | `master` despliega a producción; el hook de pre-push rechaza el push directo |

```bash
# develop → staging
git checkout staging && git merge --ff-only develop && git push && git checkout develop

# staging → master
gh pr create --base master --head staging
```

El `--ff-only` es la red de seguridad del salto directo: si `staging` tuviera algo propio que `develop` no tiene (un hotfix hecho directo ahí), el comando **falla** en vez de crear un merge en silencio. Si falla, hay que traer ese cambio a `develop` primero y volver a intentarlo.

---

## 2. Decisiones tomadas

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-09-05 | **Fork independiente** en vez de multi-tenant | lo pidió el cliente priorizando tiempo; se acepta que el clon hereda los bugs actuales y que hay doble mantenimiento |
| 2026-09-15 | La dimensión de **sede** (`locationId`) existe **solo aquí**; en High no se agrega nada | High tiene una sola caja y 78 sesiones históricas sin solapes; Zoom tiene 3 sedes |
| 2026-09-18 | **Meta / WhatsApp se deja para el final** del montaje | no hay afán con las aprobaciones. El dominio sí hay que decidirlo antes, porque la URL del botón "Ver detalle" se quema dentro de la plantilla |
| 2026-09-18 | **Tres bases de datos separadas**: producción, staging y local (Docker) | High comparte base entre dev y staging, lo que obliga a migraciones idempotentes y hace que un `db:reset` local borre lo de QA. El fork es el momento de no heredarlo |
| 2026-09-18 | El repositorio se llama `zoom-crm`; el proyecto de Railway también | — |
| 2026-09-27 | **Sedes**: locales `104`, `119`, `125` más una **Matriz** (contabilidad). Clientes, proveedores, productos, insumos **y su stock** son comunes; COT, OP, OT, OPROD, OG, CP y caja son de cada sede; la Matriz tiene sus propias CP y OG | respuestas del cliente tras la reunión de sedes. Detalle en [docs/PLAN_SEDES.md](./docs/PLAN_SEDES.md) |
| 2026-09-27 | Numeración **por sede y sin año**: `125-OP-0001`, contador que nunca se reinicia | cada sede lleva su numeración. Diverge de High (`OP-2026-0001`): los cherry-picks que toquen `consecutives` van a chocar |
| 2026-09-27 | **Sin abonos cruzados**; ~~la caja matriz es solo un reporte~~ (reemplazado el mismo día: ver fila de la Matriz); la venta cuenta para la sede donde se hace; todo lo aprueba `admin` | respuestas del cliente |
| 2026-09-27 | **Producción sale con sedes**: la fase 10 va antes de crear producción | con 3 locales operando, sin sedes compartirían caja y numeración. Invierte el orden de [PLAN_FORK_ZOOM.md](./docs/PLAN_FORK_ZOOM.md) |
| 2026-09-27 | DTF por sede; teléfono por sede en los PDF, correo común `promocionaleszoom@gmail.com` | respuestas del cliente |
| 2026-09-27 | Empleados por sede; consumo de insumos registrado por sede; precios, áreas de producción, columnas del kanban y metas (por asesor) comunes; co-propiedad de clientes entre sedes como hoy | respuestas del cliente |
| 2026-09-27 | Una OP, COT u OT de otra sede se puede **consultar en solo lectura** ("modo consulta"), sin mezclar sedes en los listados. La asistencia se anota en la sede donde estuvo la persona | respuestas del cliente. Diseño en [docs/PLAN_SEDES.md §8](./docs/PLAN_SEDES.md#8-consultar-una-op-cot-u-ot-de-otra-sede) |
| 2026-09-27 | Sin traslado de documentos entre sedes; prospectos y nómina comunes; notificaciones de operación solo a la sede del documento; un solo número de WhatsApp | respuestas del cliente |
| 2026-09-27 | **Rol admin**: uno solo, no vende, opera en todas las sedes sin restricción, vista "Todas" agrupada por sede, trazabilidad de sus acciones directas. Crear sedes queda en un rol oculto `soporte` con permisos reservados que el admin no puede otorgarse | respuestas del cliente y recomendación. Detalle en [docs/PLAN_SEDES.md §6](./docs/PLAN_SEDES.md#6-el-rol-administrador) |
| 2026-09-27 | Dashboard: ventas = valor de las OP creadas (se muestra también el recaudo); gastos = lo pagado; los gastos de la Matriz y la nómina van aparte, sin repartir. Admin: Oscar Herrera (Gerencia), motivo obligatorio en sus acciones directas, solo notificaciones de aprobación | respuestas del cliente |
| 2026-09-27 | **Matriz**: tipo `HEADQUARTERS`, código `MAT`, **caja propia** (puede pagar en efectivo), gastos que sirven a las 3 sedes, la compra de insumos se asigna a una sede o a la Matriz, nómina como en High. **Cierre general diario** de las 4 cajas dentro del sistema, con bloqueo del día | respuestas del cliente. Detalle en [docs/PLAN_SEDES.md §14](./docs/PLAN_SEDES.md#14-la-matriz) |
| 2026-09-27 | **Saldo a favor** usable en cualquier sede; cuenta en la sede donde se aplica (en el dashboard, en línea aparte del recaudo) | respuesta del cliente |
| 2026-09-27 | Técnicas: sede activa por header `X-Location-Id` + `AsyncLocalStorage` + extensión de Prisma que filtra; sala de socket.io por sede; las sedes las crea la migración; staging se reinicia en vez de asignarle sede a los datos viejos | aprobadas. Detalle en [docs/PLAN_SEDES.md §15](./docs/PLAN_SEDES.md#15-decisiones-técnicas) |
| 2026-09-27 | Plan de sedes organizado en **fases 0 a 8** | [docs/PLAN_SEDES.md §12](./docs/PLAN_SEDES.md#12-fases-de-implementación) |

### Restricciones heredadas que no se pueden tocar

- **El rol admin debe llamarse exactamente `admin`**: se busca por nombre en 24 archivos.
- **El ambiente de Railway debe llamarse literalmente `staging`**: `backend/railway.toml` tiene `[environments.staging.deploy]`. Si no coincide, el backend arranca como producción y los logs de QA se mezclan con los de producción en Grafana.
- **Una sola réplica del backend**: 9 crons se duplicarían y socket.io no tiene adapter compartido.
- **No correr `npm audit fix` en el backend**: deja dos copias de `cron` y Prisma inconsistente. El frontend sí lo tolera.
- Los nombres de las plantillas de WhatsApp están quemados en `backend/src/modules/whatsapp/whatsapp.service.ts:277-292`. Crearlas en Meta con esos mismos nombres evita tocar código.

---

## 3. Decisiones abiertas

- [x] ~~Dominio definitivo~~ → **`zoompublicidadcrm.com`** (confirmado 2026-09-20, registrado en Name.com). Hosts: apex y `www` al frontend, `api.` al backend, `pruebas.` y `api.pruebas.` a staging. Comprado **dentro de Railway**, que gestiona la zona DNS: crea los registros solo al agregar cada dominio a un servicio, apex incluido, así que no hace falta Cloudflare. La zona está vacía y lo que hoy responde es el parking de name.com, no un comodín.
- [ ] **WhatsApp en staging**: app y número de prueba propios, o sin webhook en QA (aprobaciones desde la UI). El webhook se configura por app de Meta y un WABA se suscribe a una sola app, así que un mismo número no puede servir a producción y a pruebas a la vez.
- [ ] **Workspace de Railway**: se construye dentro del workspace actual y se transfiere ("Transfer Project") cuando entre en producción.
- [x] ~~Alcance del inventario entre sedes~~ → **compartido**: un solo stock por insumo para las 3 sedes; cada local produce lo suyo (2026-09-27). Lo que sigue abierto sobre sedes vive en [docs/PLAN_SEDES.md §13](./docs/PLAN_SEDES.md#13-preguntas-abiertas).

---

## 4. Bitácora de divergencias

Formato: fecha · qué cambió · por qué. Los cherry-pick traídos de High se anotan con el `sha` de origen.

| Fecha | Cambio | Detalle |
|---|---|---|
| 2026-09-18 | Fork creado | clon con historia desde `fork-zoom-2026-09`; `origin` → zoom-crm, `upstream` → High (push deshabilitado) |
| 2026-09-22 | **Cherry-pick de High** `4d44a66` → `b7adaea` | fix(credit-balance): permitir usar el saldo a favor de OPs anuladas |
| 2026-09-22 | **Cherry-pick de High** `26a9ca6` → `6451f52` | feat(orders): al anular, lo pagado que no retiene la empresa queda como saldo a favor. Trae la migración `20260922000000_status_change_request_retained_amount` (columna nullable, idempotente; su comentario dice que dev y staging comparten base, cierto en High pero no aquí — se deja igual para que el commit sea idéntico). Sin conflictos; tests afectados verdes: 373 backend, 132 frontend |
| 2026-09-22 | Logos y favicon de Zoom | `logo-dark.webp` es el logo original (texto negro) y lo usan **7 generadores de PDF**, que van sobre papel blanco. `logo.png` es el de la interfaz oscura (login y sidebar): se generó invirtiendo los píxeles acromáticos del original para que el texto quede blanco, protegiendo el interior del camaleón con un relleno de huecos para no perderle el ojo ni la boca. El favicon es el camaleón recortado a 256×256 con fondo transparente |
| 2026-09-23 | Paleta **Camaleón sobria** (tema oscuro) | reemplaza el cian `#2EB0C4` y el índigo de High. Primario lima `#A3D33C` (texto oscuro encima, el blanco no se lee), secundario azul `#2EA7E0`, superficies gris carbón casi neutras (`#0E0F0E` / `#161816`), bordes blancos al 7–8 %, sin brillos. El lima queda solo para acciones, estado activo y foco; enlaces y números de orden van en azul. Se eligió entre 4 propuestas (artifact "Paletas Zoom CRM"); una primera versión con el lima también en fondos, filas y bordes quedó "demasiado verde". **Portabilidad**: los nombres de las exportaciones de `theme/colors.ts` (`neonColors`, `glow.cyan`, `vividPurple`…) se conservan con valores nuevos, así que un cherry-pick que solo *use* tokens entra limpio; los que toquen colores quemados en componentes (~35 archivos, entre ellos `DataTable/styles.ts`, `Topbar.tsx`, `DashboardPage.tsx`, el diagrama de trazabilidad) pueden chocar. Tipos de documento con color fijo en todas partes: COT azul, OP lima, OT naranja, OG rojo. El modo claro usa `#5E8A12` como primario y no se revisó a fondo |
| 2026-09-23 | **Cherry-pick de High** `8ffd0cb` → `368bed3` | feat(notifications): al hacer clic en una notificación se abre el detalle de su entidad raíz (OP, COT, OG, CP, cliente, sesión de caja, insumos) — endpoint nuevo `GET /notifications/:id/target` que sigue la solicitud hasta la entidad, y hook `useNotificationNavigation` usado en la campana y en la página de notificaciones. Sin migraciones ni permisos nuevos. Sin conflictos; tests verdes: 36 de notificaciones en backend, 511 frontend; `tsc` limpio en ambos |
| 2026-09-23 | PDF: paleta Camaleón y **fuga de datos de contacto de High** | `PDF_COLORS` pasa a la paleta adaptada a papel blanco: barra lima y negra junto al logo, encabezados de tabla gris carbón, filas alternas gris claro, rótulos en verde oscuro `#4A6E0C` y enlaces en azul `#1B7FB0` (el lima nunca va como texto: sobre blanco no se lee). Los 4 `generate*Pdf.ts` dejan de quemar colores y usan `PDF_COLORS`. Además, esos 4 generadores **imprimían bajo el logo la dirección, los teléfonos y el email reales de High** (literales propios, aparte de `COMPANY_INFO`), y eso ya estaba en staging: ahora leen `COMPANY_INFO`, que muestra `PENDIENTE` hasta tener los datos de Zoom. La lista de servicios bajo el encabezado sigue siendo la de High |
| 2026-09-25 | Importación de catálogos de High | `scripts/export-high-catalog.sh` exporta de High (solo lectura) 11 catálogos a JSON en `prisma/data/high-catalog/` (ignorado por git), referenciando padres por nombre; `npm run prisma:import:high` los carga en una transacción, por clave natural normalizada, fusionando los duplicados de High (p. ej. los «Producción» repetidos) y sin sobrescribir lo que Zoom ya tenga. Stock de insumos en 0. Proveedores con el criterio de `normalize.util`. Uso en `backend/scripts/README.md` |
| 2026-09-27 | **Cherry-pick de High** `9af43d6` → `c75cce2` | fix(payment-edit): la edición de pago aprobada anula el movimiento de caja si el pago deja de ser dinero (por ejemplo, de transferencia a saldo a favor); aprobación y edición directa usan `syncPaymentCashMovement()`. Sin migraciones ni permisos nuevos. Trae `scripts/void-non-cash-payment-movements.ts`, que en Zoom no hace falta correr: no hay producción. Sin conflictos; `tsc` limpio en ambos, 2917 tests del backend y 511 del frontend en verde. Era el único commit pendiente de High: es la **última sincronización antes de la fase 2 de sedes** |
| 2026-09-27 | **Sedes, fase 1a** | Modelo `Location` / `UserLocation` y `users.default_location_id`; la migración `add_locations` crea las 4 sedes. Módulo `/sedes` (el de `/locations` es de High). Sede activa por header `X-Location-Id`, resuelta por `LocationContextInterceptor` y guardada en el mismo `AsyncLocalStorage` de la auditoría (`audit-context.ts` gana el campo `location`). Roles nuevos `soporte` (oculto, por encima de `admin`) y `contabilidad`; permiso reservado `manage_locations`. **`adminsistema` pasa a rol `soporte`**. Frontend: `locationStore` aparte de `authStore`, selector en el Topbar, `/sistema/sedes` fuera del menú y tarjeta de sedes en la ficha de usuario. **Portabilidad**: toca `auth.service`, `users.*`, `roles.*`, `permissions.*`, `role-privilege.service`, `seed.ts`, `sync-permissions.ts`, `axios.ts`, `authStore.ts` y `Topbar.tsx`, así que un cherry-pick de High sobre esos archivos puede chocar |
| 2026-09-27 | **Sedes, fase 1b: trazabilidad de las acciones directas** | Columna `is_direct` en `order_status_change_requests`, `order_edit_requests`, `advisor_change_requests`, `quote_restore_requests` y `payment_edit_approvals`. Lo que el admin (o quien puede aprobar) hace sin solicitud queda como solicitud aprobada: anular y entregar a crédito exigen motivo (`UpdateOrderStatusDto.reason`); **editar una OP que no está en borrador exige al admin abrir la edición con motivo** (`POST /orders/:id/edit-requests/direct`, ventana de 30 min) porque `CanEditOrderGuard` ya no lo deja pasar directo; el cambio de asesor directo exige motivo; la edición directa de un pago guarda el antes y el después. El historial de autorizaciones de la OP suma `STATUS_CHANGE`, `ADVISOR_CHANGE` y los descuentos aplicados sin solicitud. **Portabilidad**: toca `orders.service` (`updateStatus`, `updatePayment`, `getAuthorizationHistory`), `can-edit-order.guard`, `order-edit-requests`, `order-status-change-requests`, `OrderDetailPage`, `OrdersListPage` y `OrderAuthHistory` |
| 2026-09-28 | **Sedes, fase 2a — punto de no retorno con High** | Migración `location_scope`: `location_id` obligatorio en `quotes`, `orders`, `work_orders`, `production_orders`, `expense_orders`, `accounts_payable`, `cash_registers` y `dtf_records` (las filas previas al 125); opcional en `employees`, `attendance_records` e `inventory_movements`. `consecutives` pasa a llave `(type, location_id)` y se vacía. Extensión de Prisma `location-scope` (va antes de la de auditoría en `PrismaService`) que filtra por la sede activa; con `view_all_locations` solo filtra listados. Numeración `{sede}-{prefijo}-{número}` sin año; la CP deja `generateApNumber` y usa `ConsecutivesService`. `withoutLocationScope()` en el saldo a favor. **Portabilidad**: desde aquí, cualquier cherry-pick de High que cree o numere documentos (órdenes, cotizaciones, OT, OG, CP, DTF, caja) choca, porque en Zoom cada creación lleva sede y `generateNumber` recibe dos argumentos |
| 2026-09-28 | **Sedes, fase 2b** | `NotificationsService.notifyUsersWithPermission` recibe un `scope` (`orderId` o `locationId`) y avisa solo a los usuarios de esa sede y a quienes tienen `view_all_locations`; lo usan anticipos, edición de pagos, devoluciones, propiedad de cliente y descuentos. `WsEventsGateway` une a cada usuario a una sala por sede permitida (o a la de "todas") y emite según la OP del evento. `findDuplicates` de clientes devuelve la sede predeterminada del asesor. `DashboardRepository.getMonthlyData` filtra por sede con `getLocationScope()`. **Portabilidad**: toca `notifications.service`, `ws-events.gateway`, los 5 servicios de aprobación y `dashboard.repository` |
| 2026-09-28 | **Sedes, fase 3: caja por sede** | Migración `cash_register_per_sede` (una caja por sede; `SedesService.create` crea la de la sede nueva). La extensión `location-scope` filtra `CashSession` a través de `cashRegister` (`RELATION_SCOPED_MODELS`). `findActiveCashSessionForLocation(client, locationId)` reemplaza a `findActiveCashSession` (que se elimina) en pagos de OP, edición de pagos, devoluciones, pagos de CP y autorización de OG: el dinero entra a la caja de **la sede del documento**. `syncPaymentCashMovement` recibe `locationId`; `PendingCashEntriesService.flushInto` recibe la sede y solo vacía los pendientes de ella. El historial de sesiones filtra por día en hora de Bogotá. **Arreglo**: `withoutLocationScope()` ahora hace `await` dentro del contexto (las consultas de Prisma son perezosas y se ejecutaban fuera). **Portabilidad**: un cherry-pick de High que registre dinero en caja choca, porque `findActiveCashSession` ya no existe (a propósito: así no compila y obliga a elegir la sede) y `syncPaymentCashMovement` pide la sede |
| 2026-09-28 | **Sedes, fase 4a: modo consulta** | `findForView` y `lookupInOtherLocations` en `common/utils/location-consulta.ts`. El `GET :id` de órdenes, cotizaciones y OT pasa a `findOneForView` (con `read_other_locations`, un documento de otra sede llega con `accessMode: 'consulta'` y queda en `audit_logs` con acción `CONSULTA`); `findOne` sigue filtrado para todo lo que escribe. Endpoints nuevos `GET …/lookup?q=`. `ClientsRepository.findClientStats` trae OP y COT de todas las sedes a quien puede consultarlas. `RequestLocation.readOther`. Frontend: envolturas de ruta `*DetailRoute`, vistas `*ConsultaView`, `ConsultaBanner`, aviso `OtherSedesLookupHint` en los tres listados, ficha del cliente agrupada por sede. **Portabilidad**: los controladores de detalle ya no llaman `findOne`; el router apunta a las envolturas, así que un cherry-pick que toque esas rutas o esos `GET :id` choca |
| 2026-09-28 | **Sedes, fase 4b: vista "Todas" agrupada** | `meta.sumTotal` en los listados de órdenes y cotizaciones (un `aggregate` más por consulta). Frontend: el interceptor de axios ya no pisa un `X-Location-Id` puesto en la petición (`sedeRequestConfig`); `ordersApi.getAll`, `quotesApi.findAll` y `workOrdersApi.getAll` aceptan la sede; `SedeGroupedTable`, `SedeQuickSelector` y `RequireSedeGate` (en las rutas de crear OP, COT, OG, CP y DTF); el tablero de cotizaciones pinta un carril por sede en "Todas" (`useQuotesBoardColumn` recibe la sede). **Portabilidad**: toca `OrdersListPage`, `QuotesListPage`, `WorkOrdersListPage`, `QuoteKanbanBoard`, `QuoteKanbanColumn`, `useQuotesBoardColumn`, `axios.ts` y el router |
| 2026-09-20 | Guardián de `master` en el pre-push | GitHub solo protege ramas en repos privados con plan Pro, y `zoom-crm` es privado en Free: la protección del servidor quedó inactiva al volverlo privado. `frontend/.husky/pre-push` rechaza ahora el push directo a `master`. **Limitación**: el hook es un archivo versionado, así que vale el de la rama activa — estando en `master` no protege hasta que el guardián llegue allá con el primer merge. Salida de emergencia: `git push --no-verify` |
| 2026-09-20 | Repo pasado a **privado** | se creó público por error; 0 forks y 0 stars mientras lo estuvo. No hubo `.env` reales en la historia (solo `.env.example`), ni volcados de base rastreados |
| 2026-09-18 | Etiqueta de Loki `app` | `backoffice-backend` → **`zoom-backend`** en `backend/src/common/logger/logger.config.ts` (2 sitios). Sin esto, los logs de Zoom y los de High caen en el mismo stream de Grafana y no hay forma de separarlos |
| 2026-09-18 | Rebranding — **solo el nombre** | «High Solutions» → **«Zoom Publicidad CRM»** (nombre comercial confirmado por el cliente) en 14 archivos: título del navegador, Topbar, LoginForm, Sidebar, fallback de `VITE_APP_NAME`, página de mantenimiento, `pdfConstants.ts`, los **4 generadores de PDF**, los 2 mensajes de WhatsApp de OP y cotización, el ejemplo de `create-company.dto`, el ejemplo de `report-client-error.dto` y la empresa demo del seed |

### Pendientes de branding (marcados en el código con `TODO(zoom)`)

| Qué | Dónde | Estado |
|---|---|---|
| Dirección, ciudad, teléfonos, email | `frontend/src/utils/pdfConstants.ts` | valores `PENDIENTE: …` — **salen impresos en todos los PDF** |
| Lista de servicios del encabezado | los 4 `generate*Pdf.ts` | es la de High (Papelería empresarial, DTF textil, Bordados…) |
| Sitios web del pie de página | los 4 `generate*Pdf.ts` | `PENDIENTE: sitio web` |
| ~~Logos claro y oscuro~~ | `frontend/src/assets/logo.png`, `logo-dark.webp` | ✅ 2026-09-22 |
| ~~Favicon~~ | `frontend/public/favicon.png` | ✅ 2026-09-22 (el camaleón) |
| Dominio en comentarios | `cors-origins.util.ts`, `whatsapp.service.ts:419` | citan `crmhighsolutions.com`; se corrigen cuando exista el dominio |

Los marcadores `PENDIENTE` son deliberados: se ven en QA y evitan que un PDF de Zoom salga con la dirección de otra empresa. **Ninguno puede llegar a producción.**

> Hallazgo: el pie de los PDF **duplica** los datos de `pdfConstants.ts` con literales propios en cada uno de los 4 generadores. Al cargar los datos reales hay que tocar los cinco archivos, no solo el de constantes.

---

## 5. Hallazgos del arranque local (2026-09-18, verificados)

Base nueva en Postgres 17 (Docker, puerto 55432), sin datos de demo:

- **Las 124 migraciones aplican limpio** sobre base vacía; `prisma:drift` en 0 después.
- **Seed con `SEED_DEMO=false`**: 190 permisos, 4 roles, 1 usuario (`adminsistema`), 152 ciudades, 18 áreas de producción, 10 cargos, 14 unidades, 7 canales, 8 consecutivos. Cero clientes, productos, órdenes o cotizaciones.
- **El CLI de Prisma necesita `backend/.env`**, no `.env.development`: `prisma.config.ts` hace `import "dotenv/config"`, que solo carga `.env`. La aplicación NestJS sí lee `.env.<NODE_ENV>`. Hay que mantener el mismo `DATABASE_URL` en los dos.
- ⚠️ **Las variables de S3 son obligatorias para arrancar.** `StorageS3Service` lanza en el constructor si falta cualquiera, y el backend no levanta. En Railway, **el bucket tiene que existir y estar configurado antes del primer deploy del backend**, o el healthcheck falla y el despliegue se cae. WhatsApp, en cambio, degrada con un warning.
- Login verificado de punta a punta: `/health` 200, `POST /auth/login` 200 con rol `admin` y 190 permisos, y el panel carga en el navegador.

## 6. Punto de no retorno

El **primer commit que introduzca `locationId`** en las entidades del núcleo cierra la puerta a reconverger con High. A partir de ahí, traer un fix del núcleo deja de ser un cherry-pick limpio. Antes de ese commit, revisa que no quede nada del núcleo por arreglar en High: cada fix pendiente se va a pagar dos veces.
