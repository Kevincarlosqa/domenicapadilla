# Doménica Padilla — Lógica de negocio

> *All types of beauty.* Estudio de micropigmentación y belleza con 7 sedes (6 en Lima, 1 en Arequipa).
> Unidades de negocio: **Brows · Lashes · Skin · Nails · Hair** (+ labios y maquillaje).

Este documento fija las reglas que implementa el código (`src/lib/availability.ts`, `src/lib/booking.ts`) y las decisiones tomadas donde el brief era ambiguo. Las decisiones marcadas con **[D]** son supuestos razonables que se pueden cambiar sin rediseñar el modelo.

---

## 1. Sedes (`Branch`)

| Sede (slug) | Dirección | Ciudad | WhatsApp actual |
|---|---|---|---|
| `monterosa` | C. Monte Rosa 284, Chacarilla | Lima (Surco) | +51 971 157 220 |
| `cavenecia` | Av. Emilio Cavenecia 151 | Lima (Miraflores) | +51 926 670 064 |
| `begonias` | C. Las Begonias 429, piso 1, int. 4 | Lima (San Isidro) | +51 987 359 132 |
| `dasso` | C. Miguel Dasso 126, piso 3 (CC El Sausalito) | Lima (San Isidro) | +51 908 881 986 |
| `viareal` | Vía Real 135 (Centro empresarial) | Lima | +51 908 882 010 |
| `compostela` | Jr. Santiago de Compostela 130 | Lima | +51 936 036 277 |
| `yanahuara` | Francisco Bolognesi 108, Yanahuara | Arequipa | +51 974 469 983 |

**[D]** Los distritos de *Vía Real* y *Santiago de Compostela* y **todas las coordenadas** son aproximados en el seed: hay que verificarlos en Configuración → Sedes antes de producción (afectan a "sede más cercana").

- Cada sede tiene **zona horaria propia** (`America/Lima` para todas hoy; el motor no asume que sea la misma).
- **Horario semanal** con varias franjas por día (`BranchHours`), **cierres especiales** (`BranchClosure`: feriados, inventario, remodelación) con inicio/fin en UTC.
- **Capacidad física** (`stations`): camillas/sillas simultáneas. Micropigmentación ocupa una camilla igual que una manicura. **[D]** No se modelan tipos de cabina distintos; si una sede tiene 2 cabinas de micropigmentación y 4 mesas de uñas, `stations = 6` es una aproximación aceptable para la v1.
- **Políticas por sede**: intervalo entre horarios (`slotIntervalMin`, 15 min por defecto), anticipación mínima (`minLeadMinutes`, 120), días máximos hacia adelante (`maxDaysAhead`, 60), ventana de cancelación/reprogramación gratuita (`cancelWindowHours`, 24), máximo de reservas activas por cliente (`maxActiveBookings`, 3) y umbral de no-shows (`noShowWarnAt` = 2 advierte, `noShowBlockAt` = 3 bloquea reservas automáticas).
- Una sede inactiva no aparece en la landing ni en el bot, pero conserva su historial.

## 2. Especialistas (`Stylist`)

En la UI se llaman **especialistas** (micropigmentadoras, lashistas, manicuristas, estilistas…). En el código se mantiene `Stylist`.

- Nivel `JUNIOR | SENIOR | MASTER`. El nivel no cambia el precio por sí solo: el precio propio va en `StylistService`.
- **Horario por sede y día** (`StylistSchedule`: especialista + sede + día de la semana + franja). Los descansos se expresan como **dos franjas** (10:00–14:00 y 15:00–19:00). Una especialista puede trabajar en Dasso por la mañana y en Begonias por la tarde **el mismo día**.
- **Habilidades** (`StylistService`): solo puede hacer los servicios listados. Duración/precio propios opcionales (una *master* en microblading cobra más; una *senior* en manicura tarda menos).
- **Ausencias** (`TimeOff`): vacaciones, enfermedad, capacitación o bloqueo puntual. `branchId` nulo = bloquea en todas las sedes.
- **Las reservas de una especialista bloquean en todas las sedes**: si tiene una cita en Dasso de 15:00 a 17:00, no aparece libre en Begonias en ese rango aunque su horario lo diga. **[D]** No se suma tiempo de traslado entre sedes; el horario por franjas ya debe contemplarlo.

