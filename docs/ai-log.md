# Registro de uso de IA

Alimenta AI-USAGE.md al final. Se escribe durante cada fase, no de memoria.

Herramienta: Claude Code (modelo Claude Fable 5.1) como ejecutor técnico. Julio define alcance, revisa y mergea.

---

## Fase 1 · Esqueleto, esquema, seed, sesión, dominio, CI

**Qué se pidió.** Leer BRIEF.md y CLAUDE.md, proponer el plan de la fase y las dudas antes de escribir código, esperar OK, e implementar: esqueleto Next.js, migraciones, seed, sesión simulada, `permissions.ts` y `stateMachine.ts` con tests, CI, plantilla de PR, README inicial.

**Dudas que el agente levantó antes de partir, y respuesta de Julio.**
1. Base de datos para validar SQL (Docker no estaba corriendo). Julio: Supabase local, levanta Docker; proyecto cloud aparte para la fase 2.
2. Permisos del supervisor: el BRIEF solo lo nombra en soltar. Julio: fiel al BRIEF, el supervisor ve, suelta, cambia prioridad y ve el dashboard; no toma ni transiciona. Motivo: "si un agente falta, el supervisor suelta el ticket y otro agente lo toma, así que no queda bloqueado".
3. Deploy en Vercel no está en ninguna fase. Julio: en fase 2.
4. Cómo generar 40 tickets de seed. Julio: bloque plpgsql con escenarios explícitos, "sin aleatoriedad, con fechas relativas a now() para que el dashboard siempre muestre los últimos 30 días".

**Correcciones de Julio al plan (antes de escribir código).**
- El agente propuso usar el Node local (25). Julio: fijar Node 22 LTS en `engines` y en CI, "Vercel corre LTS".
- El agente propuso la variable `NEXT_PUBLIC_SUPABASE_URL`. Julio: renombrar a `SUPABASE_URL`, "el cliente nunca habla con Supabase, no debe estar expuesta al navegador".
- El agente asumió que cambiar prioridad se permite en cualquier estado no terminal (incluido `resolved`). Julio: solo en `open`, `in_progress` y `waiting`, "la prioridad define el SLA y en resolved el reloj ya se detuvo".
- Julio agregó: `.claude/settings.json` con `deny` para push a main, `gh pr merge` y `supabase db push`.

**Qué hizo el agente sin intervención.**
- Esqueleto con `create-next-app` (Next 16, React 19, Tailwind 4, ESLint 9), Vitest, Zod 4, supabase-js.
- Migración inicial con enums, tablas del BRIEF §7, secuencia para `TK-0001`, trigger que rechaza update/delete en `ticket_events`, trigger de `updated_at`, RLS en todas las tablas sin políticas, check de coherencia entre `status` y `assignee_id`.
- Seed con 44 escenarios explícitos (cerrados en plazo y tarde, en espera, reabiertos, soltados y retomados, cancelados, abiertos vencidos y en riesgo).
- `src/domain/stateMachine.ts`: tabla de transiciones con actor, motivo requerido y efecto sobre el asignado. `src/domain/permissions.ts`: mapa rol → acciones y `can(user, action, ticket)`. 86 tests.
- Sesión por cookie httpOnly con el id del usuario, pantalla `/login` con usuarios por rol, página de inicio que muestra las capacidades según `can()`.
- CI con lint, typecheck y test en Node 22. Plantilla de PR con las 6 secciones del reporte.

**Supuestos que tomó el agente (documentados en el PR).**
- Reabrir mantiene al agente asignado.
- Un agente ve cualquier ticket de su área, no solo los que tiene asignados.
- Cancelar solo desde `open`, como dice la tabla del BRIEF.
- Todos los roles tienen las acciones de dueño (`confirm`, `reopen`, `cancel`) sobre los tickets que ellos mismos crearon, porque el BRIEF dice que todos los roles pueden crear tickets.
- El motivo de `waiting`, `resolved` y reabrir se guarda en `payload.reason` del evento.

