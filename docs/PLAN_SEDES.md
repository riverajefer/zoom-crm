# Plan de sedes (fase 10)

> **Zoom sale a producción con las sedes** (decidido 2026-09-27). Esto invierte el orden del plan del fork: la fase 10 va **antes** de crear producción, y la aceptación funcional (fase 9) se hace con sedes.
>
> Plan vivo: se pule a medida que el cliente responde. Lo decidido pasa también a la tabla de decisiones de [DIVERGENCIA.md](../DIVERGENCIA.md). El marco general (por qué es el punto de no retorno con High) está en la fase 10 de [PLAN_FORK_ZOOM.md](./PLAN_FORK_ZOOM.md).

**Fuentes:** reunión con el cliente por Google Meet (apuntes de Gemini) y respuestas del cliente del 2026-09-27.

**Cómo leer este plan:** las **fases de implementación** están en §12. Las demás secciones son el diseño de referencia que cada fase cita: qué es de cada sede (§1–§5), el admin (§6), el dashboard (§7), el modo consulta (§8), los PDF (§9), los reportes (§10), los usuarios de prueba (§11), las preguntas abiertas (§13), la Matriz (§14) y las decisiones técnicas (§15).

---

## 1. Las sedes

Todas en **Bogotá**, barrio Ricaurte.

| Código | Dirección (sale en los PDF) | Teléfono |
|---|---|---|
| `104` | Cra 28 #10-86 Edificio Fénix (Local 104) | (+57) 321 201 6229 |
| `119` | Cra 28 #10-40 Centro Nacional de las Artes Gráficas Ricaurte (Local 119) | (+57) 314 474 9878 |
| `125` | Cra 28 #10-38 Interior 125 B | (+57) 300 368 0868 |
| Matriz | — (no es un local: es el espacio de contabilidad) | — |

Correo **común** a las tres sedes: `promocionaleszoom@gmail.com`.

La **Matriz** es un cuarto espacio administrado por contabilidad (Lina, Constanza). Tiene sus propias cuentas por pagar y gastos (por ejemplo, el contador que atiende a las 3 sedes, la nómina, los gastos de producción globales) y consolida los cierres de caja de los locales. Su detalle está en §14.

Se modela como **tabla `Location`**, no como enum: abrir otra sede es insertar una fila. Cada sede tiene además un **color propio**, que se usa en el selector, en los chips y en el banner de consulta (§8).

---

## 2. Qué es común y qué es de cada sede

| Común a todas | Propio de cada sede | Propio de la Matriz |
|---|---|---|
| Clientes (con co-propiedad entre asesores) y prospectos | Cotizaciones (COT) | Cuentas por pagar propias |
| Proveedores | Órdenes de pedido (OP) | Órdenes de gasto propias |
| Productos, categorías **y precios** | Órdenes de trabajo (OT) y de producción (OPROD): **cada local produce lo suyo** | Caja propia (caja menor) |
| Insumos **y su stock** | Caja registradora y sus sesiones | Cierre general diario de las 4 cajas |
| Áreas de producción, unidades, cargos, canales, tipos de gasto | Cuentas por pagar (CP) | |
| Columnas del tablero de cotizaciones | Órdenes de gasto (OG) | |
| Metas de ventas (son por asesor) | Registros DTF (textil y UV) | |
| Nómina (un solo proceso para todas) | | |
| Número de WhatsApp | | |
| | Empleados | |

Consecuencias en el modelo:

- `locationId` **obligatorio** en `Quote`, `Order`, `WorkOrder`, `ProductionOrder`, `ExpenseOrder`, `AccountPayable`, `CashRegister`, `DtfRecord`, `Employee` y `AttendanceRecord`.
- `locationId` en `InventoryMovement`, para saber **qué sede consumió cada insumo**. Los consumos lo toman de su OT u OPROD. Las entradas y los ajustes (que hoy se registran a mano, sin enlace a una OG o CP) toman la sede activa de quien los registra. El stock sigue siendo uno solo.
- Lo que cuelga de esos documentos **hereda la sede por la relación**, sin columna propia: ítems, pagos (`Payment` → `Order`), sesiones y movimientos de caja (`CashSession` → `CashRegister`), abonos a CP, solicitudes de aprobación.
- Una OP creada desde una COT toma la sede de la COT. Una OT u OPROD toma la de su OP.
- **No hay traslado de documentos entre sedes**: la sede de una COT, OP u OT no cambia después de creada.
- **Sin cambios**: `Prospect` (comunes), el módulo de nómina (común; cada empleado conserva su sede), `Product` (mismo precio en todas), `ProductionArea`, `QuoteKanbanColumn` (mismas columnas; cada sede ve solo sus tarjetas porque la COT tiene sede), `SalesGoal` (sigue por asesor).

---

## 3. Numeración por sede

Formato: **`{sede}-{prefijo}-{número}`**, por ejemplo `125-OP-0001`.

- **Sin año**, a diferencia de High (`OP-2026-0001`). El contador **nunca se reinicia**: crece indefinidamente.
- El número se rellena a 4 dígitos como mínimo y sigue creciendo sin tope (`125-OP-9999` → `125-OP-10000`).
- Hay un contador por (tipo, sede).

Documentos afectados: COT, OP, OT, OPROD, OG, CP, RC (recibo de caja; va por sede porque la caja es de la sede) y DTF (`125-DTF-UV-0001`, `125-DTF-TEXTIL-0001`).

Cambios técnicos:

