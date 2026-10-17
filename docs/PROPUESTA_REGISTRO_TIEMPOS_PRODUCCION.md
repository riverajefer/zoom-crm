# Propuesta — Temporizador y línea de tiempo de producción en la OT

**Fecha:** 2026-10-17 · **Estado:** fase 1 implementada en desarrollo (sin desplegar) · **Origen:** reunión del 2026-10-16

> **Respuestas del cliente (2026-10-17):** hay computador o tablet en cada área; el costo quincenal es salario + horas extra; la máquina se registra pero es opcional; la jornada de producción termina a las **18:00** y se puede extender con un botón «Sigo trabajando» (la tarea sigue hasta el tope de las 23:59).
>
> **Qué quedó en la fase 1:**
> - Temporizador por ítem y para la OT en general, con un tope de 3 tareas a la vez.
> - Máquina opcional.
> - Línea de tiempo encima de Comentarios.
> - Chip «En curso» con «Sigo trabajando».
> - Cierre automático a las 18:00 (`PRODUCTION_WORKDAY_END`) y a las 23:59.
> - Bandeja «por revisar» para el supervisor.
> - Ajustes, anulaciones y registros olvidados, siempre con motivo y conservando el valor original. Nadie corrige sus propias horas, salvo el admin.
> - Catálogo de Máquinas.
> - Permisos `track_work_order_time`, `adjust_work_order_time` y `*_machines`.
>
> El diálogo manual de horas se retiró.

## 1. Lo que pide el cliente

En el detalle de la orden de trabajo (OT), el cliente plantea tres cosas:

1. **El registro de horas actual no sirve en la práctica.** Hay que escribir a mano la fecha y la hora de inicio y de fin, y eso resulta inoperante.
2. **Un temporizador** con botones de *Iniciar* y *Finalizar* que calcule solo el tiempo. Así los operarios no pueden acomodar las horas a su conveniencia. Además, debe poder registrar **varias tareas a la vez**: por ejemplo, la máquina imprime vinilo mientras el operario arma cintas portacarnet. El cliente lo imaginó como una vista tipo Google Calendar encima de los comentarios de la OT.
3. **Medir la productividad.** Las horas reales por la tarifa ordinaria se comparan con el costo quincenal de cada empleado.

**En el fondo, lo que quieren es saber qué está haciendo cada persona de producción.** Por eso, más allá de la lógica de negocio, lo crítico es la interfaz: la línea de tiempo tiene que verse clara de un vistazo.

## 2. Cómo funciona hoy

| Aspecto | Hoy | Archivo |
|---|---|---|
| Dónde se guarda | `WorkOrderTimeEntry`: una fila por registro, de la OT completa o de un ítem, con `startAt`/`endAt` y el usuario que la creó | `backend/prisma/schema.prisma:1359` |
| Cómo se captura | Un diálogo con `TextField type="date"` y `type="datetime-local"`, todo escrito a mano | `frontend/src/features/work-orders/pages/WorkOrderDetailPage.tsx:727-839` |
| Cómo se muestra | Una lista simple, «Timeline de Horas Trabajadas» | `WorkOrderDetailPage.tsx:524` |
| Permisos | Crear y editar horas solo exige `read_work_orders`; no hay borrado y el PATCH no verifica de quién es el registro | `work-orders.controller.ts:151,165` |
| Valor hora | No existe. La nómina guarda `monthlySalary` o `dailyRate` | `schema.prisma:1804` |
| Asistencia | Sí existe: entrada y salida por usuario (`AttendanceRecord`) | `schema.prisma:2047` |

**Datos de producción (consulta de solo lectura, 2026-10-17):**

- En toda la historia hay **3 registros de horas**, todos de los últimos dos días y de 2 usuarios. La función prácticamente no se usa, así que no hay datos que migrar.
- Se crean **~5 OT al día** (423 en los últimos 90 días), frente a ~55 OP al día.
- Producción tiene **11 operarios en 9 áreas**: calandra y sublimación, confección, corte láser, DTF textil, DTF UV, plotter ecosolvente, rígidos, entre otras. Todos tienen usuario, porque la nómina lo exige.

