# Plan de sedes (fase 10)

> **Zoom sale a producción con las sedes** (decidido 2026-09-27). Esto invierte el orden del plan del fork: la fase 10 va **antes** de crear producción, y la aceptación funcional (fase 9) se hace con sedes.
>
> Plan vivo: se pule a medida que el cliente responde. Lo decidido pasa también a la tabla de decisiones de [DIVERGENCIA.md](../DIVERGENCIA.md). El marco general (por qué es el punto de no retorno con High) está en la fase 10 de [PLAN_FORK_ZOOM.md](./PLAN_FORK_ZOOM.md).

**Fuentes:** reunión con el cliente por Google Meet (apuntes de Gemini) y respuestas del cliente del 2026-09-27.

**Cómo leer este plan:** las **fases de implementación** están en §12. Las demás secciones son el diseño de referencia que cada fase cita: qué es de cada sede (§1–§5), el admin (§6), el dashboard (§7), el modo consulta (§8), los PDF (§9), los reportes (§10), los usuarios de prueba (§11), las preguntas abiertas (§13), la Matriz (§14), las decisiones técnicas (§15) y el apoyo en otra sede (§16).

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
- **Apoyo ocasional en otra sede** (un empleado del 104 que unos días trabaja en el 125): necesita autorización de Gerencia, dura un rango de fechas y mientras dura el empleado queda fijo en esa sede. Diseño en §16.
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
| 9 | Apoyo en otra sede con autorización de Gerencia (§16) | 3 | M | — |
| 8 | Aceptación en staging y salida a producción | 1–7 y 9 | M | — |

Las fases 3, 4 y 5 son independientes entre sí y pueden ir en cualquier orden después de la 2.

### Fase 0 · Preparación ✅

- ✅ **Qué base es la de staging** (2026-09-27): `mainline.proxy.rlwy.net:55766`, la que aparecía comentada en `backend/.env` y `.env.development`, es la **Postgres de staging de High** (proyecto "High solutions", confirmado con el CLI de Railway). La de staging de Zoom (proyecto "ZOMM-CRM") **no tiene proxy TCP público**: solo se llega a ella por la red interna de Railway. Nunca se escribió en la de High: la corrida del importador contra ella fue una simulación con rollback.
- **Reiniciar la base de staging de Zoom** (§15.3): se hace **al desplegar la fase 1**, no antes, porque esa es la primera migración que la necesita limpia. Como no tiene acceso público, se hace desde dentro de Railway (`railway ssh` al servicio `zoom-backend`, o un proxy TCP temporal que se apaga al terminar). Requiere confirmación explícita en el momento.
- ✅ **Última sincronización con High** (2026-09-27): solo faltaba `9af43d6`, traído como `c75cce2`. De aquí en adelante, los cherry-picks que toquen documentos, consecutivos o caja van a chocar.
- ✅ **Tag `pre-sedes`** en `develop`, como punto de referencia antes del cambio irreversible.
- ✅ **Línea base** (2026-09-27): `tsc` limpio en ambos, 2917 tests del backend (189 suites) y 511 del frontend (61 archivos) en verde.

### Fase 1 · Sedes, usuarios, roles y sede activa

> **1a hecha** (2026-09-27): modelo y migración, sede activa (header + interceptor + contexto), roles `soporte` y `contabilidad`, permisos reservados, módulo `/sedes`, página oculta `/sistema/sedes`, sedes en la ficha de usuario, selector en el Topbar y usuarios de prueba. **1b hecha** (2026-09-27, probada en el navegador): anular y entregar a crédito directo exigen motivo y quedan como solicitud aprobada (`isDirect`); editar una OP bloqueada exige abrir la edición con motivo (ventana de 30 min); cambio de asesor directo con motivo obligatorio; edición directa de pagos registrada; el historial de la OP muestra cambios de estado, de asesor y descuentos directos.
>
> Aplazado a la fase 2: los usuarios de prueba todavía no se crean como `Employee` (la sede del empleado llega con la fase 2).

Todavía **no toca documentos**: al terminar, la app funciona como hoy, pero ya sabe quién está en qué sede.

- **Modelo**: `Location` (código, nombre, tipo `STORE` o `HEADQUARTERS`, dirección, teléfono, color, activa) y `UserLocation` (sedes permitidas y predeterminada). La **migración crea las 4 sedes** (§15.3).
- **Sede activa** (§15.1): header `X-Location-Id`, validación en el guard, contexto en `AsyncLocalStorage`. Todavía sin la extensión que filtra.
- **Frontend**: selector de sede en el Topbar (con "Todas" para quien tenga `view_all_locations`), entrada directa a la sede predeterminada al iniciar sesión, colores de sede.
- **Roles**: `soporte` y `contabilidad`, permisos reservados (§6.1) y permisos nuevos (`view_all_locations`, `read_other_locations`, `read_all_cash_sessions`, `perform_general_closing`, `manage_locations`). El seed deja de darle a `admin` los reservados.
- **Página oculta de sedes** para soporte (§6.4) y **asignación de usuarios a sedes** en la ficha de usuario, para el admin (§6.5).
- **Trazabilidad del admin** (§6.3): acciones directas registradas como solicitud aprobada, con motivo obligatorio. No depende de las sedes.
- **Seed**: usuarios de prueba del §11 con `SEED_DEMO=true`.