- `Consecutive`: se quita `year` del cálculo y la unicidad pasa de `type` a `(type, locationId)`.
- `ConsecutivesRepository.getNextNumberFromSource` calcula el máximo sobre la tabla real con el patrón `{prefijo}-{año}-%`. Pasa a usar `{sede}-{prefijo}-%`, y el máximo tiene que salir **numérico, no lexicográfico**: como el número crece sin tope, `10000` < `9999` si se compara como texto.
- **Las CP no usan `ConsecutivesService`**: tienen su propio `generateApNumber()` (`CP-{año}-001`, relleno a 3). Se unifica dentro del servicio.
- Producción arranca con la base vacía, así que no hay números viejos que migrar. En staging conviven los de formato High; no importa.
- ⚠️ **Portabilidad**: este cambio reescribe `consecutives.*`, así que cualquier cherry-pick de High que toque consecutivos va a chocar.

---

## 4. Caja

- **Una caja por local**, con sus sesiones de apertura y cierre como hoy. Un pago cae en la caja de la sede activa: `findActiveCashSession()` ya acepta `cashRegisterId`.
- **No hay abonos cruzados**: un pago a una OP solo se registra desde la sede de la OP. Se **valida en el backend** (rechazo con mensaje claro), no solo se oculta en la UI.
- Por la misma regla, **reembolsos y anticipos** salen o entran por la caja de la sede del documento.
- **Saldo a favor: la excepción.** Un cliente puede usar su saldo a favor **en cualquier sede** (decidido 2026-09-27). Aplicarlo no mueve efectivo (es un pago con medio `CREDIT_BALANCE`), así que no toca la caja de ninguna de las dos sedes. En los reportes cuenta **en la sede donde se aplica**.
- **Día de una sesión**: una sesión pertenece al día en que se abrió, en hora de Bogotá (el servidor corre en UTC). Es la regla que usan el cierre general y el dashboard.
- **La Matriz tiene su propia caja** (caja menor), porque puede pagar en efectivo. Funciona igual que la de un local.
- **Cierre general diario**: contabilidad consolida y cierra el día de las 4 cajas en el sistema (§14). No hay traslados de efectivo entre cajas.

---

## 5. Usuarios, sede activa y permisos

- Cada usuario tiene una **sede predeterminada** y una lista de **sedes permitidas** (tabla `UserLocation`).
- Al iniciar sesión, un usuario con una sola sede entra directo. Si tiene varias, entra a la predeterminada y puede cambiar desde el Topbar. Esto cubre el caso del personal del 125 que apoya en el 119 a la hora del almuerzo o por ausencias.
- La sede activa viaja en cada request y un **guard central** valida que el usuario la tenga permitida. El filtrado es central, no con `if` repartidos por los servicios. Cómo se implementa: §15.1.
- Admin y contabilidad pueden ver **todas las sedes** (opción "Todas" en el selector) para reportes y consolidados. Es un permiso (`view_all_locations`), no un nombre de rol.
- **La venta cuenta para la sede donde se hizo**: la OP queda con la sede activa del asesor en ese momento, y suma en las ventas de esa sede y en las del asesor. La meta es del asesor, sin importar la sede.
- **Aprobaciones**: todo lo aprueba el rol `admin`. No hay jefe de sede, así que los flujos de aprobación actuales no cambian.
- **Empleados**: cada uno pertenece a una sede (`Employee.locationId`), que es la de su nómina. Esa sede es distinta de las *sedes permitidas* del usuario: quien apoya en el 119 sigue siendo empleado del 125.
- **Asistencia**: se anota **dónde estuvo** la persona (`AttendanceRecord.locationId`, tomado de la sede activa al marcar entrada). Hoy hay un registro por día con entrada y salida, así que un apoyo corto (el almuerzo) no cambia la sede del día. Quien apoya en el 119 marca en el 119, pero su nómina sigue en el 125.

### Notificaciones

- **Las de operación** (una OP que cambia de estado, una OT lista, un pago registrado) llegan **solo a los usuarios de la sede del documento**.
- **Las de aprobación** siguen llegando al admin, de todas las sedes, y el mensaje dice de qué sede es la solicitud.
- **WhatsApp**: un solo número para las 3 sedes. Las plantillas deberían incluir el código de sede del documento.

### Clientes entre sedes

Los clientes son comunes y ya existe la detección de duplicados (`GET /clients/check-duplicate`, `?force=true`). Si un asesor del 119 atiende a un cliente de un asesor del 125, **se usa la co-propiedad tal como funciona hoy** (`client-advisor-requests`). El único cambio es **mostrar en la alerta la sede y el asesor** del cliente existente.

---

## 6. El rol administrador

### Decisiones (2026-09-27)

- **Un solo admin**, y **no vende**: no tiene clientes, metas ni aparece como asesor.
- **Opera en cualquier sede sin restricción.** No tiene sede activa que lo limite y nunca ve el modo consulta: abre cualquier documento con todas sus acciones.
- **Tiene la vista "Todas las sedes"**, pero sin mezclarlas (§6.2).
- **Trazabilidad** de todo lo que hace directo, con **motivo obligatorio** en lo sensible (§6.3).
- **Notificaciones**: solo las de aprobación, de todas las sedes. Las de operación no le llegan.
- **Quién es**: Oscar Herrera (Gerencia). Tiene su propio usuario con rol `admin`, lo crea soporte en producción y él define su contraseña.
- **Administra** la asignación de usuarios a sedes y mueve usuarios y empleados entre sedes, además de lo que ya hace hoy.
- **Crear sedes no es del admin**: el flujo existe completo en el backend, pero está oculto en el frontend y solo lo usa soporte (§6.4).

