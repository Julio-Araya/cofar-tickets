# DECISIONS · Sistema de tickets v1

Decisiones de producto y arquitectura, con su porqué. El alcance está en [BRIEF.md](BRIEF.md); cómo se trabajó, en [AI-USAGE.md](AI-USAGE.md); qué se probó, en [TESTING.md](TESTING.md).

## 1. Modelo de datos y por qué

Siete tablas en `supabase/migrations/20260922000000_initial_schema.sql`.

| Tabla | Qué es | Decisión clave |
|---|---|---|
| `areas` | Equipos que resuelven (TI, Mantención) | `external_ref` nullable para sincronizar desde el ERP después |
| `categories` | Tipos de solicitud de soporte | Pertenece a un área y trae `default_priority`. Elegir categoría enruta y prioriza; el solicitante no elige prioridad |
| `locations` | Oficina, farmacia, bodega | El mismo problema no pesa igual en cada sede. Se copia al ticket |
| `users` | Personas con rol y área | `area_id` nulo en un supervisor significa todas las áreas. Check: un agente siempre tiene área |
| `sla_policies` | Horas objetivo por prioridad, opcionalmente por área | Valores en tabla, no en código. Índices únicos parciales: una política por defecto por prioridad y una por área |
| `tickets` | Estado actual | `area_id` copiado desde la categoría al crear, para que un cambio de catálogo no mueva tickets históricos. Código `TK-0001` por secuencia. Check de coherencia entre `status` y `assignee_id` |
| `ticket_events` | Qué pasó y cuándo | Solo inserción. Un trigger rechaza `update` y `delete`. Es la base de la trazabilidad, del SLA y de las métricas |

**El catálogo de categorías no es el catálogo de productos.** Los productos (suplementos, medicamentos y sus subcategorías) son dato del ERP. Las categorías de este sistema son tipos de solicitud de soporte. No se mezclan.

**Por qué RLS activo sin políticas.** Todo acceso ocurre en el servidor con la key de servicio. El navegador nunca habla con Supabase. RLS sin políticas cierra cualquier otro camino, incluida la API REST pública. Las tres funciones RPC además revocan `execute` a `PUBLIC`, `anon` y `authenticated`; en la fase 2 solo se revocaba a los dos últimos y Postgres deja `PUBLIC` por defecto, así que el revoke era cosmético. Se corrigió en la migración 3.

**Por qué RPC para escribir.** Cada mutación de un ticket inserta su evento en la misma transacción (`create_ticket`, `apply_ticket_transition`, `change_ticket_priority`). La transición lleva guarda de estado esperado (`where status = expected`): si dos agentes toman el mismo ticket, el segundo recibe `ticket_state_conflict` y no pisa al primero. Las reglas de negocio no viven en SQL: la RPC garantiza atomicidad y concurrencia, TypeScript decide qué es válido.

**Dos líneas contra la página desactualizada.** El formulario envía el estado (o la prioridad) que el usuario vio. Si difiere del actual, la action responde "El ticket cambió mientras lo veías" y refresca, sin llegar a la base. La guarda de la RPC cubre la carrera entre esa lectura y la escritura.

## 2. Máquina de estados y por qué

Ocho transiciones en `src/domain/stateMachine.ts`, tabla única con actor, motivo requerido y efecto sobre el asignado.

| Desde | Hacia | Quién | Requiere |
|---|---|---|---|
| open | in_progress | agente del área | asigna |
| in_progress | open | asignado o supervisor del área | quita asignado |
| in_progress | waiting | asignado | motivo |
| waiting | in_progress | asignado | nada |
| in_progress | resolved | asignado | nota |
| resolved | closed | solicitante dueño | nada |
| resolved | in_progress | solicitante dueño | motivo |
| open | cancelled | solicitante dueño | nada |

- `open` sin dueño es la cola. Responde "quién la tiene": nadie.
- `waiting` existe para pausar el reloj del SLA cuando se espera al solicitante.
- `resolved` y `closed` se separan porque quien da por terminado el problema es el solicitante.
- `closed` y `cancelled` son terminales.
- Los estados que necesitan contexto (espera, resuelto, reabierto) piden un motivo corto que queda en el evento. Eso reemplaza a los comentarios en v1.