**Problemas que aparecieron y cómo se resolvieron.**
- `supabase start` fallaba al levantar Studio: Docker Desktop no tiene permiso para montar carpetas dentro de `~/Documents` ("operation not permitted"). La migración y el seed ya habían corrido bien. Se apagó Studio en `config.toml`, junto con Realtime, Storage, Edge Functions, Analytics e Inbucket, que no se usan. Documentado en README.
- El trigger de `updated_at` pisaba las fechas históricas del seed. El seed lo desactiva mientras corre y lo vuelve a activar.
- El `.gitignore` de `create-next-app` ignora `.env*`, incluido `.env.example`. Se agregó la excepción.

**Verificación hecha por el agente.**
- 86 tests de dominio, lint y typecheck en verde. `next build` ok.
- Seed en base local: 44 tickets (TK-0001 a TK-0044), 30 cerrados, 4 abiertos, 4 en curso, 2 en espera, 2 resueltos, 2 cancelados; 162 eventos, ninguno con fecha futura.
- `update` y `delete` sobre `ticket_events` rechazados por el trigger. RLS activo en las 7 tablas.
- Flujo de login probado en Chrome: entrar como agente y como supervisora, salir, redirección a `/login` sin cookie o con cookie inválida.

**Enfoques descartados por el agente durante la fase.**
- Generar el seed con un script TypeScript: descartado por Julio a favor de plpgsql (ver dudas).
- Fuentes de Google en el layout de `create-next-app`: quitadas para no depender de red en build.
- Probar la server action de login con `curl` a mano: el protocolo de server actions no es trivial de imitar; se probó con el navegador.

**Cierre de la fase (revisión de Julio).** PR #1 aprobado y mergeado sin cambios. Julio confirmó los cinco supuestos tal como quedaron.

**Deuda declarada por Julio al cerrar la fase (va a DECISIONS.md).**
- No existe la transición `waiting → open`. Un ticket en espera cuyo agente está ausente no se puede soltar. Queda declarado, no se cambia en v1.
- Cancelar solo desde `open` deja sin salida a un ticket mal creado que ya fue tomado.

---

## Fase 2 · Vistas del solicitante y RPC de transición