### 6.1 Recomendación: un admin de negocio y un rol oculto de soporte

Hoy "admin" mezcla dos cosas: **el dueño del negocio** (aprueba, ve todo, decide) y **quien mantiene el sistema** (usuarios, roles, permisos, configuración). La recomendación es separarlas en dos roles, no crear dos niveles de admin:

| Rol | Quién | Qué puede |
|---|---|---|
| `admin` | La persona del cliente que administra Zoom | Todo lo del negocio: aprobaciones, todas las sedes, usuarios y su asignación a sedes, reportes y el dashboard consolidado |
| `soporte` (oculto) | Jefferson | Lo del admin, más los **permisos reservados**: crear y editar sedes, y lo técnico que no debe tocar el cliente |

Por qué así:

- **Las aprobaciones siguen yendo a quien corresponde.** El sistema reconoce al aprobador por el nombre `admin`, así que `soporte` no recibe los WhatsApp de aprobación ni aparece en la bandeja.
- **Cada acción tiene un nombre detrás.** Hoy `adminsistema` es una cuenta genérica. Con la trazabilidad que pide el cliente, el admin del cliente tiene que tener **su propio usuario**, y `adminsistema` pasa a ser la cuenta de soporte.
- **Un segundo nivel de negocio** (por ejemplo, un "gerente" que aprueba menos) **no hace falta hoy**: hay un solo admin. Si aparece, es un rol con permisos más, sin tocar código.

**Permisos reservados**: el admin tiene todos los permisos, y además puede editar roles sin restricción (`RolePrivilegeService`). Si `manage_locations` fuera un permiso normal, el admin podría dárselo a sí mismo. Por eso los reservados:

- no aparecen en la pantalla de roles ni de permisos;
- se rechazan si alguien intenta asignarlos por la API;
- solo los asigna el seed o un script al rol `soporte`;
- el seed deja de dárselos a `admin` ("todos los permisos" pasa a ser "todos menos los reservados").

### 6.2 La vista "Todas las sedes"

La regla de no mezclar se mantiene: **una sola tabla, agrupada por sede**.

- **Encabezado por grupo**: color de la sede, nombre, cantidad de documentos y subtotal (por ejemplo, "Local 119 · 48 OP · $ 12.400.000"). Cada grupo se puede plegar.
- **Filas limitadas por grupo**: cada sede muestra sus primeras 10 filas y un enlace "Ver las 48 del Local 119", que filtra la tabla a esa sede. Así ninguna sede tapa a las otras y no hace falta paginar entre grupos.
- **El orden y los filtros se aplican dentro de cada grupo**: ordenar por fecha ordena cada sede por separado, nunca intercala filas de sedes distintas.
- **Selector rápido** arriba de la tabla: `Todas · 104 · 119 · 125 · Matriz`, para saltar a una sola sede sin pasar por el Topbar.
- **Tablero de cotizaciones**: las mismas columnas, con **una fila (carril) por sede**.
- **Crear un documento** desde "Todas" pide primero la sede ("¿En qué sede se crea?"), porque todo documento nace en una.
- **Un pago del admin** entra en la caja de la sede del documento, y esa caja tiene que tener una sesión abierta.

### 6.3 Trazabilidad de lo que el admin hace directo

`audit_logs` ya registra automáticamente cada escritura (antes y después), pero eso sirve para una investigación, no para el día a día. Lo que falta es que **lo que el admin hace sin solicitud se vea igual que lo que se aprueba**:

- Cuando el admin edita una OP, restaura una COT, cambia un asesor o anula un movimiento de caja directamente, se crea **la misma solicitud que crearía otro usuario, ya aprobada**, con `requestedBy = approvedBy = admin` y la marca `direct: true`.
- Esa solicitud aparece en el historial de autorizaciones del documento (`OrderAuthHistory` y sus pares) como *"Hecho directamente por el admin"*.
- **Motivo obligatorio** (decidido) en las acciones directas sensibles: anular un pago, aplicar un descuento, restaurar una COT, cambiar un asesor, editar una OP ya abonada. Es el mismo campo que se le exige a quien solicita.

### 6.4 Crear sedes (solo soporte)

- Backend completo: `POST/PATCH /branches` (o el nombre final; `/locations` ya lo usa el módulo de departamentos y ciudades), con código, nombre, dirección, teléfono, color y activa o inactiva. Protegido por el permiso reservado `manage_locations`.
- Frontend: una página **fuera del menú**, a la que se entra por URL directa y solo con ese permiso.
- Crear una sede también crea su caja y deja listos sus consecutivos.

### 6.5 Mover usuarios y empleados entre sedes (admin)

- En la ficha del usuario: la sede predeterminada y las sedes permitidas.
- En la ficha del empleado: su sede. Como la nómina es común, cambiar la sede no parte la nómina. Los registros de asistencia viejos conservan la sede donde se marcaron.
- Cada cambio queda en `audit_logs`, y en la ficha se muestra el historial de sedes.

---

## 7. Dashboard consolidado por sede (admin)

**Objetivo:** ver y comparar lo que **vendió** y lo que **gastó** cada sede en un periodo.

### Estructura

1. **Filtro de periodo** arriba: hoy, esta semana, este mes, un rango, con **comparación contra el periodo anterior** (por ejemplo, "+12 % frente a agosto").
2. **Tarjetas de resumen** (el total de la empresa), cada una con una barra dividida por sede:
   - Ventas · Recaudo · Gastos · Resultado (recaudo − gastos) · Cartera por cobrar.