**Se acepta cuando**: cada usuario de prueba entra a su sede, `asesor.apoyo` cambia entre el 125 y el 119, `admin.zoom` ve "Todas", el admin no puede asignarse `manage_locations`, y una acción directa del admin aparece en el historial con su motivo.

### Fase 2 · Sede en los documentos y numeración nueva ✅

> **2a hecha** (2026-09-28): migración `location_scope` (sede obligatoria en los 8 documentos, opcional en empleado, asistencia e inventario; filas previas al 125), extensión `location-scope` que filtra por la sede activa, numeración `{sede}-{prefijo}-{número}` sin año (la CP deja su generador propio), herencia de sede (OP desde COT o DTF, OT y OPROD desde su OP, CP desde su OG), recibos de caja en la sede del documento o de la caja, y saldo a favor entre sedes con `withoutLocationScope`.
>
> **Ajuste al diseño**: a quien tiene `view_all_locations` la sede activa **solo le filtra los listados**; el acceso por id y las escrituras no. El admin aprueba solicitudes de todas las sedes desde su bandeja, y sin esto una aprobación de otra sede le respondía 404.
>
> **2b hecha** (2026-09-28, probada en el navegador): los avisos de aprobación de una OP (anticipos, edición de pagos, devoluciones, propiedad de cliente, descuentos) solo llegan a los usuarios de su sede y a quienes ven todas; los de nómina, asesores de cliente e inventario siguen globales. Sockets con una sala por sede. La alerta de cliente duplicado muestra la sede del asesor. El gráfico mensual del dashboard (SQL crudo) filtra por sede. En el frontend no hizo falta más: los listados y el tablero se filtran solos por el header, y nada dependía del formato viejo de número.
>
> **Fase 2 cerrada.**

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

### Fase 3 · Caja por sede ✅

> **Hecha** (2026-09-28, probada por API contra `zoom_seedtest`): la migración `cash_register_per_sede` crea "Caja <sede>" para cada sede que no tenga caja, y crear una sede le crea la suya. Las sesiones de caja se filtran por la sede de su caja (la extensión filtra `CashSession` a través de `cashRegister`), así que cada cajero solo ve y abre la caja de su sede (abrir la de otra da 404). Los pagos, anticipos, devoluciones, pagos de CP y autorizaciones de OG caen en la sesión abierta de **la caja de la sede del documento**, no de la sede activa (`findActiveCashSessionForLocation`): el admin con el 104 activo registra un pago a una OP del 119 y cae en la caja del 119. Si la caja de esa sede está cerrada, el pago queda en la cola de pendientes, y al abrirse la caja solo entran los pendientes de su sede. El filtro por fecha del historial de sesiones usa el día en hora de Bogotá.
>
> **Contabilidad** ve las cajas de todas las sedes con `view_all_locations`, y en solo lectura porque el seed no le da `open_cash_session`, `close_cash_session` ni movimientos. `read_all_cash_sessions` todavía no lo revisa ningún endpoint: queda para la vista consolidada del cierre general (fase 7).
>
> **Error encontrado en el camino**: `withoutLocationScope()` devolvía la consulta de Prisma sin esperarla, y como las consultas de Prisma son perezosas, se ejecutaba después, fuera de la salida del filtro. Ahora hace `await` adentro. Además de la caja, arregla tres usos de la fase 2 que fallaban en silencio: las fuentes de saldo a favor de otra sede, la sede de un aviso y la sala de socket de una OP.

- Una caja por sede, más la de la Matriz (§4, §14). El pago cae en la sesión de la caja de la sede activa (`findActiveCashSession(cashRegisterId)`).
- Reembolsos y anticipos por la caja de la sede del documento.
- El día de una sesión es el de su apertura, en hora de Bogotá.
- Contabilidad ve las cajas de todas las sedes en solo lectura (`read_all_cash_sessions`).

**Se acepta cuando**: las 3 cajas abren a la vez sin cruzarse, cada una cierra con su propio saldo, y un pago del 119 nunca cae en la caja del 125.

### Fase 4 · Experiencia multisede ✅