**Permisos.** Un solo mapa rol → acciones en `src/domain/permissions.ts`. `can(user, action, ticket)` agrega la relación con el ticket (dueño, asignado, misma área) y el estado. La interfaz y el servidor hacen la misma pregunta. Agregar un rol es agregar una entrada al mapa.

Decisiones tomadas con Julio sobre lo que el BRIEF no fijaba:
- **El supervisor no toma ni transiciona.** Ve, suelta, cambia prioridad y ve el dashboard. Si un agente falta, el supervisor suelta el ticket y otro agente lo toma.
- **La prioridad se cambia solo en `open`, `in_progress` y `waiting`.** En `resolved` el reloj del SLA ya se detuvo.
- **Reabrir mantiene al agente asignado.** Un agente ve cualquier ticket de su área. Todos los roles son dueños de los tickets que crean.
- **El cambio de prioridad se hace solo desde el detalle**, donde el motivo tiene contexto.

## 3. SLA

- Objetivo por prioridad en horas corridas: alta 4, media 24, baja 72. En `sla_policies`, con política por área opcional (el modelo ya lo soporta; el seed solo carga las por defecto).
- Tiempo consumido: desde la creación hasta la última resolución (o ahora), descontando los tramos en `waiting`. Se calcula desde los eventos en `src/domain/sla.ts`, función pura.
- **El objetivo se acumula por tramos de prioridad.** Cada tramo se mide contra su propio objetivo usando los eventos `priority_changed`: `razón = Σ activo(tramo) / objetivo(prioridad del tramo)`. Calcular con la prioridad actual rompería la auditabilidad: cambiar la prioridad reescribiría el pasado y un ticket podría vencer o dejar de estar vencido por horas que corrieron bajo otro plazo. Con tramos, bajar la prioridad no des-vence un ticket y subirla acorta lo que queda.
- El tramo entre `resolved` y reabierto cuenta: el problema no estaba resuelto.
- Estados: en plazo, en riesgo desde 75 %, vencido desde 100 %. Un ticket detenido solo puede estar cumplido o vencido.
- La fecha límite es el instante en que la razón llega a 1. Un ticket vencido conserva la que tuvo. Un ticket en espera muestra "Pausado", porque el límite se mueve mientras espera.
- **El SLA se muestra al solicitante.** Es una decisión de producto, no un descuido: transparencia sobre el compromiso que el área asume con quien pidió ayuda. El solicitante ve estado, porcentaje y fecha límite en sus tickets, igual que el agente.
- El tiempo medio de resolución del dashboard es el mismo tiempo neto que mide el SLA. Un solo concepto de tiempo en todo el sistema.

## 4. Opcionales elegidos y descartados

Elegidos: **dashboard de métricas** y **SLA por prioridad**. Ambos se calculan sobre el log de eventos, así que la arquitectura rinde dos veces.

Descartados, y el criterio:
- **Categorización automática con IA.** Sin datos históricos no hay contra qué calibrarla, obliga al revisor a configurar una API key, y es mejor medir primero y automatizar después. El log de eventos y el catálogo son la base para hacerlo en v2.
- **Comentarios.** Los estados que requieren contexto piden un motivo que queda en el evento. Cubre lo esencial sin construir un hilo.
- **Adjuntos, notificaciones, reasignación, búsqueda y filtros.** No atacan el dolor principal ("cuántas hay, cuánto demoran, quién las tiene").
- **Captura por Slack o correo.** El ticket tiene `source` (v1 solo `web`). La captura queda independiente del canal.

## 5. Autenticación simulada y link público

La entrada es una pantalla con los usuarios precargados agrupados por rol; el elegido queda en una cookie httpOnly. El link desplegado es público, sin Deployment Protection, para que el revisor entre sin cuenta. **Cualquiera con la URL puede entrar como cualquier usuario de prueba.** Es aceptable para una demo con datos ficticios. La versión real va con SSO corporativo, usuarios sincronizados desde el ERP y RLS sobre el JWT en lugar de una key de servicio.

## 6. Qué se rompería o rediseñaría a 50.000 tickets al mes y 5 áreas

**Primero, lo que no cambia.** 50.000 al mes son unos 1.700 al día, unos 70 por hora en horario hábil. Postgres aguanta eso sin arquitectura nueva. Hoy cada escritura es una RPC con un `update` guardado por estado y un `insert` en `ticket_events`, ambos sobre índices por id. El cuello de botella no es la escritura.