3. **Tabla comparativa**: una columna por sede (104, 119, 125), más una columna **Matriz** solo para gastos y una columna **Total**. En las filas: ventas, número de OP, ticket promedio, conversión de COT a OP, recaudo, gastos (OG y CP), resultado y cartera.
4. **Tendencia**: ventas y gastos por semana, **un gráfico pequeño por sede** con la misma escala, en vez de seis líneas en un solo gráfico. Así se compara la forma sin enredarse.
5. **Gastos por tipo**: barras apiladas por sede, con los tipos de gasto que ya existen.
6. **Consumo de insumos por sede**: sale de `InventoryMovement.locationId`.

Cada cifra lleva al listado que la explica, ya filtrado por esa sede y ese periodo.

### Definiciones (2026-09-27)

| Cifra | Qué es |
|---|---|
| **Ventas** | Valor total de las **OP creadas** en el periodo, en la sede donde se crearon. Se excluyen las OP anuladas. |
| **Recaudo** | Lo **efectivamente cobrado** en el periodo (pagos a OP). Se muestra junto a Ventas: el cliente pidió ver las dos. |
| **Saldo a favor aplicado** | Cuenta en la sede **donde se aplica**. Se muestra en una línea aparte del recaudo en efectivo y bancos, porque esa plata ya se había cobrado antes (en la OP que generó el saldo). Sumarla al recaudo contaría dos veces lo mismo en el total de la empresa. |
| **Gastos** | Lo **efectivamente pagado** en el periodo: pagos de OG y abonos a CP. No cuenta lo causado ni lo aprobado sin pagar. |
| **Resultado** | Recaudo − Gastos de la sede. |
| **Gastos de la Matriz** | Se muestran **aparte**, en su propia columna. **No se reparten** entre las sedes. |
| **Nómina** | Es gasto **de la Matriz**, aunque cada empleado tenga sede. Sale de las OG y CP de la Matriz con tipo de gasto *Nómina* (§14). |

El total de la empresa es la suma de las 3 sedes más la columna Matriz.

---

## 8. Consultar una OP, COT u OT de otra sede

Aplica a **OP, COT y OT** (decidido 2026-09-27). Los ejemplos usan OP; COT y OT funcionan igual.

**Caso:** un cliente llama al 125 preguntando por un pedido que hizo en el 119. Quien atiende tiene que poder ver el estado, la fecha de entrega y el saldo, **sin cambiar de sede y sin que se mezclen las sedes** en sus listados.

### Principios

El modo consulta es para los usuarios de sede. **El admin no lo ve nunca**: opera en cualquier sede con todas las acciones (§6).

1. **Los listados nunca mezclan sedes.** La lista de OP, el tablero y el dashboard muestran solo la sede activa. Lo de otra sede aparece únicamente cuando se busca a propósito.
2. **Otra sede = solo lectura, siempre.** Una OP ajena se abre en **modo consulta**: se ve, pero no se toca. Quien necesite operarla cambia de sede (si la tiene permitida) o remite al cliente al local.
3. **Siempre se sabe de qué sede es lo que se está viendo**: por el color de la sede, el chip con el código y un banner fijo.

### Puntos de entrada

| Dónde | Qué pasa |
|---|---|
| **Detalle del cliente** (el más natural cuando el cliente llama) | Los clientes son comunes, así que su ficha muestra "Pedidos del cliente" **agrupados por sede**: primero la sede activa y debajo una sección por cada otra sede, con su color. Las de otra sede se abren en modo consulta. |
| **Buscador de la lista de OP** | Busca en la sede activa. Si no hay resultados y el texto parece un número de otra sede (`119-OP-…`) o coincide con OP de otras sedes, aparece debajo de la tabla: *"No está en el Local 125 · Hay 2 resultados en el Local 119 → Ver en modo consulta"*. No se agregan filas a la tabla. |
| **Enlace directo** (notificación, URL compartida) | En vez de un 403, abre en modo consulta. |

Como el número de la OP lleva la sede (`119-OP-0042`), un número dictado por teléfono ya dice dónde buscar.

### Cómo se ve el modo consulta

- **Banner fijo** arriba del detalle, con el color de la sede dueña: *"OP del Local 119 · Solo consulta — tu sede activa es el 125"*, con el **teléfono del 119** para remitir al cliente.
- Si el usuario **tiene permitido el 119**, el banner ofrece **"Cambiar al Local 119"**. Cambia la sede activa y recarga la OP ya con todas las acciones. Si no la tiene, ese botón no aparece.
- Se muestran: estado y seguimiento (timeline), ítems, fecha de entrega, total, abonado y saldo, asesor, y la COT, OT y OPROD relacionadas (que también se abren en modo consulta).
- Se **ocultan** (no solo se deshabilitan) todas las acciones: registrar pago, cambiar estado, editar, anular, descuentos, reembolsos, crear OT, solicitudes. Así el usuario no intenta algo que no puede hacer.
- **PDF**: se permite descargarlo, y sale con la dirección y el teléfono del 119.

### Backend