> **4a hecha** (2026-09-28, probada en el navegador con `asesor.apoyo` contra `zoom_seedtest`): **modo consulta** de OP, COT y OT. El `GET :id` de las tres usa `findOneForView`: si el documento no está en la sede activa y el usuario tiene `read_other_locations`, lo busca en todas y lo devuelve con `accessMode: 'consulta'`, dejando una fila `CONSULTA` en `audit_logs`. Lo que escribe sigue usando `findOne` con el filtro, así que un documento ajeno no existe para ningún endpoint que modifica (404). En el frontend, una envoltura por ruta (`OrderDetailRoute`, `QuoteDetailRoute`, `WorkOrderDetailRoute`) carga el documento y, si llega en consulta, muestra una **vista de solo lectura aparte** en vez de la página completa: esa página pide de entrada pagos, aprobaciones y rentabilidad, que para un documento ajeno responden 404, y ocultar una por una las acciones de una página de 3.700 líneas era frágil. La vista tiene el banner fijo con el color y el teléfono de la sede, "Cambiar al Local X" si el usuario la tiene permitida, resumen, ítems, documentos relacionados (que también se abren en consulta) y el PDF. **Búsqueda en otras sedes**: `GET /orders/lookup`, `/quotes/lookup` y `/work-orders/lookup` (con `read_other_locations`), agrupados por sede; los listados muestran debajo de la tabla "No está en el Local 125, pero hay resultados en otras sedes" cuando la búsqueda no encuentra nada en la sede activa. **Ficha del cliente**: OP y COT de todas las sedes que el usuario puede consultar, agrupadas por sede, la activa primero.
>
> El seed da `read_other_locations` a los roles `user` y `caja`. En una base ya sembrada (staging) hay que dárselo desde la pantalla de Roles a los roles de sede.
>
> **4b hecha** (2026-09-28, probada en el navegador con `admin.zoom`): en "Todas", los listados de OP, COT y OT muestran **una tabla por sede** (`SedeGroupedTable`): encabezado con color, nombre, cantidad y subtotal (el `meta` de los listados de OP y COT trae `sumTotal`), plegable, primeras 10 filas y "Ver las N del Local X", que entra a esa sede. Cada grupo se pide aparte con el header `X-Location-Id` de su sede (el interceptor de axios respeta una sede puesta en la petición), así que filtros y orden se aplican dentro de cada grupo y el backend valida la sede como siempre. No se usa un `?locationId=`: la extensión respeta un `locationId` explícito en el `where` y eso abriría otras sedes a quien no las tiene. **Selector rápido** `Todas · 104 · 119 · 125 · Matriz` arriba de los tres listados y del tablero, solo con `view_all_locations`. **Tablero de cotizaciones**: las mismas columnas, un carril por sede, cada uno con su propio arrastre (una COT no cambia de sede). **"¿En qué sede se crea?"**: las rutas para crear OP, COT, OG, CP y DTF preguntan la sede cuando la activa es "Todas" y cambian a ella.
>
> Las OPROD relacionadas no salen en la vista de consulta de la OP (la OP no las trae).
>
> **Fase 4 cerrada.**

- **Modo consulta** de OP, COT y OT de otra sede (§8): banner, acciones ocultas, "Cambiar al Local X", `GET …/lookup`, registro en `AuditLog`.
- **Ficha del cliente** con COT y OP agrupadas por sede.
- **Vista "Todas" agrupada** para el admin (§6.2): grupos por sede, máximo 10 filas por grupo, selector rápido, tablero con un carril por sede, "¿En qué sede se crea?".

**Se acepta cuando**: se recorren las 3 pantallas del mockup "Modo consulta entre sedes" en la app real, y `admin.zoom` ve "Todas" agrupada sin filas intercaladas.

### Fase 5 · PDF por sede ✅

> **Hecha** (2026-09-28): los PDF imprimen la dirección y el teléfono de la sede del documento, leídos de `Location` con cada documento; `COMPANY_INFO` queda con el nombre, la ciudad y el correo común. Además de los 4 generadores (OP, COT, OT, OG), también la tirilla de la OP, el recibo de caja y los reportes de caja (con la sede de la caja). Una sede sin dirección ni teléfono (la Matriz) y la nómina (común) imprimen solo la ciudad y el correo. Verificado generando en el navegador el PDF y la tirilla de `104-OP-0001` y `119-OP-0001`: cada uno sale con su dirección y su teléfono. El sitio web (`zoompublicidad.com.co`) se agregó después, en `COMPANY_INFO`.

- Dirección y teléfono de la sede del documento, leídos de `Location` (§9). `COMPANY_INFO` queda con lo común.

**Se acepta cuando**: una OP del 104 y una del 119 imprimen cada una su dirección y su teléfono.

### Fase 6 · Dashboard consolidado y reportes ✅