**Lo que rompe primero, en orden.**

1. **Las listas y el orden de la cola.** `listQueue` trae todos los activos del área y `sortQueue` los ordena en memoria por grupo, razón de SLA y antigüedad. Con 5 áreas y decenas de miles de activos eso no cabe en una request. Hay que paginar y ordenar en SQL, y para eso el criterio tiene que ser una columna indexable, no una función sobre un arreglo de eventos.
2. **El SLA calculado en cada lectura.** `attachSla` hace una consulta de eventos por lista y recorre cada ticket en `computeSla`. Recomputar desde los eventos es correcto para auditar un ticket, no para pintar una lista. Se necesitan columnas derivadas (`sla_ratio`, `sla_deadline`, `sla_state`, `active_hours`) actualizadas en la misma transacción que el evento, dentro de las RPC que ya existen, con el evento como fuente de verdad y el derivado como caché recomputable. `computeSla` no cambia: pasa a ser la función que valida o reconstruye la caché.
3. **El dashboard.** `listTicketsForDashboard` carga todos los tickets no cancelados del alcance y `computeMetrics` agrega en memoria. Se reemplaza por agregados precalculados por día y área, alimentados desde los eventos.
4. **Un usuario, un área.** `users.area_id` es una sola columna. Con 5 áreas hace falta membresía usuario-área y, sobre todo, **transferencia de tickets entre áreas como evento propio** (`area_changed`, con `from`, `to` y motivo). Ese evento además revela qué categorías están mal definidas: si una categoría se transfiere seguido, está en el área equivocada.
5. **El catálogo de categorías pasa a ser gobernanza.** Hoy son 10 filas en un seed. A ese volumen necesita administración, SLA por área (el modelo ya lo soporta con `sla_policies.area_id`), desactivación sin romper el histórico (`categories.active` ya existe, y `tickets.area_id` copiado protege lo pasado) y un dueño que no es TI.
6. **Lo que hoy no existe y a ese volumen es obligatorio:** búsqueda, filtros, notificaciones y horas hábiles en el SLA.
7. **Autenticación real.** 800 personas no se aprovisionan a mano: SSO, usuarios sincronizados desde el ERP por `external_ref`, RLS sobre el JWT en vez de una key de servicio.

**Lo que se mantiene.** El evento inmutable como unidad de registro, la escritura por RPC con guarda de estado, el dominio puro con tests y el catálogo como tabla. Todo eso escala; lo que cambia es dónde se lee.

**Cierre.** A ese volumen el problema deja de ser técnico. Con buena clasificación aparecen los patrones, y los patrones son los candidatos a resolución automática. El log de eventos y un catálogo gobernado valen más que optimizar la base. Primero se mide bien, después se automatiza.

## 7. Deuda técnica asumida

Declarada al cerrar cada fase, en orden de aparición.

- **No existe `waiting → open`.** Un ticket en espera cuyo agente está ausente no se puede soltar. Declarado, no se cambia en v1.
- **Cancelar solo desde `open`** deja sin salida a un ticket mal creado que ya fue tomado.
- **La ubicación se copia del usuario**, sin campo en el formulario. No cubre al solicitante que reporta un problema de otra sede.
- **`/assigned` se protege con `can(user, "ticket.take")`.** Se evaluó agregar una acción `assigned.view` al mapa; se descartó porque la lista de acciones del BRIEF es cerrada y "puede ser asignado" es exactamente lo que la página necesita. Si la lista de acciones crece, `assigned.view` es el nombre correcto. Queda comentado en el código.
- **Tipos de filas de Supabase escritos a mano** y validados con Zod en `src/lib/db`. No se generan desde el esquema.
- **La cookie de sesión no está firmada.** Basta para la autenticación simulada.
- **Sin paginación** en ninguna lista.
- **SLA y dashboard calculados en cada request** desde los eventos (ver sección 6).
- **Horas hábiles y SLA de primera respuesta** fuera de v1.
- **Studio y otros servicios de Supabase local apagados** en `config.toml` para acortar el arranque y evitar un problema de permisos de Docker Desktop en macOS.
- **Sin test end-to-end** del camino feliz (ver TESTING.md).