- `GET /orders/:id` (y `GET /quotes/:id`, `GET /work-orders/:id`) responde para un documento de otra sede si el usuario tiene el permiso nuevo **`read_other_locations`**. La respuesta incluye `accessMode: 'consulta'` y la sede dueña (código, color, teléfono).
- **Todo endpoint que modifica** exige que la OP sea de la sede activa, validado en el guard central. Aunque la UI se equivoque, el backend rechaza.
- Búsqueda en otras sedes: `GET /orders/lookup?q=` (y su par en COT y OT) devuelve los resultados agrupados por sede y solo los campos del resumen (número, cliente, estado, fecha, saldo). Mismo permiso.
- Cada consulta a una OP ajena se registra en `AuditLog`.

### Alcance

OP, COT y OT. El modo consulta se construye como un componente genérico (banner y ocultado de acciones) que usan los tres detalles. La ficha del cliente muestra COT y OP agrupadas por sede. Las OT se alcanzan desde su OP.

Mockup para mostrar al cliente: artifact "Modo consulta entre sedes".

---

## 9. PDF

- La dirección y el teléfono impresos son **los de la sede del documento** (§1), no fijos. Se guardan en `Location` (en la base, no en `pdfConstants.ts`), y los 4 `generate*Pdf.ts` los reciben con el documento.
- `COMPANY_INFO` conserva lo que es de toda la empresa: nombre, logo, ciudad (Bogotá) y el correo común `promocionaleszoom@gmail.com`.

---

## 10. Reportes

- Los listados, el dashboard y los reportes de ventas se filtran por la sede activa. Con "Todas", se muestran consolidados con el desglose por sede.
- **Consumo de insumos por sede**: sale de `InventoryMovement.locationId`.
- **Metas**: el avance de cada asesor suma sus ventas de todas las sedes.
- **Dashboard consolidado por sede** para el admin: §7.
- **Reporte de cierres consolidado (Matriz)**: §14.

---

## 11. Usuarios de prueba (staging)

Estamos en fase de pruebas, así que estos usuarios son inventados y solo se crean con `SEED_DEMO=true`. Todos usan la contraseña de demo del seed. Usan los roles que ya existen (`admin`, `user`, `caja`) más dos nuevos: `soporte` (§6.1) y `contabilidad` (§14).

| Username | Rol | Sede predeterminada | Sedes permitidas | Para probar |
|---|---|---|---|---|
| `adminsistema` | `soporte` | 125 | todas + "Todas" | crear sedes (página oculta), permisos reservados |
| `admin.zoom` | `admin` | — (sin restricción) | todas + "Todas" | aprobaciones, acciones directas con trazabilidad, vista agrupada, dashboard |
| `contabilidad.lina` | `contabilidad` | Matriz | todas + "Todas" | cajas de todas las sedes, cierre general, CP y OG de la Matriz |
| `asesor.104` | `user` | 104 | 104 | venta y consulta de OP de otra sede sin poder cambiar |
| `asesor.119` | `user` | 119 | 119 | co-propiedad de un cliente del 125 |
| `asesor.125` | `user` | 125 | 125 | |
| `asesor.apoyo` | `user` | 125 | 125, 119 | cambio de sede y "Cambiar al Local 119" desde el modo consulta |
| `caja.104` | `caja` | 104 | 104 | caja propia, rechazo de abono cruzado |
| `caja.119` | `caja` | 119 | 119 | |
| `caja.125` | `caja` | 125 | 125 | |
| `produccion.119` | `user` | 119 | 119 | OT/OPROD y consumo de insumos por sede |

Cada uno queda también como `Employee` de su sede predeterminada (menos `adminsistema` y `admin.zoom`).

---

## 12. Fases de implementación

**Todo esto va antes de producción.** Se desarrolla en `develop`, se prueba en staging con los usuarios del §11, y la aceptación funcional del plan del fork (fase 9) se repite con sedes. Solo después se crea producción (fase 8 del fork), que arranca con la base vacía y ya con sedes.

| Fase | Qué entrega | Depende de | Tamaño | Bloqueada por |
|---|---|---|---|---|
| 0 | Preparación: staging limpio, última sincronización con High | — | S | — |
| 1 | Sedes, usuarios, roles y sede activa | 0 | M | — |
| 2 | Sede en los documentos y numeración nueva (**punto de no retorno**) | 1 | L | — |
| 3 | Caja por sede | 2 | M | — |
| 4 | Experiencia multisede: modo consulta y vista "Todas" | 2 | M | — |
| 5 | PDF por sede | 2 | S | — |
| 6 | Dashboard consolidado y reportes | 3 | M | — |
| 7 | Matriz y cierre general diario | 3 | M | preguntas del cierre general (§14) |
| 8 | Aceptación en staging y salida a producción | 1–7 | M | — |

Las fases 3, 4 y 5 son independientes entre sí y pueden ir en cualquier orden después de la 2.

### Fase 0 · Preparación ✅

- ✅ **Qué base es la de staging** (2026-09-27): `mainline.proxy.rlwy.net:55766`, la que aparecía comentada en `backend/.env` y `.env.development`, es la **Postgres de staging de High** (proyecto "High solutions", confirmado con el CLI de Railway). La de staging de Zoom (proyecto "ZOMM-CRM") **no tiene proxy TCP público**: solo se llega a ella por la red interna de Railway. Nunca se escribió en la de High: la corrida del importador contra ella fue una simulación con rollback.
- **Reiniciar la base de staging de Zoom** (§15.3): se hace **al desplegar la fase 1**, no antes, porque esa es la primera migración que la necesita limpia. Como no tiene acceso público, se hace desde dentro de Railway (`railway ssh` al servicio `zoom-backend`, o un proxy TCP temporal que se apaga al terminar). Requiere confirmación explícita en el momento.
- ✅ **Última sincronización con High** (2026-09-27): solo faltaba `9af43d6`, traído como `c75cce2`. De aquí en adelante, los cherry-picks que toquen documentos, consecutivos o caja van a chocar.
- ✅ **Tag `pre-sedes`** en `develop`, como punto de referencia antes del cambio irreversible.
- ✅ **Línea base** (2026-09-27): `tsc` limpio en ambos, 2917 tests del backend (189 suites) y 511 del frontend (61 archivos) en verde.