> **Hecha** (2026-09-28, verificada contra `zoom_seedtest`): página **Dashboard por sede** (`/dashboard/sedes`, en el menú para quien tiene `view_all_locations`; el endpoint `GET /dashboard/sedes` exige además `read_financial_dashboard`). Cubre todas las sedes sin importar la activa. Trae: tarjetas de ventas, recaudo (con el saldo a favor aplicado aparte), gastos, resultado y cartera, cada una con la variación contra el periodo anterior de la misma duración y una barra por sede con el código y el porcentaje de cada una; la **tabla comparativa** (una columna por sede, la Matriz y el total), donde ventas, OP y cartera llevan al listado de OP ya en esa sede y ese periodo; la **tendencia semanal** con un gráfico pequeño por sede y la misma escala; **gastos por tipo** apilados por sede; y el **consumo de insumos** por sede (salidas de inventario valoradas al costo). Las cifras cuadran, sede por sede, con el listado de OP (ventas y cantidad) y con su mini dashboard (recaudo).
>
> **Regla de gastos, para no contar dos veces**: toda OG crea su CP al nacer, y cuando Caja paga la OG registra la salida de caja. Por eso los gastos son las **OG pagadas por Caja** en el periodo (total de sus ítems) más los **abonos a CP que no salen de una OG**. Si en la operación las CP de una OG se pagan aparte (compras a crédito), esta regla hay que revisarla con el cliente.
>
> **Metas**: el resumen de ventas acepta `acrossLocations`, que suma todas las sedes para quien las ve todas o para las ventas propias. La sección de metas y el detalle del asesor lo usan: el avance contra la meta cuenta todo lo que vendió el asesor.
>
> **Arreglo en el camino**: los pagos, los ítems de OG y los abonos a CP no tienen sede propia, así que la extensión no los filtra. La tarjeta "Recaudo del periodo" del listado de OP sumaba los pagos de todas las sedes, y el total de gastos del dashboard financiero, las OG de todas. Ahora filtran por la sede de su documento con `locationFilter()`. No se agregaron esos modelos a la extensión: los flujos que escriben leen con `findMany` los pagos de una OP puntual, y al admin, que opera en cualquier sede, se le filtran los listados.
>
> Los colores de las sedes no sirven como paleta de gráfico (son claros y el 119 y el 125 se confunden): en los gráficos la sede se distingue por panel o por etiqueta, y ventas, gastos y tipos de gasto usan una paleta categórica validada para modo claro y oscuro.

- Dashboard del admin (§7) con las definiciones acordadas, incluido el saldo a favor aplicado en línea aparte.
- Consumo de insumos por sede, avance de metas por asesor (sumando todas las sedes), listados filtrables por sede y periodo.

**Se acepta cuando**: las cifras del dashboard cuadran con los listados que las explican, sede por sede, en un periodo con datos de prueba conocidos.

### Fase 7 · Matriz y cierre general diario

> **7a hecha** (2026-09-28): **menú según el tipo de sede**. Con la Matriz activa, "Comercial" pasa a llamarse "Gastos" y deja solo OG, tipos y subcategorías de gasto y CP; se ocultan pipeline, COT, OP, OT, órdenes pendientes, solicitudes, trazabilidad, rentabilidad, ventas por asesor, clientes, canales de venta, DTF y todo el menú de Producción. Nómina, caja, logística, organización, seguridad y los dashboards siguen según los permisos. En "Todas" se ve todo. **En el backend**, crear una COT, una OP o una DTF con la Matriz activa es un 400 `LOCATION_NOT_A_STORE` (`requireStoreLocationId`; el contexto del request trae ahora el tipo de la sede activa). En el frontend, crear COT, OP o DTF desde la Matriz o desde "Todas" pregunta "¿En qué local se crea?" y ofrece solo los locales; la vista "Todas" de OP, COT y OT y el tablero de cotizaciones ya no muestran la Matriz. Las OG y CP con código `MAT` ya salían de la fase 2.
>
> Pendiente (7b): el cierre general diario, bloqueado por las preguntas de §14.

- **Menú según el tipo de sede**: la Matriz muestra OG, CP, nómina, su caja, el cierre general y el dashboard.
- OG y CP con código `MAT` (sale sola de la fase 2, porque la Matriz ya es una sede).
- **Cierre general diario** (§14): tabla de las 4 cajas, verificación, notas, bloqueo del día, resumen para Oscar, reapertura por el admin.

**Bloqueada por** las preguntas del cierre general (§14, preguntas 1 a 4 y 6 a 8) y la de la nómina (pregunta 5). Se puede construir todo lo demás de la Matriz mientras tanto.

**Se acepta cuando**: `contabilidad.lina` cierra un día con las 4 cajas, el día queda bloqueado, y `admin.zoom` recibe el resumen y puede reabrirlo con motivo.

### Fase 9 · Apoyo en otra sede

Diseño en §16. Se numera después de la 8 porque se decidió cuando la 8 ya estaba en curso, pero **va antes de la salida a producción**.