## 3. Servicios

Categorías (`ServiceCategory`): `BROWS` (microblading, microshading, laminado, diseño), `LASHES` (lifting, extensiones, delineado permanente), `LIPS` (micropigmentación de labios, *lip blush*), `SKIN` (limpieza, hydrafacial, dermapen), `NAILS`, `HAIR` (corte, color, balayage, keratina), `MAKEUP`.

- `durationMin`, `priceCents` (en **céntimos de sol, PEN**), `bufferMin` (limpieza/esterilización posterior; en micropigmentación es obligatorio).
- **Tiempo de espera intermedio** (`processingOffsetMin` + `processingMin`): la especialista queda libre mientras actúa el producto (color en cabello, anestésico tópico en micropigmentación, solución del lifting). **[D] Se modela**: durante esa ventana la especialista puede atender a otra clienta, **pero la camilla sigue ocupada** por la primera. Solo se aprovecha si el servicio intercalado cabe completo (incluido su buffer) dentro del hueco.
- **Precio "desde"** (`priceFrom = true`) y **variantes** (`ServiceVariant`: corto/medio/largo, o *clásicas/híbridas/volumen* en pestañas) con duración y precio propios. La variante pisa al servicio; el override de sede pisa a la variante en precio solo si la variante no lo define. Orden de precedencia de **precio**: `StylistService` > `ServiceVariant` > `BranchService` > `Service`. Duración igual.
- **Retoque** (`retouchAfterDays`): la micropigmentación requiere retoque a los 30–45 días. Al completar la cita, el sistema sugiere fecha de retoque (el bot lo ofrece; el dashboard lo muestra en la ficha).
- **Catálogo por sede** (`BranchService`): un servicio solo se ofrece en una sede si existe la fila y está activa. Puede tener precio/duración propios.

### Reservas con varios servicios
- Los servicios se **encadenan uno tras otro** en el orden pedido: el servicio *i+1* empieza cuando termina el *i* (la clienta no espera).
- Cada ítem puede tener especialista distinta. Si el ítem siguiente es de la **misma especialista**, su buffer intermedio se omite (no hay limpieza entre servicios de la misma clienta); el buffer se aplica después del último ítem de cada especialista.
- La clienta ocupa **una camilla** durante todo el bloque (inicio del primero → fin del último + buffer del último).

## 4. Disponibilidad (núcleo)

Un inicio `T` (en la zona horaria de la sede) es válido si:

1. El día no está dentro de un `BranchClosure` y la sede está abierta; **todo el bloque** cae dentro de una franja de `BranchHours`.
2. `T ≥ ahora + minLeadMinutes` y `T ≤ hoy + maxDaysAhead`.
3. Para cada ítem, la especialista asignada:
   - tiene la habilidad, el servicio se ofrece en la sede,
   - tiene una franja de `StylistSchedule` **en esa sede ese día** que contiene el ítem completo (su parte ocupada, buffer incluido),
   - no tiene `TimeOff` que se solape,
   - no tiene intervalos ocupados (de **cualquier** sede) que se solapen. Las reservas que bloquean son `PENDING`, `CONFIRMED`, `IN_PROGRESS`. Los intervalos ocupados excluyen la ventana de *processing*.
4. La ocupación de camillas en la sede no supera `stations` en ningún instante del bloque.
5. Los candidatos se generan cada `slotIntervalMin` desde la apertura de cada franja de la sede.