## 3. Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Quién marca | **El operario, desde su propia sesión** | Es la única forma de evitar que alguien acomode las horas de otro |
| Tareas en paralelo | Se permiten, y **el costo se prorratea**: una hora con 2 tareas abiertas carga ½ hora a cada una | Así el costo total cuadra con la nómina y la ocupación nunca pasa del 100 % |
| Alcance | **Solo OT** | Es el pedido del cliente. Ver el riesgo en §7 |
| Olvidos y errores | **Cierre automático** al terminar la jornada; solo un supervisor corrige, con motivo e historial | Un olvido no debe dejar una tarea abierta toda la noche, y una corrección no debe borrar la evidencia |

## 4. Reglas de negocio

1. **Iniciar.** El operario elige un ítem de la OT (o «General de la OT») y, si quiere, escribe una nota. **La hora la pone el servidor**, no el reloj del computador o de la tablet.
2. **Finalizar.** El servidor registra la hora de fin y calcula la duración. **El operario nunca escribe horas.**
3. **Paralelo.** Un operario puede tener varias tareas abiertas a la vez, con un tope configurable (propuesta: 3). No puede abrir dos veces la misma tarea, es decir, el mismo ítem de la misma OT.
4. **Solo lo propio.** Cada operario inicia y finaliza únicamente sus tareas. El diálogo manual de hoy desaparece para los operarios.
5. **Cierre automático.** A la hora de fin de jornada (19:00, la misma que usa asistencia) el sistema cierra las tareas abiertas. Quedan marcadas en rojo como *«Cerrada por el sistema»* para que el supervisor las revise.
   - Si la asistencia se cierra por **inactividad**, el temporizador **no** se cierra: un operario frente a la máquina no toca el computador, y eso no significa que no esté trabajando.
6. **Ajuste por supervisor.** Con un permiso nuevo, el supervisor puede:
   - corregir el inicio o el fin;
   - crear un registro que se olvidó;
   - anular un registro.

   Siempre debe escribir un motivo. El registro queda marcado *«Ajustado»* y **conserva el valor original** para poder auditarlo. Las fechas se eligen con un selector de fecha y hora, sin escribirlas.

## 5. La interfaz

### A. Detalle de la OT: panel «Producción», encima de Comentarios

Es una **línea de tiempo horizontal del día** y reemplaza la lista actual.

- Hay **una fila por ítem** de la OT, más una fila «General». El eje horizontal son las horas del día, de 6:00 a 20:00.
- Cada tarea es una **barra** con el color y las iniciales del operario.
- Las tareas en curso **crecen en vivo** hasta una línea roja que marca «ahora».
- Arriba hay chips para cambiar de día (solo los días con actividad) y un modo «toda la OT» para las OT que duran varios días.
- Cada fila tiene un botón grande **▶ Iniciar**, que cambia a **■ Finalizar · 00:42:13** con el cronómetro corriendo. Está pensado para tocarse en una tablet.
- Al tocar una barra se ve el detalle: operario, inicio, fin, duración, nota y estado. El supervisor ve además el botón *Ajustar*.

**Por qué horizontal y no vertical como Google Calendar:** en la vista vertical, dos tareas al mismo tiempo se vuelven dos columnas angostas pegadas y cuesta leerlas. En filas horizontales, una por ítem, el paralelo se ve tal cual: «imprimiendo vinilo» y «armando cintas» corren una encima de la otra en el mismo tramo de horas. La idea del cliente se mantiene (franjas horarias y bloques de color); solo cambia la orientación.

### B. Indicador «En curso» en la barra superior

Es un chip con el número de tareas abiertas del operario. Al tocarlo se despliega cada tarea con su cronómetro y un botón *Finalizar*, para cerrar una tarea **sin volver a la OT**. Es indispensable cuando hay varias tareas en paralelo en OT distintas.

### C. Vista «Planta hoy» (supervisión)

- Tiene **una fila por operario**; el eje horizontal son las horas del día y cada barra muestra el número de OT.
- De fondo aparece **sombreada la franja de asistencia** (de la entrada a la salida). Los huecos sin tareas dentro de esa franja se ven solos.
- Es la vista que responde directamente *«¿qué está haciendo cada uno ahora?»*.

> La maqueta interactiva de las tres vistas acompaña este documento.

## 6. Costo y productividad