> **Backend hecho** (2026-09-30, probado contra `zoom_seedtest` con un backend aparte): modelo, migración, permiso, interceptor, notificaciones, socket y `/location-supports`. Probado de punta a punta: `admin.zoom` programa a `asesor.104` en el 125 (su login y su perfil traen solo el 125; el 104 responde 403 «Estás de apoyo en Local 125»), un segundo apoyo que se cruza se rechaza, `asesor.104` pide volver y al aprobarlo recupera el 104; `caja.119` va de apoyo al 125, abre su caja, y aprobarle la vuelta falla con `CASH_SESSION_OPEN` hasta que la cierra. **Falta el frontend.**

- Modelo `LocationSupport` y su migración; permiso `authorize_location_support` en el catálogo, el seed (`admin` y `soporte`) y la etiqueta del selector de roles (grupo Sedes).
- `LocationContextInterceptor`: con un apoyo vigente, la única sede permitida es la del apoyo. Destinatarios de las notificaciones de operación según el apoyo. Regla de caja.
- Endpoints de `/location-supports` y el apoyo vigente en `GET /auth/me`.
- Frontend: banner del apoyo, "Pedir apoyo en otra sede" y "Pedir cambio de sede" en el selector del Topbar, página "Apoyos entre sedes" para Gerencia, pendientes en la barra de aprobaciones, historial en la ficha del usuario y cambio de sede automático al aprobar o terminar.

**Se acepta cuando**:
- `admin.zoom` programa a `asesor.104` en el 125 para hoy. Al entrar, `asesor.104` queda en el 125 con el banner, el Topbar no le deja volver al 104, y la OP que crea sale `125-OP-…`.
- `asesor.104` pide volver al 104; cuando `admin.zoom` lo aprueba, su pantalla cambia sola al 104.
- `caja.119` pide apoyo en el 125 para hoy, `admin.zoom` lo aprueba y `caja.119` abre la caja del 125. Aprobarle volver al 119 falla mientras esa caja siga abierta y funciona después de cerrarla.
- Un apoyo que terminó ayer ya no da acceso al 125.
- `asesor.apoyo` sigue cambiando libremente entre el 125 y el 119.

### Fase 8 · Aceptación y producción

#### Preparación de staging (ensayada en local el 2026-09-29)

Staging corre hoy el código anterior a las sedes (`origin/staging` @ `8856b3a`, 15 commits detrás de `develop`) y su base tiene los datos de demo viejos. **No hay variables de entorno nuevas**: basta con el deploy y el seed. Se ensayaron los dos caminos en Postgres 17 local:

| | **A. Reiniciar la base** (recomendado, §15.3) | **B. Conservar los datos** |
|---|---|---|
| Migraciones | las 128 aplican limpio sobre una base vacía | las 4 de sedes aplican limpio sobre la base vieja: los documentos previos quedan en el 125 y cada sede recibe su caja |
| Seed (`SEED_DEMO=true`) | 4 sedes con su caja, 13 usuarios (§11), OP y COT de demo en 104, 119 y 125 | crea los usuarios de sede y los roles nuevos, y pasa `adminsistema` a `soporte` |
| Permisos | completos | **hay que correr `prisma:sync:permissions`**: el seed no toca los roles que ya tienen permisos, y sin eso `admin` no tiene `view_all_locations` (no ve "Todas") ni los otros 4 permisos de sedes. `caja` y `user` quedan sin `read_other_locations`: se les da desde Roles |
| Invariantes | todas en 0 | 4 "pagos sin rastro en caja", heredados de la demo vieja |
| Numeración | todo con el formato nuevo | las OP y COT viejas conservan `OP-2026-0001` |

En el ensayo aparecieron y se corrigieron en el seed dos cosas: los asesores y `produccion.119` tenían el rol `user` de High (7 permisos: no podían vender ni producir), y ahora usan los roles nuevos **`asesor`** y **`produccion`**, puntos de partida que se ajustan desde Roles; y los pagos de demo quedaban sin rastro en caja, ahora nacen como pendientes y entran a la caja de su sede al abrirla.

**Pasos** (los de Railway los hace quien tiene acceso al proyecto):