**Qué se pidió.** Plan antes de escribir código. Además: agregar `npm run build` al CI; las migraciones y el seed al proyecto cloud las aplica Julio desde el SQL Editor (el agente avisa cuándo), sin tocar el deny; Julio pone `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del cloud en `.env.local` cuando el agente lo pida.

**Dudas del agente y respuesta de Julio (antes de escribir código).**
1. Ubicación del ticket: se copia del usuario, sin campo en el formulario. Julio anotó como deuda que esto no cubre al solicitante que reporta un problema de otra sede.
2. Proyecto de Vercel: lo crea Julio (para que los secretos no pasen por el agente). El agente entrega pasos y variables exactas.
3. SQL al cloud: apenas la migración 2 pase en local, antes del deploy.

**Agregados de Julio.**
- En `/tickets/[id]` verificar `can(user, "ticket.view", ticket)` en el servidor y devolver 404 si no pasa: "un solicitante que cambie el id en la URL no debe ver un ticket ajeno". Dejar test o prueba anotada en el reporte.
- Julio aplicó las dos migraciones y el seed en el cloud desde el SQL Editor, verificó conteos, puso las variables en Vercel y en `.env.local`, e importó el repo en Vercel (proyecto `cofar-tickets`). Pidió aviso antes de escribir cualquier cosa en la base cloud: "ahí están los datos que va a ver Rodrigo".
- El agente detectó que `SUPABASE_URL` en `.env.local` traía `/rest/v1/` al final; supabase-js necesita la URL base. Lo corrigió en local y lo anotó en el reporte para revisar el valor en Vercel.
- Para no tocar el cloud, las pruebas locales del agente corren con las variables de Supabase local pasadas por línea de comandos, que tienen precedencia sobre `.env.local`.

**Qué hizo el agente sin intervención.**
- Migración `20260922100000_ticket_rpc.sql`: `create_ticket` (copia área y prioridad de la categoría, ubicación del solicitante, inserta ticket y evento `created`) y `apply_ticket_transition` (update con `where status = expected` + evento en la misma transacción; `ticket_state_conflict` si otro actor movió el ticket). Probada por psql: crear, tomar, segundo tomar rechazado, resolver, reabrir, cerrar, errores de ticket y categoría inexistentes.
- `src/domain/events.ts`: esquemas Zod de payloads por tipo de evento y `buildTransitionEvent`, que decide si una transición emite `taken`, `released` o `status_changed`. 12 tests nuevos (98 en total).
- `src/lib/db/tickets.ts` (lecturas con Zod sobre filas y wrappers de RPC) y `src/lib/actions/tickets.ts` (crear y transicionar: sesión, Zod, `can()`, `validateTransition`, RPC).
- Layout con navegación gateada por `can()`, `/tickets`, `/tickets/new` (categorías agrupadas por área con su prioridad), `/tickets/[id]` con línea de tiempo y acciones genéricas según `allowedTransitions`, reutilizables por agentes en fase 3.
- `npm run build` agregado al CI.

**Decisiones del agente durante la fase.**
- `/tickets/[id]` devuelve el mismo 404 para "no existe" y "no es tuyo", para no revelar que el id existe. Probado en Chrome como Rodrigo con un ticket de Carolina.
- Detección de página desactualizada: el formulario de acción envía el estado que el usuario vio (`from`). Si difiere del actual, la action devuelve "El ticket cambió mientras lo veías" y refresca. La guarda de la RPC queda como segunda línea para la carrera entre lectura y escritura. Primera versión devolvía "cambio no válido", que era engañoso; corregido tras probarlo con un tomar concurrente por psql.
- Errores de validación del formulario con `useActionState`, sin perder lo escrito.

**Verificación.**
- 98 tests, lint, typecheck y build en verde.
- Chrome, base local, como Rodrigo: lista de mis tickets, 404 en ticket ajeno, crear TK-0045 (prioridad alta y área TI desde la categoría, ubicación Farmacia desde el usuario), cancelar, reabrir TK-0033 con motivo (mantiene a Felipe asignado), confirmar y cerrar, y conflicto de concurrencia en TK-0040.
- Cloud, solo lectura: login y lista de Rodrigo con 18 tickets. Sin escrituras.

**Cierre de la fase (revisión de Julio).** PR #2 aprobado y mergeado sin cambios. Observaciones:
- `events.ts` define `parseEventPayload` pero la línea de tiempo no lo usa. Julio: conectarlo en la fase 4, donde el SLA va a leer esos payloads.
- Julio desactiva Deployment Protection en Vercel para que el revisor abra la URL sin cuenta. Pide documentar en README y DECISIONS.md que, con auth simulada y link público, cualquiera puede entrar como cualquier usuario de prueba, y que la versión real iría con SSO.

---

## Fase 3 · Vistas del agente

**Qué se pidió.** Plan antes de escribir código.

**Dudas del agente y respuesta de Julio (antes de escribir código).**
1. Cola del área: incluye todo lo no terminal, con los resueltos al final.
2. Cambio de prioridad: solo desde el detalle, donde el motivo tiene contexto.

**Agregados de Julio.**
- Columna de ubicación en la cola: "el mismo problema no pesa igual en la farmacia que en la oficina, y el dato ya está en el ticket".
- La migración 3 revoca execute a `anon` y `authenticated`, igual que las RPC de la fase 2.
- Julio aplicó la migración 3 en el cloud y verificó que las tres RPC quedan solo con postgres y service_role.

**Qué hizo el agente sin intervención.**
- Migración `20260922200000_priority_rpc.sql`: `change_ticket_priority` con guarda `where priority = expected and status in (open, in_progress, waiting)`, evento `priority_changed` con `{from, to, reason}`, rechazo de prioridad igual y de motivo vacío. Probada por psql.
- Al revisar los grants, el agente detectó que el `revoke ... from anon, authenticated` de la fase 2 era cosmético: Postgres da `execute` a `PUBLIC` por defecto y `anon` podía llamar a `create_ticket` por REST (RLS sin políticas lo dejaba sin efecto, pero la función respondía). La migración 3 revoca a `PUBLIC` para las tres RPC y concede solo a `service_role`. Verificado: `anon` por REST recibe "permission denied".
- `src/domain/queue.ts`: orden de la cola (sin dueño, prioridad, antigüedad; resueltos al final) con 5 tests. 103 en total.
- `listQueue(areaId | null)`, `listTicketsByAssignee`, wrapper de la RPC, `changePriorityAction` con el mismo patrón que las demás actions, incluida la detección de página desactualizada por prioridad vista.
- `/queue` (cola del área o de todas si el supervisor no tiene área, con columna de área en ese caso), `/assigned`, componente `TicketTable` compartido, formulario de prioridad en el detalle, links en la navegación gateados por `can()`.
- README: nota sobre auth simulada y link público.

**Verificación en Chrome, base local.**
- Rodrigo (solicitante) recibe 404 en `/queue`.
- Matías: cola de TI con 7 activos, 2 sin dueño, ordenados como pide el dominio. Toma TK-0036, lo pone en espera con motivo, baja la prioridad a media con motivo estando en espera, retoma.
- Valentina: sobre el ticket de Matías no ve soltar ni transiciones, sí puede cambiar prioridad. "Mis asignados" muestra sus 3 tickets.
- Paula: cola de todas las áreas (12 activos) con columna de área. En el detalle solo "Soltar" y prioridad. Suelta el ticket: evento `released` con el `assignee_id` de Matías como payload y actor Paula.
- Matías vuelve a tomar y resuelve con nota. "Mis asignados" lo muestra como resuelto.
- Los 8 eventos del recorrido quedaron en `ticket_events` con los payloads esperados.
- No se escribió nada en el cloud durante la fase.

**Cierre de la fase (revisión de Julio).** PR #3 aprobado y mergeado sin cambios. Dos observaciones menores para la fase 5: limpiar el espacio al inicio de una línea del README, y evaluar si `/assigned` debería protegerse con algo más directo que `can(user, "ticket.take")`.

---

## Fase 4 · SLA, indicadores y dashboard

**Qué se pidió.** Plan antes de escribir código. Además de lo del BRIEF: conectar `parseEventPayload` en la lectura de eventos (pendiente de la fase 2); el cálculo de SLA desde los eventos descontando los tramos en `waiting`, como función pura con tests ("ese es el corazón de la fase"); y cambiar el segundo criterio de `sortQueue` al SLA más comprometido.

**Dudas del agente y respuesta de Julio (antes de escribir código).**
1. El tramo entre resuelto y reabierto cuenta como tiempo consumido.
2. El tiempo medio de resolución del dashboard es neto, el mismo que mide el SLA.

**Corrección de Julio a un supuesto del agente.** El agente propuso calcular el objetivo con la prioridad actual del ticket. Julio: "rompe la auditabilidad: cambiar la prioridad reescribe el pasado y un ticket puede vencer o dejar de estar vencido por horas que corrieron bajo otro plazo". Se acumula por tramos: cada tramo de prioridad se mide contra su propio objetivo, usando los eventos `priority_changed` (que traen `from`, `to` y fecha). Si eso toma más de 20 minutos extra sobre el estimado, parar y avisar.

**Agregados de Julio.** En las tablas mostrar la fecha límite además del porcentaje ("un supervisor necesita saber para cuándo"). En el detalle mostrar cuánto tiempo se descontó por esperas ("es lo que hace visible la regla").

**Qué hizo el agente sin intervención.**
- `src/domain/sla.ts`: `resolveTargets` (política del área sobre la por defecto) y `computeSla`, que recorre los eventos ordenados manteniendo prioridad vigente y estado de espera, acumula `Σ activo/objetivo` por tramo de prioridad, descuenta esperas, detiene el reloj en la última resolución y calcula la fecha límite (pasada o futura) como el instante en que la razón llega a 1. Pausado cuando está en espera. 18 tests, incluidos los tres casos de tramos: bajar prioridad no des-vence, subir prioridad acorta el resto, cambiar prioridad en espera no consume.
- `src/domain/metrics.ts`: agregaciones del dashboard, 6 tests. `sortQueue` con razón de SLA como segundo criterio, tests ajustados. 127 tests en total.
- `parseEventPayload` conectado en `toEventView`, que usan la línea de tiempo y la lectura por lotes. Parse estricto.
- `listEventsForTickets` (una consulta para N tickets), `listSlaPolicies`, `listTicketsForDashboard`; `src/lib/sla.ts` une tickets, eventos y políticas fuera del dominio.
- Columnas SLA y Límite en las tres listas; panel SLA en el detalle con objetivo, consumido, descontado por esperas y límite o reloj detenido; `/dashboard` con el alcance del supervisor.

**Decisiones del agente durante la fase.**
- La fecha límite de un ticket vencido es la que tuvo, no se recalcula. Un ticket en espera muestra "Pausado" en vez de una fecha, porque el límite se mueve mientras espera.
- Un ticket detenido dentro del objetivo muestra "Cumplido" en lugar de "En plazo".
- El color de la fecha límite usa el estado del dominio, no `Date.now()` en el render (regla de pureza de React lo rechazaba).
- Tiempo extra por los tramos de prioridad: unos 10 minutos, dentro del margen de 20 que dio Julio.

**Verificación en Chrome, base local, como Paula.**
- Dashboard de todas las áreas: 12 activos, 4 sin dueño, 32 resueltos en 30 días, tiempo medio 14,2 h, cumplimiento 84 %, 4 vencidos y 2 en riesgo. Coincide con los escenarios diseñados en el seed (TK-0036, TK-0037, TK-0034, TK-0043 vencidos; TK-0038 y TK-0040 en riesgo).
- TK-0021 (cambio de alta a media en el seed): 0,75 h en alta y 6 h en media dan 44 %, cumplido. TK-0039 en espera: 15 h consumidas, 35,3 h descontadas, límite pausado.
- Cola ordenada por SLA dentro de cada grupo, resueltos al final con "Cumplido".
- No se escribió nada en el cloud.

**Cierre de la fase (revisión de Julio).** PR #4 aprobado y mergeado sin cambios.

---

## Fase 5 · Documentos finales

**Qué se pidió.** DECISIONS.md, AI-USAGE.md, TESTING.md y README final, armados desde este log y los reportes de PR. Sin test end-to-end: documentar en TESTING.md qué se probó, qué no y con qué criterio. Agregar a DECISIONS.md que mostrar el SLA al solicitante fue una decisión de producto (transparencia sobre el compromiso). Para la pregunta de escala (50.000 tickets/mes y 5 áreas) Julio entregó su propia bajada, que el agente desarrolla con datos del código. Pendientes de la fase 3: espacio inicial en el README y evaluar la protección de `/assigned`.

**Qué hizo el agente.**
- DECISIONS.md con las siete secciones: modelo de datos, máquina de estados y permisos, SLA (incluida la decisión de producto de mostrarlo al solicitante y los tramos de prioridad), opcionales, auth simulada y link público, escala a 50.000 tickets/mes y 5 áreas desarrollando la bajada de Julio con los nombres de las funciones y tablas que rompen primero, y la deuda asumida.
- TESTING.md: criterio, tabla de los 127 tests por módulo, lo probado a mano por `psql` y en Chrome con evidencia, lo no probado y por qué, siguientes pasos.
- AI-USAGE.md armado desde este log: herramientas, estructura del contexto, ciclo por fase, qué se delegó, dónde intervino Julio con sus palabras, qué se rechazó, qué detectó el agente solo, qué funcionó y qué no.
- README final con recorrido sugerido, orden de los cuatro archivos SQL para el cloud y mapa del repo.
- Pendientes de la fase 3: espacio inicial del README eliminado; `/assigned` se mantiene con `can(user, "ticket.take")` con comentario en el código y la evaluación en DECISIONS.md §7 (agregar `assigned.view` cambiaría la lista cerrada de acciones del BRIEF).
- Interpretación de dos erratas en la bajada de escala de Julio: "elente de verdad" como "el evento como fuente de verdad" y "aparecen los pson los candidatos" como "aparecen los patrones, y los patrones son los candidatos".