### Fase 1 · Sedes, usuarios, roles y sede activa

Todavía **no toca documentos**: al terminar, la app funciona como hoy, pero ya sabe quién está en qué sede.

- **Modelo**: `Location` (código, nombre, tipo `STORE` o `HEADQUARTERS`, dirección, teléfono, color, activa) y `UserLocation` (sedes permitidas y predeterminada). La **migración crea las 4 sedes** (§15.3).
- **Sede activa** (§15.1): header `X-Location-Id`, validación en el guard, contexto en `AsyncLocalStorage`. Todavía sin la extensión que filtra.
- **Frontend**: selector de sede en el Topbar (con "Todas" para quien tenga `view_all_locations`), entrada directa a la sede predeterminada al iniciar sesión, colores de sede.
- **Roles**: `soporte` y `contabilidad`, permisos reservados (§6.1) y permisos nuevos (`view_all_locations`, `read_other_locations`, `read_all_cash_sessions`, `perform_general_closing`, `manage_locations`). El seed deja de darle a `admin` los reservados.
- **Página oculta de sedes** para soporte (§6.4) y **asignación de usuarios a sedes** en la ficha de usuario, para el admin (§6.5).
- **Trazabilidad del admin** (§6.3): acciones directas registradas como solicitud aprobada, con motivo obligatorio. No depende de las sedes.
- **Seed**: usuarios de prueba del §11 con `SEED_DEMO=true`.

**Se acepta cuando**: cada usuario de prueba entra a su sede, `asesor.apoyo` cambia entre el 125 y el 119, `admin.zoom` ve "Todas", el admin no puede asignarse `manage_locations`, y una acción directa del admin aparece en el historial con su motivo.

### Fase 2 · Sede en los documentos y numeración nueva

**Punto de no retorno con High.** Los dos bloques salen juntos: un documento con sede y numeración vieja sería un estado intermedio sin sentido.

- **`locationId`** en las entidades del §2 (`Quote`, `Order`, `WorkOrder`, `ProductionOrder`, `ExpenseOrder`, `AccountPayable`, `CashRegister`, `DtfRecord`, `Employee`, `AttendanceRecord`) y en `InventoryMovement`.
- **Extensión de Prisma** que filtra y asigna la sede (§15.1), con sus salidas explícitas. **Revisar a mano cada `$queryRaw`**, con test.
- **Herencia de sede**: OP desde COT, OT y OPROD desde OP. Sin traslados.
- **Numeración** (§3): `{sede}-{prefijo}-{número}`, sin año, contador por (tipo, sede), máximo numérico. Las CP pasan a `ConsecutivesService`.
- **Reglas de dinero** (§4): rechazo de abonos cruzados en el backend; saldo a favor aplicable en cualquier sede.
- **Notificaciones** (§5): de operación solo a la sede, con una sala de socket.io por sede; las de aprobación al admin, con la sede en el mensaje. **Los 10 crons** recorren las sedes a propósito (§15.2).
- **Frontend**: listados, formularios y tablero de cotizaciones filtrados por la sede activa; el número con sede en todas partes.
- **Clientes**: la alerta de duplicado muestra la sede y el asesor del cliente existente.

**Se acepta cuando**: `asesor.104` y `asesor.125` no ven los documentos del otro; los números salen `104-OP-0001` y `125-OP-0001` en paralelo; un abono cruzado se rechaza; un saldo a favor del 119 se aplica en el 125; la notificación de una OP del 119 no le llega al 125.

### Fase 3 · Caja por sede

- Una caja por sede, más la de la Matriz (§4, §14). El pago cae en la sesión de la caja de la sede activa (`findActiveCashSession(cashRegisterId)`).
- Reembolsos y anticipos por la caja de la sede del documento.
- El día de una sesión es el de su apertura, en hora de Bogotá.
- Contabilidad ve las cajas de todas las sedes en solo lectura (`read_all_cash_sessions`).

**Se acepta cuando**: las 3 cajas abren a la vez sin cruzarse, cada una cierra con su propio saldo, y un pago del 119 nunca cae en la caja del 125.

### Fase 4 · Experiencia multisede

- **Modo consulta** de OP, COT y OT de otra sede (§8): banner, acciones ocultas, "Cambiar al Local X", `GET …/lookup`, registro en `AuditLog`.
- **Ficha del cliente** con COT y OP agrupadas por sede.
- **Vista "Todas" agrupada** para el admin (§6.2): grupos por sede, máximo 10 filas por grupo, selector rápido, tablero con un carril por sede, "¿En qué sede se crea?".

**Se acepta cuando**: se recorren las 3 pantallas del mockup "Modo consulta entre sedes" en la app real, y `admin.zoom` ve "Todas" agrupada sin filas intercaladas.

### Fase 5 · PDF por sede

- Dirección y teléfono de la sede del documento, leídos de `Location` (§9). `COMPANY_INFO` queda con lo común.

**Se acepta cuando**: una OP del 104 y una del 119 imprimen cada una su dirección y su teléfono.