1. **Respaldo** de la base de staging (Railway → Postgres → Backups), aunque se vaya a reiniciar.
2. *Solo A*: vaciar la base de staging (Railway → Postgres → Data, o `psql` con la URL pública: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`). Así la `DATABASE_URL` no cambia.
3. **Desplegar**: `git checkout staging && git merge --ff-only develop && git push && git checkout develop`. El backend corre `prisma migrate deploy` al arrancar; confirmar en el log que aplicó las migraciones (128 en A, 4 en B).
4. **Seed** desde la máquina local, con la **URL pública** de la Postgres de staging (la interna `postgres.railway.internal` no se alcanza desde afuera):
   `cd backend && DATABASE_URL='<URL pública de staging>' NODE_ENV=staging SEED_DEMO=true SEED_ADMIN_PASSWORD='<la de QA>' npm run prisma:seed`
5. *Solo B*: `DATABASE_URL='<URL pública>' npm run prisma:sync:permissions`, y dar `read_other_locations` a `caja` y `user` desde Roles si se van a usar.
6. **Invariantes**: `scripts/sql/invariants.sql` contra la URL pública (solo lectura). En A deben dar todas 0.
7. **Humo**: `curl -i https://api.pruebas.zoompublicidadcrm.com/health`; entrar con `adminsistema` y con `admin.zoom` (ve "Todas" y el Dashboard por sede); entrar con `asesor.104` (solo ve el 104).
8. **Catálogos de High** (decidido el 2026-09-29: los 10) con `npm run prisma:import:high -- --apply` y la URL pública; los JSON viven solo en local (`prisma/data/high-catalog/`, fuera de git). Ensayado sobre una base recién sembrada: entran 15 áreas de producción, 15 cargos, 2 canales, 4 tipos y 20 subcategorías de gasto, 17 categorías de productos, 271 productos, 9 insumos y 143 proveedores; se puede repetir sin duplicar y las invariantes siguen en 0. Llegan también los pendientes de proveedores (YAMAIKE fusionado con HIGH SOLUTIONS GROUP, ARTE Y DISEÑO CLISES FOTOGRABADO con FOTOGRADADO SION, HCV PUBLICIDAD duplicado por un NIT que difiere en un dígito), y "DTF TEXTIL" y "DTF UV" quedan dobles porque los de la demo están en otra categoría.

> **Hecho el 2026-09-29 (camino A)**: respaldo, base vaciada, deploy de `2b10e95` (128 migraciones), seed de demo, los 10 catálogos de High y las 13 invariantes en 0. Humo por API: `admin.zoom` ve las 4 sedes y "Todas"; `asesor.104` solo ve el 104, abre en consulta una OP del 119 y "Todas" le da 403. Pendiente: apagar el TCP Proxy de la Postgres de staging cuando ya no haga falta, y rotar su contraseña (quedó expuesta en el chat de trabajo).

#### Recorrido de aceptación

Con los usuarios del §11 (contraseña `zoom123`), los criterios de cada fase:

- [ ] **Fase 1**: cada usuario entra a su sede; `asesor.apoyo` cambia entre el 125 y el 119; `admin.zoom` ve "Todas"; el admin no puede asignarse `manage_locations`; una acción directa del admin aparece en el historial con su motivo.
- [ ] **Fase 2**: `asesor.104` y `asesor.125` no ven los documentos del otro; los números salen `104-OP-…` y `125-OP-…` en paralelo; un abono cruzado se rechaza; un saldo a favor del 119 se aplica en el 125; la notificación de una OP del 119 no le llega al 125.
- [ ] **Fase 3**: las 3 cajas abren a la vez sin cruzarse, cada una cierra con su propio saldo, y un pago del 119 nunca cae en la caja del 125.
- [ ] **Fase 4**: las 3 pantallas del mockup "Modo consulta entre sedes" en la app; `admin.zoom` ve "Todas" agrupada sin filas intercaladas; "¿En qué sede se crea?" al crear desde "Todas".
- [ ] **Fase 5**: una OP del 104 y una del 119 imprimen cada una su dirección y su teléfono (PDF y tirilla).
- [ ] **Fase 6**: el Dashboard por sede cuadra, sede por sede, con el listado de OP y su mini dashboard en el mismo periodo.
- [ ] **Fase 7a**: con la Matriz activa el menú solo muestra gastos, nómina, caja y dashboards; crear una OP desde la Matriz pide un local.
- [ ] **Fase 9**: apoyo programado, cambio aprobado que mueve la pantalla sola, regla de caja, vencimiento y sedes fijas intactas (criterios de la fase 9).
- [ ] Además, el recorrido de la fase 9 del plan del fork (login, PDF, adjuntos, Excel, logs en Grafana con `env="staging"`).

#### Producción

- **Aceptación en staging**: el recorrido de la fase 9 del plan del fork, repetido con sedes y con los usuarios del §11.
- **Producción** (fase 8 del fork): base vacía, las 4 sedes creadas por la migración, `SEED_DEMO=false`. Soporte crea el usuario de Oscar Herrera (`admin`), y él define su contraseña.
- Anotar en DIVERGENCIA el commit de la fase 2 como el punto desde el que ya no se reconverge con High.

---

## 13. Preguntas abiertas

Resueltas (2026-09-27): producción sale con sedes · teléfono por sede y correo común · DTF por sede · ciudad Bogotá · metas por asesor · empleados por sede · áreas de producción comunes · consumo de insumos por sede · mismos precios · co-propiedad entre sedes · kanban con las mismas columnas y tarjetas por sede · usuarios de prueba inventados (§11) · consulta de OP de otra sede (§8).

Resueltas (2026-09-30): apoyo ocasional en otra sede con autorización de Gerencia (§16).

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
- **Nómina**: se mantiene como en High. Para el dashboard, la nómina pagada sale de las OG y CP de la Matriz con tipo de gasto *Nómina*; no se lee el módulo de nómina. ⚠️ Revisado en el código: hoy pagar un periodo de nómina no crea ninguna OG ni CP, y el tipo *Nómina* no existe. Ver la pregunta 5.
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

Revisadas el 2026-09-28. Bloquean el cierre general (fase 7); el resto de la Matriz no depende de ellas.

1. **¿Qué hace hoy Constanza, paso a paso?** ¿Los locales le entregan el efectivo a la Matriz, o cada local lo consigna en el banco? ¿Concilia las transferencias con el extracto? ¿A quién le entrega el cierre y en qué formato?
   - *Por qué importa*: si el efectivo de los locales pasa a la Matriz, hace falta un **traslado entre cajas** (sale de la caja del local y entra a la de la Matriz), que hoy no existe. Si se consigna en el banco, alcanza con los retiros (`WITHDRAWAL`) que ya hay.
2. **¿Desde qué diferencia de caja se exige una nota?** (Por ejemplo, más de $ 5.000.) Recomendado: un valor fijo que el admin pueda cambiar.
3. **¿El cierre general bloquea el día?** Recomendado: sí. Después, anular o corregir un movimiento de ese día pasa por una solicitud al admin con motivo, y solo el admin reabre el día.
4. **¿Hasta cuándo hay plazo para el cierre general?** ¿Al día siguiente a primera hora? ¿Se avisa si un día queda sin cerrar, y a quién (Constanza, Oscar)?
5. **Nómina: ¿cómo debe quedar registrada como gasto?** Revisado en el código (2026-09-28): marcar un periodo de nómina como pagado **no registra ningún gasto** (ni OG, ni CP, ni movimiento de caja). Solo los anticipos a empleados quedan como CP (*Personal / Anticipos*), y no existe un tipo de gasto *Nómina*. Así el dashboard no ve la nómina. Opciones:
   - **a)** Al marcar el periodo como pagado, el sistema crea sola una CP de la Matriz con tipo *Nómina*. **Recomendado**: no depende de que alguien se acuerde.
   - **b)** Contabilidad la registra a mano como OG o CP de la Matriz.