**Cambio de día y zona horaria**: todo se calcula en minutos desde la medianoche **local** de la sede y se convierte a instantes UTC con `@date-fns/tz` (`TZDate`). Un horario de Lima a las 19:30 es 00:30 UTC del día siguiente; nunca se usa la fecha UTC para decidir el día de la semana.

### "Cualquier especialista"
Se asigna ítem por ítem entre las elegibles libres. **Estrategia [D]**: se elige la que **deja menos hueco muerto** (menor distancia entre el fin de su ocupación anterior —o el inicio de su turno— y el inicio del ítem); en empate, la de **menor carga del día** (minutos reservados); en empate, la de nivel más bajo (las *master* quedan libres para quien las pida). Es *greedy*: puede no encontrar combinaciones exóticas multi-especialista, lo cual se acepta.

### Consultas expuestas
- `getAvailability({ branchId, items[], stylistId?, date | from..to })` → slots con la asignación propuesta.
- `findFirstAvailable({ items[], near?: {lat,lng} | branchIds[], stylistId? })` → primer hueco por sede, ordenado por distancia y hora.

### Concurrencia
`createBooking` corre en una **transacción** que toma `pg_advisory_xact_lock` sobre la clave *sede+día* y luego sobre *especialista+día* de cada especialista asignada (en orden alfabético, para evitar interbloqueos: la sede siempre antes que las especialistas). Dentro del lock se **recalcula** la disponibilidad con datos frescos; si el hueco se ocupó lanza `SlotTakenError` con hasta 3 alternativas cercanas.

## 5. Reservas (`Booking` + `BookingItem`)

- **Código corto** legible: `DP-` + 5 caracteres sin ambigüedad (sin 0/O/1/I), p. ej. `DP-7KQ4M`.
- Estados: `PENDING → CONFIRMED → IN_PROGRESS → COMPLETED`, y `CANCELLED`, `NO_SHOW`. Transiciones permitidas:
  - `PENDING → CONFIRMED | CANCELLED`
  - `CONFIRMED → IN_PROGRESS | CANCELLED | NO_SHOW`
  - `IN_PROGRESS → COMPLETED`
  - Los estados finales no cambian (salvo `ADMIN`, que puede revertir un `NO_SHOW` erróneo).
- **[D]** Las reservas por WhatsApp/web nacen `CONFIRMED` (la clienta ya confirmó el resumen con el bot). Las del dashboard por teléfono también. `PENDING` queda para reservas que requieren validación (p. ej. clienta con no-shows en advertencia o primer servicio de micropigmentación, que requiere evaluación previa).
- Canal: `WHATSAPP | WEB | DASHBOARD | PHONE | WALK_IN`.
- **Precio congelado** por ítem (`priceCents`) y total. Cambiar el catálogo no altera reservas existentes.
- **Políticas**:
  - Cancelar o reprogramar gratis hasta `cancelWindowHours` antes. Dentro de la ventana, el bot no lo hace: deriva a humano. El staff sí puede.
  - Máximo `maxActiveBookings` reservas futuras activas por clienta.
  - No-shows: `≥ noShowWarnAt` → la reserva nace `PENDING` y se marca en el dashboard; `≥ noShowBlockAt` → el bot no reserva y deriva a humano.
- **Recordatorios** (cron cada 15 min → `/api/cron/reminders`, protegido con `CRON_SECRET`): 24 h y 2 h antes, con botones *Confirmar / Reprogramar / Cancelar*. Fuera de la ventana de 24 h de WhatsApp se usa plantilla aprobada (`WHATSAPP_TEMPLATE_REMINDER`). Se marca `reminder24hSentAt` / `reminder2hSentAt` para idempotencia.
- **Lista de espera** (`WaitlistEntry`): cuando se cancela una reserva, se buscan entradas `WAITING` compatibles (sede, servicio, rango de fechas, especialista si la pidió) y se avisa a la más antigua (`NOTIFIED`). **[D]** No se reserva automáticamente: se le ofrece el hueco y gana quien confirme primero.
- **Walk-ins** desde el dashboard: canal `WALK_IN`, estado `IN_PROGRESS`, se salta la anticipación mínima pero no la capacidad ni la agenda de la especialista.