### Fase 6 · Dashboard consolidado y reportes

- Dashboard del admin (§7) con las definiciones acordadas, incluido el saldo a favor aplicado en línea aparte.
- Consumo de insumos por sede, avance de metas por asesor (sumando todas las sedes), listados filtrables por sede y periodo.

**Se acepta cuando**: las cifras del dashboard cuadran con los listados que las explican, sede por sede, en un periodo con datos de prueba conocidos.

### Fase 7 · Matriz y cierre general diario

- **Menú según el tipo de sede**: la Matriz muestra OG, CP, nómina, su caja, el cierre general y el dashboard.
- OG y CP con código `MAT` (sale sola de la fase 2, porque la Matriz ya es una sede).
- **Cierre general diario** (§14): tabla de las 4 cajas, verificación, notas, bloqueo del día, resumen para Oscar, reapertura por el admin.

**Bloqueada por** las preguntas del cierre general (§14): qué hace hoy Constanza, el umbral de diferencia, si el cierre bloquea el día y el plazo. Se puede construir todo lo demás de la Matriz mientras tanto.

**Se acepta cuando**: `contabilidad.lina` cierra un día con las 4 cajas, el día queda bloqueado, y `admin.zoom` recibe el resumen y puede reabrirlo con motivo.

### Fase 8 · Aceptación y producción

- **Aceptación en staging**: el recorrido de la fase 9 del plan del fork, repetido con sedes y con los usuarios del §11.
- **Producción** (fase 8 del fork): base vacía, las 4 sedes creadas por la migración, `SEED_DEMO=false`. Soporte crea el usuario de Oscar Herrera (`admin`), y él define su contraseña.
- Anotar en DIVERGENCIA el commit de la fase 2 como el punto desde el que ya no se reconverge con High.

---

## 13. Preguntas abiertas

Resueltas (2026-09-27): producción sale con sedes · teléfono por sede y correo común · DTF por sede · ciudad Bogotá · metas por asesor · empleados por sede · áreas de producción comunes · consumo de insumos por sede · mismos precios · co-propiedad entre sedes · kanban con las mismas columnas y tarjetas por sede · usuarios de prueba inventados (§11) · consulta de OP de otra sede (§8).

- [x] ~~Modo consulta~~ → OP, COT y OT.
- [x] ~~Asistencia de quien apoya en otro local~~ → se anota dónde estuvo.
- [x] ~~Traslado de documentos~~ → por ahora no hay.
- [x] ~~Prospectos~~ → comunes.
- [x] ~~Notificaciones de operación~~ → solo a la sede del documento.
- [x] ~~WhatsApp~~ → un número para todas.
- [x] ~~Preguntas del admin~~ → §6.

- [x] ~~Definiciones del dashboard~~ → §7.
- [x] ~~Motivo obligatorio, notificaciones y usuario del admin~~ → §6.
- [x] ~~Colores de las sedes~~ → se quedan los del mockup: violeta `#9D8CFF` (104), ámbar `#F5B94A` (119), coral `#FF8A7A` (125).
- [x] ~~Servicios del encabezado de los PDF~~ → se mantiene la lista actual.

- [x] ~~Saldo a favor entre sedes~~ → se permite en cualquier sede y cuenta en la sede donde se aplica (§4, §7).

Lo de la Matriz está en §14. Las decisiones técnicas, en §15.

---

## 14. La Matriz

### Decisiones

- Es un cuarto espacio, **no un local**: no vende ni produce, y no tiene COT, OP, OT ni DTF. La administra contabilidad.
- Se modela como un registro en `Location` de tipo `HEADQUARTERS` (los locales son `STORE`). Con la Matriz activa, el menú muestra OG, CP, nómina, su caja, el cierre general y el dashboard, y oculta COT, OP, OT y DTF.
- Código **`MAT`**: `MAT-OG-0001`, `MAT-CP-0001`, `MAT-RC-0001`.
- **Qué gastos son suyos**: lo que sirve a las 3 sedes (contador, nómina, software, publicidad común, impuestos, gastos bancarios). El arriendo, los servicios públicos y los arreglos de cada local son del local.
- **Compra de insumos**: quien registra la OG o la CP elige si la paga una sede o la Matriz. El stock sigue siendo común. La entrada de inventario es un registro aparte (hoy no está enlazada a la OG ni a la CP) y toma la sede activa de quien la registra.
- **Caja propia**: la Matriz puede pagar en efectivo, así que tiene una caja (caja menor) que funciona igual que la de un local, con apertura, movimientos y cierre. Así las OG de la Matriz siguen el flujo actual, que exige una caja abierta para pagar, sin cambios en el código de OG.
- **Nómina**: se mantiene como en High. Para el dashboard, la nómina pagada sale de las OG y CP de la Matriz con tipo de gasto *Nómina*; no se lee el módulo de nómina (⚠️ confirmar que en High se registra así).
- Las OG y CP de la Matriz las aprueba el admin, como todo lo demás.
- **Acceso por roles y permisos**: rol nuevo `contabilidad`, que ve la caja de cada sede y el consolidado. Permisos nuevos: `read_all_cash_sessions` (ver las cajas de todas las sedes, en solo lectura) y `perform_general_closing` (hacer el cierre general).

### Cierre general diario

**Hoy**, Constanza hace a mano un cierre general de las 3 cajas. **Con todo en el sistema**, la propuesta es convertirlo en un proceso dentro del software: el sistema junta y calcula, y Constanza revisa, justifica y cierra.