6. **¿Quién hace el cierre general?** ¿Solo Constanza, o también Lina? ¿Qué pasa si Constanza falta?
7. **¿Qué días opera cada local?** Si, por ejemplo, los domingos no abren, esos días pueden quedar marcados solos como *sin operación* en vez de pedirlo cada vez.
8. **¿Cómo le llega el resumen del cierre a Oscar?** Hoy el sistema solo tiene avisos dentro de la aplicación; WhatsApp está aplazado y no hay correo. Si lo quiere por fuera, es trabajo adicional.

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

---

## 16. Apoyo en otra sede (autorizado por Gerencia)

Decidido con el cliente el 2026-09-30. Un empleado del 104 puede trabajar algunos días en el 125, pero solo con autorización de Gerencia.

### Dos formas de trabajar en otra sede

| | Sedes fijas (§5) | Apoyo en otra sede (esta sección) |
|---|---|---|
| Para qué | Lo rutinario: el del 125 que cubre el almuerzo en el 119 | Lo ocasional: vacaciones, una ausencia, un día de mucho trabajo |
| Quién lo da | El admin, en la ficha del usuario | Gerencia, programándolo o aprobando una solicitud |
| Cuánto dura | Hasta que se quite | Un rango de fechas; vence solo |
| Cambiar de sede | Libre, desde el Topbar | Fijo en la sede del apoyo; cambiar pide autorización |

Las sedes fijas se quedan como están.

### Decisiones (2026-09-30)

1. **Lo inician los dos.** Gerencia lo programa de antemano, y así nace aprobado. Para un imprevisto, el empleado lo pide en el momento y Gerencia lo aprueba.
2. **"Gerencia" es un permiso, no un rol**: `authorize_location_support` ("Autorizar apoyos en otra sede", grupo Sedes). El seed se lo da a `admin` (Oscar Herrera) y a `soporte`, y el admin puede dárselo a otro rol.
3. **Dura un rango de fechas**, uno o varios días de Bogotá, y vence solo al terminar el último.
4. **Mientras dura, el empleado queda fijo en la sede del apoyo.** Cambiar de sede antes de que venza, sea para volver a la suya o para ir a otra, también pide autorización de Gerencia. La regla es una sola, incluso para quien tiene sedes fijas: **con un apoyo vigente, cambiar de sede pide Gerencia**.
5. **Con la caja abierta no se cambia.** Si el empleado tiene abierta una sesión de caja en la sede del apoyo, debe cerrarla antes de que se apruebe un cambio o se termine el apoyo.
6. **El login no pregunta nada**, porque la sede ya la decidió Gerencia al autorizar. Con un apoyo vigente entra directo a esa sede; sin apoyo, a la suya, como hoy.