## 6. Clientas (`Customer`)

- Identificadas por **teléfono E.164** (`+51987654321`). Los números peruanos de 9 dígitos que empiezan en 9 se normalizan a `+51`.
- Historial, sede y especialista preferidas (se recalculan al completar citas: la más frecuente de las últimas 10).
- **Ficha técnica** (`TechnicalNote`): pigmento y fórmula usados (marca, tono, aguja), alergias, tipo de piel/cabello, fotos (URL), especialista y fecha. Fundamental para retoques de micropigmentación.
- Notas internas, etiquetas (`VIP`, `Sensible`, `Retoque pendiente`…), consentimiento de marketing con fecha.

## 7. WhatsApp + IA

- **Un único número** para toda la cadena. El bot identifica la sede: (1) la pregunta con lista interactiva, (2) la deduce si la clienta comparte ubicación (sede más cercana por Haversine) o menciona distrito, (3) propone su sede habitual si es recurrente.
- La IA **nunca inventa** precios ni horarios: todo sale de herramientas que leen la base de datos y validan con Zod.
- Siempre confirma el **resumen** (sede, servicios, especialista, fecha/hora local, precio) antes de `crear_reserva`. Máximo 3 horarios por mensaje.
- **Control humano**: si el staff toma la conversación (`aiPaused`), el bot no responde hasta que se libere. `transferir_a_humano` pausa la IA y marca la conversación.
- **Costo**: se envían los últimos 20 mensajes como texto plano + un resumen persistente (`Conversation.summary`) que se regenera cada 30 mensajes. El system prompt y las herramientas se cachean (prompt caching).
- **Deduplicación** por `waMessageId` único: Meta reintenta webhooks; un mensaje repetido se ignora.

## 8. Roles y alcance

| Rol | Alcance |
|---|---|
| `OWNER` / `ADMIN` | Todas las sedes; gestiona usuarios, catálogo y políticas. Selector "Todas las sedes". |
| `BRANCH_MANAGER` | Solo sus sedes (`UserBranch`); gestiona especialistas, horarios y reservas de ellas. |
| `RECEPTION` | Agenda, reservas, clientas y bandeja de su sede. No ve ingresos consolidados ni configuración. |
| `STYLIST` | Solo su agenda y sus clientas. |

La autorización se valida **en el servidor** en cada página, acción y endpoint (`requireUser` + `scopeBranches`). `proxy.ts` solo redirige si no hay cookie (chequeo optimista). Solo `OWNER`/`ADMIN` crean usuarios; no hay registro público.

## 9. Métricas (definiciones)

- **Ingresos**: suma de `totalCents` de reservas `COMPLETED` en el periodo (por fecha de la cita).
- **Ticket medio**: ingresos / reservas completadas.
- **Ocupación**: minutos reservados (no cancelados) / minutos de horario de especialistas en la sede en el periodo.
- **No-show**: `NO_SHOW` / (`COMPLETED` + `NO_SHOW`).
- **Clientas nuevas**: su primera reserva cae en el periodo.
- **Rebooking**: % de clientas atendidas que tienen otra reserva creada dentro de 60 días.
- Comparación contra el periodo anterior de igual duración.

## 10. Casos borde cubiertos por tests

Cambio de día (Lima tarde = UTC día siguiente) · zona horaria distinta (`Europe/Madrid` con DST) · especialista en dos sedes el mismo día · buffer · multiservicio con dos especialistas · ventana de *processing* aprovechada · capacidad de camillas · cierres · anticipación mínima · concurrencia (dos reservas simultáneas al mismo hueco → una falla con alternativas).