**1. Cada caja cierra como hoy.** Cada local, y la Matriz si abrió caja, hace su cierre con el conteo por denominaciones. La diferencia queda registrada, con la nota de quien cerró.

**2. Constanza abre "Cierre general · [fecha]".** El sistema ya trae todo calculado, sin transcribir nada:

| Caja | Estado | Base | Efectivo | Transferencia | Tarjeta | Otros | Egresos | Retiros | Esperado | Contado | Diferencia | Verificado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Local 104 | Cerrada 7:42 p. m. | | | | | | | | | | | ☐ |
| Local 119 | **Abierta** ⚠️ | | | | | | | | | | | — |
| Local 125 | Cerrada 7:15 p. m. | | | | | | | | | | | ☐ |
| Matriz | Sin movimientos | | | | | | | | | | | — |
| **Total** | | | | | | | | | | | | |

- **Retiros** son los movimientos `WITHDRAWAL` que ya existen (efectivo enviado a caja fuerte o al banco). Muestran a dónde se fue el efectivo.
- **Totales por medio de pago del día**: el efectivo total es lo que debe existir, la transferencia se concilia con el banco y la tarjeta con el datáfono.
- **Debajo**: las OG y CP pagadas ese día por la Matriz y por cada sede.

**3. Revisión.**
- Constanza marca cada caja como **verificada**. Opcionalmente marca las transferencias como *conciliadas con el banco*.
- Una diferencia por encima del umbral exige una **nota**.
- **No se puede cerrar el día con una caja abierta.** Una sede que no operó (por ejemplo, un domingo) se marca como *sin operación*.

**4. "Cerrar el día".**
- Se guarda un **registro del cierre general** (`GeneralClosing`: fecha, quién, cuándo, la foto de los totales, las notas) y un PDF o Excel descargable.
- **Se bloquean** las sesiones de ese día: después, anular o corregir un movimiento exige una solicitud al admin con motivo.
- **Oscar recibe el resumen**: total del día por sede y por medio de pago, y las diferencias con sus notas.

**5. Reabrir.** Solo el admin puede reabrir un día cerrado, con motivo obligatorio, y queda en el historial.

**Qué reemplaza**: juntar los números de cada caja, sumarlos, cuadrarlos y armar el reporte para gerencia. **Qué sigue siendo humano**: verificar que el efectivo y el banco coinciden con lo que dice el sistema.

**Qué cambia en el diseño**: antes el consolidado era un reporte de solo lectura con una marca de "revisado". Ahora es un **cierre formal**, que deja registro y bloquea el día.

### Preguntas para el cliente

1. **¿Qué hace hoy Constanza, paso a paso?** ¿Recibe el efectivo de los locales, o cada local lo consigna en el banco? ¿Concilia las transferencias con el extracto? ¿A quién le entrega el cierre y en qué formato?
2. **¿Desde qué diferencia** de caja hay que exigir una nota? (Por ejemplo, más de $ 5.000.)
3. **¿El cierre general bloquea el día?** Recomendado: sí; corregir después pasaría por el admin.
4. **¿Hasta cuándo** hay plazo para hacer el cierre general? ¿Al día siguiente a primera hora? ¿Se alerta si un día queda sin cerrar?
5. **Nómina en High**: confirmar que se registra como OG o CP con tipo de gasto *Nómina*. Si no, el dashboard no la verá.

---

## 15. Decisiones técnicas

Aprobadas el 2026-09-27. No dependen del cliente, pero se fijan antes de la primera migración.

### 15.1 Cómo se filtra por sede sin `if` repartidos

- **La sede activa viaja en un header** (`X-Location-Id`) y no en el token. Cambiar de sede no exige renovar el token, y el backend valida en cada request que el usuario tenga esa sede permitida.
- **Se guarda en el contexto del request** (`AsyncLocalStorage`), igual que ya hace `audit-context` para la auditoría.
- **Una extensión de Prisma** agrega `locationId` al `where` de los modelos con sede y lo pone al crear. Así el filtrado es central y un servicio nuevo no se "olvida" de filtrar.
- **Salidas explícitas**, siempre con nombre: la vista "Todas" (con `view_all_locations`), el modo consulta (`read_other_locations`), los crons y el cierre general.
- ⚠️ **SQL crudo**: la extensión no ve `$queryRaw` (consecutivos, dashboard y reportes lo usan), así que esas consultas filtran a mano y llevan test.

### 15.2 Tiempo real y tareas programadas

- **socket.io**: hoy hay salas por tipo de evento (por ejemplo, `advance_payment_approvals`). Se agrega **una sala por sede**, a la que el cliente se une según su sede activa y cambia al cambiar de sede. Es lo que hace posible "notificaciones de operación solo a la sede".
- **Los 10 crons** corren sin usuario ni sede. Cada uno tiene que recorrer las sedes a propósito, sin pasar por el filtro del request, y notificar a la sede de cada documento.

### 15.3 Cómo nacen las sedes y qué pasa con los datos que ya existen

- **Las 4 sedes las crea la migración**, no el seed: la columna `locationId` es obligatoria y necesita las filas antes. Así producción las trae sin correr el seed. El seed solo crea los usuarios de prueba.
- **Los datos existentes**: producción está vacía. Staging y local tienen datos de prueba sin sede. La recomendación es **reiniciar la base de staging** y sembrarla con `SEED_DEMO=true` ya con sedes, en lugar de inventarles una sede a esos datos. Si se prefiere conservarlos, la migración los asigna todos al 125.