### Cómo se ve

- **Empleado con apoyo vigente**: un banner fijo con el color de la sede, *"Estás de apoyo en el Local 125 · autorizado por Oscar Herrera · hasta el 5 de oct."* El selector del Topbar muestra solo el 125 y la opción **"Pedir cambio de sede"** (a qué sede y por qué). Mientras espera la respuesta sigue trabajando en el 125. Si la pide con la caja abierta, se le avisa de entrada que tendrá que cerrarla.
- **Empleado sin apoyo**: en el selector del Topbar, **"Pedir apoyo en otra sede"**: sede, fechas (por defecto hoy) y motivo.
- **Gerencia**: página **"Apoyos entre sedes"** (con `authorize_location_support`), con pestañas Pendientes · Vigentes · Programados · Historial y el botón **"Programar apoyo"** (empleado, sede, fechas y motivo). Las solicitudes pendientes suman en la barra de aprobaciones y llegan como notificación. Desde Vigentes, Gerencia puede terminar un apoyo antes de tiempo, con motivo y con la misma regla de caja.
- **Al programar un apoyo**, el empleado recibe una notificación: *"Del 1 al 5 de oct. estás de apoyo en el Local 125."*
- **Al aprobar o terminar**, la pantalla del empleado pasa sola a la sede nueva (evento de socket) con un aviso. Si no tenía la app abierta, cambia en la siguiente petición: el 403 `LOCATION_NOT_ALLOWED` ya refresca las sedes permitidas (`api/axios.ts`).
- **Ficha del usuario**: el historial de sus apoyos.

### Qué cambia y qué no

- **Lo que hace en el 125 es del 125**: OP, COT, caja, consecutivos y asistencia llevan la sede activa, como siempre. La venta cuenta para el 125 y para el asesor (§5).
- **La nómina no cambia**: sigue siendo empleado del 104 (`Employee.locationId`). La asistencia de esos días queda en el 125 porque se marca con la sede activa.
- **Notificaciones de operación**: mientras dura el apoyo le llegan las de la sede del apoyo y no las de su sede.
- **Auditoría**: programar, pedir, aprobar, rechazar, terminar y cambiar quedan en `audit_logs`, y el apoyo guarda quién lo pidió y quién lo autorizó.
- **Quien tiene `view_all_locations`** (admin, contabilidad) ya opera en todas las sedes: no se le programan apoyos.

### Backend

- **Modelo `LocationSupport`**: usuario, sede, `startDate` y `endDate` (fechas sin hora), motivo, estado (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), quién lo pidió, quién lo revisó y cuándo, nota de revisión, `endedAt`, `endedById` y `endReason` si se terminó antes, y `replacesId` si es un cambio a mitad de otro apoyo. Un usuario no puede tener dos apoyos aprobados que se crucen.
- **Vigente** = `APPROVED`, hoy (`businessToday()`) entre `startDate` y `endDate`, y sin `endedAt`.
- **`LocationContextInterceptor`**: con un apoyo vigente, las sedes permitidas del usuario son **solo la del apoyo**, que es también su sede por defecto. Sin apoyo, las fijas de `UserLocation`, como hoy. Es un solo punto: la extensión de Prisma, la caja y los consecutivos no se enteran.
- **Notificaciones**: hoy el destinatario "de la sede" es quien la tiene entre sus sedes fijas (`notifications.service.ts`, `locations: { some: { locationId } }`). Pasa a ser quien la tiene fija y no está de apoyo en otra, o quien está de apoyo vigente en ella.
- **Un cambio a mitad del apoyo** es una solicitud nueva con `replacesId`. Al aprobarla, el apoyo actual termina en ese momento. Si el destino es otra sede ajena, el nuevo queda vigente hasta la fecha pedida; si es su propia sede, no da acceso nuevo y el empleado vuelve a sus sedes fijas.
- **Regla de caja**: aprobar un cambio o terminar un apoyo mientras ese usuario tiene abierta una sesión de caja en la sede del apoyo es un 400 `CASH_SESSION_OPEN`. **Si el apoyo vence con la caja abierta**, sigue vigente solo para esa sede hasta que la cierre, para que pueda cerrarla, y aparece en Vigentes marcado como *"vencido, caja abierta"*.
- **Endpoints** (`/location-supports`): pedir para uno mismo y cancelar la propia solicitud pendiente (sin permiso especial); programar, aprobar, rechazar, terminar y listar todos (con `authorize_location_support`); listar los propios. `GET /auth/me` devuelve el apoyo vigente, si hay.
- **Sin cron nuevo**: la vigencia se calcula en cada petición con la fecha de Bogotá, así que vencer no necesita una tarea programada.