- **Valor hora ordinaria** = `salario mensual ÷ divisor de horas`. El divisor es configurable; con la jornada legal de 42 h semanales (vigente desde julio de 2026) serían **210 h al mes**. Lo debe confirmar el contador.
- **Prorrateo.** En cada tramo de tiempo, si el operario tiene *k* tareas abiertas, cada tarea recibe 1/*k* de ese tramo.

  ```
  08:00–09:00  solo «Vinilo»               → Vinilo 1 h
  09:00–10:00  «Vinilo» y «Cintas» a la vez → Vinilo ½ h · Cintas ½ h
  Total: 2 h de persona (no 3), igual a lo que se paga
  ```

**Indicadores propuestos:**

| Indicador | Fórmula | Qué responde |
|---|---|---|
| Ocupación | horas con al menos una tarea abierta ÷ horas presentes (asistencia) | ¿Cuánto del tiempo en planta está en una OT? |
| Costo de mano de obra por OT | suma de las horas prorrateadas × valor hora | ¿Cuánto costó hacer esta OT en mano de obra? |
| Quincena por operario | horas registradas × valor hora, frente al pago de la quincena | ¿Cuánto de lo que se paga se convierte en producción? |

## 7. Riesgos que hay que hablar con el cliente

1. **«Solo OT» deja por fuera el mostrador.** DTF textil y DTF UV trabajan sobre todo con OP de mostrador, que no tienen OT. Su ocupación va a salir baja aunque trabajen todo el día. Si el cliente compara operarios sin saber esto, va a sacar conclusiones equivocadas.
2. **Solo ~1 de cada 10 OP tiene OT.** Si no se crean OT, no hay nada que medir. La medición depende de que las OT se vuelvan un hábito.
3. **Equipos en planta.** Para que marque el operario, cada área necesita un computador o una tablet con sesión abierta.

## 8. Preguntas abiertas

1. ¿Hay un computador o una tablet en cada área de producción? ¿En cuáles no?
2. El costo quincenal que quieren comparar, ¿es el salario más las horas extra, o el **costo empresa** (con prestaciones y seguridad social)? ¿Qué divisor de horas usa el contador?
3. Además del ítem, ¿hace falta registrar **en qué máquina** se hizo? Hoy no existe un catálogo de máquinas.
4. ¿La jornada de producción también termina a las 19:00, o tiene otro horario?
5. ¿El operario puede ver su propia productividad, o solo la gerencia?
6. ¿Quién es el supervisor que corrige las horas? ¿Uno por área o uno general?

## 9. Fases

| Fase | Contenido | Depende de |
|---|---|---|
| **1. Temporizador** | Iniciar y finalizar, tareas en paralelo, cierre automático, ajuste del supervisor, panel A e indicador B, permisos nuevos | Pregunta 1 (equipos) |
| **2. Planta hoy** | Vista C, con la asistencia de fondo | Fase 1 |
| **3. Costo y productividad** | Valor hora, prorrateo, reporte por operario y quincena, costo de mano de obra por OT | Preguntas 2 y 5 |

### Notas técnicas de la fase 1

- **Migración de `WorkOrderTimeEntry`:**
  - `endAt` nulo significa que la tarea está en curso.
  - Campos nuevos: `closedBySystem`, `adjustedById`, `adjustReason`, `originalStartAt`, `originalEndAt` y `voidedAt` (se anula, no se borra).
  - Un índice único parcial evita dos tareas abiertas iguales (mismo usuario, OT e ítem con `endAt` nulo). El `findFirst` solo no alcanza: ya pasó con el doble envío de las solicitudes de aprobación.
- **Endpoints:** `POST :id/time-entries/start`, `POST time-entries/:id/stop`, `GET time-entries/my-running`, `PATCH time-entries/:id/adjust` y `POST time-entries/:id/void`. El PATCH y el POST actuales quedan solo para el supervisor.
- **Cron de cierre** a la hora `ATTENDANCE_WORKDAY_END`. Ojo: el backend no soporta réplicas, porque los crons se duplicarían.
- **Permisos nuevos:** `track_work_order_time` (operario) y `adjust_work_order_time` (supervisor). Hay que agregarlos en `sync-permissions.ts`, `permission-labels.ts` y `PermissionsSelector.tsx`.
- **Frontend:**
  - La línea de tiempo se dibuja con CSS (grid y posiciones absolutas) y `date-fns`, sin librerías nuevas de calendario.
  - Los ajustes usan `DateTimePicker` de `@mui/x-date-pickers`, que ya está instalado.
  - Los botones Iniciar y Finalizar usan `LoadingButton` y `useSingleFlight`, para que un doble toque no abra dos tareas.
