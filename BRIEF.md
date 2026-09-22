# BRIEF · Sistema de tickets v1 (ejercicio técnico Cofar)

Este documento define QUÉ se construye y las decisiones ya tomadas. El CÓMO se trabaja está en CLAUDE.md.
Si algo de este brief no calza con lo que encuentras al implementar, no lo resuelvas solo: para y pregunta.

---

## 1. Contexto

### 1.1 El problema
Una organización de ~800 personas gestiona sus solicitudes de soporte por correo y planillas. Nadie sabe cuántas solicitudes hay abiertas, cuánto demoran ni quién las tiene.

### 1.2 El negocio
La organización es Cofar Salud (cofar.cl), una farmacia con venta física y online. El catálogo tiene del orden de 3.000 productos entre suplementos, dermocosmética y medicamentos, con foco en medicamentos de especialidad (oncológicos, VIH, fertilidad, refrigerados, salud mental, diabetes). Hay medicamentos con receta simple y retenida, y productos que requieren cadena de frío entre 2 y 8 °C.

Por qué la farmacia física es crítica. En Chile el comercio electrónico de medicamentos no es un negocio independiente. Es un servicio que solo puede prestar una farmacia o almacén farmacéutico con autorización sanitaria de funcionamiento, y requiere además una autorización específica del ISP (Instituto de Salud Pública), regulada en el Decreto Supremo N°466. Los medicamentos se almacenan en la farmacia y desde ahí se despachan, y la farmacia opera con un químico farmacéutico como director técnico.

En corto: **sin farmacia autorizada y operando no hay e-commerce.** Una falla que compromete la operación de la farmacia, la conservación de medicamentos o el canal online no es un problema de soporte más. Puede detener la venta completa o dejar a la organización fuera de norma.

### 1.3 Consecuencias para el diseño
- No todas las solicitudes pesan lo mismo, y esa criticidad la conoce el catálogo de categorías, no el solicitante. Cada categoría trae una prioridad por defecto (secciones 7 y 8).
- El ticket registra la ubicación del solicitante (oficina, farmacia, bodega), porque el mismo problema no tiene el mismo impacto en cada lugar.
- El catálogo de productos (suplementos, medicamentos y sus subcategorías) es dato del ERP, no de este sistema. Las categorías de este sistema son tipos de solicitud de soporte. No se mezclan.
- Este sistema no gestiona cumplimiento sanitario (libros de control, recetas retenidas, trazabilidad de despacho). Solo registra y hace visibles los problemas que afectan esas operaciones.

### 1.4 Arquitectura objetivo
La organización planea un ERP como núcleo y, alrededor de él, una capa de productos de software propios que resuelven lo que el ERP no cubre. Esos productos se construirán con desarrollo asistido por IA (co-desarrollo con agentes). Este sistema de tickets es el primero de esa capa: un producto complementario al ERP, no un módulo del ERP ni una app aislada.

Consecuencias para v1:
- El ERP será la fuente de los datos maestros. Usuarios, ubicaciones y áreas tienen una columna `external_ref` nullable para sincronizarse después. Este sistema no duplica lo que el ERP ya resuelve.
- La lógica de dominio vive en `src/domain`, en funciones puras sin dependencia de Next.js ni de Supabase, para que pueda extraerse como servicio cuando la capa crezca.
- El log de eventos es inmutable y limpio. Es la base para métricas hoy y para automatizaciones mañana.
- La forma de trabajar (BRIEF, CLAUDE.md, fases con PR y revisión humana, registro de uso de IA) es parte del entregable. Es la misma que usaría la célula de desarrollo para construir los siguientes productos de la capa.
- No se construye ninguna integración en v1.

## 2. Qué evalúa el ejercicio

Cómo se toman decisiones de producto, arquitectura y delivery, y cómo se trabaja con agentes de IA. No se evalúa diseño visual ni volumen de código. Presupuesto total: 4 a 5 horas de ejecución. Lo que no quepa se deja fuera y se documenta.

## 3. Alcance

### Mínimo obligatorio
1. Un solicitante crea un ticket (título, descripción, categoría).
2. Un agente ve la cola, toma un ticket y cambia su estado.
3. Trazabilidad: se sabe qué pasó con un ticket y cuándo.
4. Perfiles con vistas distintas.

### Opcionales elegidos (máximo dos)
- **Dashboard de métricas.** Responde directo al dolor ("cuántas hay, cuánto demoran, quién las tiene").
- **SLA por prioridad.** Da un objetivo contra el cual medir el tiempo.

Ambos se calculan sobre el log de eventos. La arquitectura rinde dos veces.

### Opcionales descartados (se justifican en DECISIONS.md)
- Categorización automática con IA. Sin datos históricos no hay contra qué calibrarla, obliga al revisor a configurar una API key y es mejor medir primero y automatizar después. El log de eventos es la base para hacerlo en v2.
- Comentarios. Los estados que requieren contexto (en espera, resuelto, reabierto) piden un motivo corto que queda en el evento. Cubre lo esencial sin construir un hilo de conversación.
- Adjuntos, notificaciones, reasignación, búsqueda y filtros. No atacan el dolor principal en v1.
- Captura por Slack o correo. El ticket tiene un campo `source` (v1 solo `web`). La captura queda independiente del canal para agregarlos después.

## 4. Stack

- Next.js (App Router) + TypeScript. Mismo framework que usa hoy cofar.cl y que pide el perfil del cargo.
- Supabase (Postgres). Migraciones SQL en `supabase/migrations`, seed en `supabase/seed.sql`
- Zod para validación en los bordes
- Vitest para tests
- Tailwind para la UI, sin esfuerzo de diseño
- GitHub Actions: lint, typecheck y tests en cada PR
- Deploy en Vercel, proyecto nuevo, subdominio `cofar-tickets.relevostudio.com`
- Código en inglés, interfaz en español

## 5. Perfiles y permisos

| Rol | Qué hace |
|---|---|
| `requester` (solicitante) | Crea tickets y ve solo los suyos. Confirma la resolución, reabre o cancela los propios |
| `agent` (agente) | Ve la cola de su área, toma tickets, cambia estados y prioridad de los tickets de su área |
| `supervisor` | Ve todos los tickets de su área (o de todas si `area_id` es null) y el dashboard |

Todos los roles pueden crear tickets.

Reglas:
- Un solo módulo `src/domain/permissions.ts` define las acciones y qué rol puede hacer cada una. La UI pregunta `can(user, action, ticket)`, y el servidor valida lo mismo antes de cada mutación. Esconder un botón no es autorización.
- Acciones: `ticket.create`, `ticket.view`, `queue.view`, `ticket.take`, `ticket.release`, `ticket.transition`, `ticket.set_priority`, `ticket.confirm`, `ticket.reopen`, `ticket.cancel`, `dashboard.view`.
- Agregar un rol nuevo debe ser agregar una entrada al mapa, no tocar pantallas.

## 6. Autenticación (simulada)

- Pantalla de entrada con los usuarios precargados, agrupados por rol. Se elige uno y queda en una cookie de sesión.
- El servidor lee la cookie, carga el usuario y su rol en cada request.
- Todo acceso a la base ocurre en el servidor (route handlers o server actions) con la service role key. El cliente nunca habla directo con Supabase. RLS habilitado en todas las tablas sin políticas públicas.
- En DECISIONS.md: la versión real va con SSO corporativo y RLS sobre el JWT.

## 7. Modelo de datos

- `areas` (id, name, slug, external_ref)
- `categories` (id, area_id, name, default_priority, active). La categoría pertenece a un área. Elegir la categoría enruta el ticket al área correcta y define su prioridad inicial.
- `locations` (id, name, type: `office` | `pharmacy` | `warehouse`, external_ref)
- `users` (id, name, email, role, area_id nullable, location_id, external_ref)
- `sla_policies` (id, priority, area_id nullable, resolution_hours). Null en area_id significa política por defecto.
- `tickets` (id, code tipo `TK-0001`, title, description, category_id, area_id, location_id, requester_id, assignee_id nullable, status, priority, source, created_at, updated_at, resolved_at, closed_at)
- `ticket_events` (id, ticket_id, actor_id, type, from_status, to_status, payload jsonb, created_at). Solo inserción, nunca update ni delete.

`area_id` en tickets se copia desde la categoría al crear, para que un cambio de catálogo no mueva tickets históricos.

Tipos de evento: `created`, `taken`, `released`, `status_changed`, `priority_changed`.

### Atomicidad y concurrencia
- La validación de la transición vive en TypeScript (`src/domain/stateMachine.ts`), fuente única de las reglas.
- La escritura va por una función SQL (RPC) que actualiza el ticket e inserta el evento en la misma transacción, con guarda de estado esperado (`where status = expected_status`). Si dos agentes toman el mismo ticket, el segundo recibe un error claro, no pisa al primero.

## 8. Máquina de estados

| Desde | Hacia | Quién | Requiere |
|---|---|---|---|
| `open` | `in_progress` | agente del área (tomar) | asigna al agente |
| `in_progress` | `open` | asignado o supervisor (soltar) | quita el asignado |
| `in_progress` | `waiting` | asignado | motivo |
| `waiting` | `in_progress` | asignado | nada |
| `in_progress` | `resolved` | asignado | nota de resolución |
| `resolved` | `closed` | solicitante dueño (confirmar) | nada |
| `resolved` | `in_progress` | solicitante dueño (reabrir) | motivo |
| `open` | `cancelled` | solicitante dueño | nada |

Por qué estos estados:
- `open` sin dueño es la cola. Responde "quién la tiene": nadie.
- `waiting` existe para pausar el reloj del SLA cuando se espera al solicitante. Sin él, el SLA castiga al agente por demoras ajenas.
- `resolved` y `closed` se separan porque quien da por terminado el problema es el solicitante, no el agente.
- `closed` y `cancelled` son terminales.

Prioridad: `high`, `medium`, `low`. El solicitante no la elige (todo sería urgente). Al crear, el ticket toma la `default_priority` de su categoría. El agente o el supervisor la ajusta si el caso lo amerita, y el cambio queda como evento `priority_changed` con motivo. El evento `created` registra que la prioridad vino del catálogo.

## 9. SLA

- Objetivo de resolución por prioridad, en horas corridas: alta 4, media 24, baja 72. Valores en `sla_policies`, no en código.
- Tiempo consumido = tiempo desde la creación hasta la resolución, descontando los tramos en `waiting`. Se calcula desde los eventos en una función pura `src/domain/sla.ts`.
- Estados SLA por ticket: en plazo, en riesgo (sobre 75% consumido), vencido.
- Horas hábiles y SLA de primera respuesta quedan como deuda documentada.

## 10. Vistas

- **Solicitante.** Crear ticket. Mis tickets con estado y SLA. Detalle con línea de tiempo de eventos y acciones de confirmar, reabrir o cancelar.
- **Agente.** Cola de su área (sin dueño primero, luego por SLA más comprometido). Mis tickets asignados. Detalle con línea de tiempo y acciones según estado.
- **Supervisor.** Todo lo del área. Dashboard con: tickets abiertos por estado, sin dueño, carga por agente, tiempo medio de resolución (últimos 30 días), cumplimiento de SLA y tickets vencidos o en riesgo.

## 11. Seed

Datos creíbles para una farmacia con e-commerce, para que la demo tenga vida. Los nombres de categorías son supuestos razonables, no el catálogo real de la organización.
- Áreas: TI y Mantención e infraestructura.
- Categorías TI (prioridad por defecto): E-commerce, sitio o pedidos online (alta), Caja y POS de farmacia (alta), Sistemas de recetas y trazabilidad (alta), Sistemas corporativos (media), Accesos y contraseñas (media), Computador o impresora (baja).
- Categorías Mantención (prioridad por defecto): Refrigeración de medicamentos (alta), Electricidad e iluminación (media), Climatización (media), Infraestructura del local (baja).
- Ubicaciones: oficina central, farmacia, bodega.
- Usuarios: 3 solicitantes (oficina, farmacia, bodega), 3 agentes (2 TI, 1 Mantención), 1 supervisora con acceso a todas las áreas.
- Unos 40 tickets repartidos en los últimos 30 días, con eventos coherentes con la máquina de estados (algunos vencidos, algunos en espera, algunos cerrados), para que el dashboard muestre algo real.

## 12. Fases

Cada fase es una rama y un PR. No se parte la siguiente sin aprobación.

| Fase | Contenido | Estimado |
|---|---|---|
| 1 | Esqueleto Next.js, migraciones, seed, sesión simulada, `permissions.ts`, `stateMachine.ts` con tests, CI, plantilla de PR, README inicial | 1,5 h |
| 2 | Vistas del solicitante (crear, mis tickets, detalle con línea de tiempo) y la RPC de transición | 1 h |
| 3 | Vistas del agente (cola, tomar, soltar, transiciones, prioridad) | 1 h |
| 4 | `sla.ts` con tests, indicadores SLA en listas y dashboard del supervisor | 1 h |
| 5 | DECISIONS.md, AI-USAGE.md, TESTING.md y README final, armados desde docs/ai-log.md y los reportes | 0,5 h |

## 13. Entregables finales

1. Repo con instrucciones para levantarlo (Supabase local con `supabase start` o proyecto cloud) y URL desplegada.
2. DECISIONS.md: modelo de datos y por qué, máquina de estados y por qué, opcionales descartados y criterio, qué se rompería o rediseñaría a 50.000 tickets al mes y 5 áreas, deuda técnica asumida.
3. AI-USAGE.md: herramientas, cómo se estructuró el contexto (BRIEF, CLAUDE, reportes), qué se delegó completo, dónde se intervino y por qué, qué salidas se rechazaron. Sale de docs/ai-log.md, no se reconstruye de memoria.
4. TESTING.md: qué se probó, qué no y cómo se decidió dónde poner el esfuerzo.

## 14. Estrategia de calidad (base para TESTING.md)

- Se prueba el núcleo de dominio, que es donde está el riesgo: tabla completa de transiciones permitidas y prohibidas, matriz de permisos por rol, cálculo de SLA con pausas.
- No se prueban componentes de UI ni la RPC contra una base real en v1. Se documenta como decisión.
- Si al cierre de la fase 4 van menos de 4 horas, se agrega un test end-to-end del camino feliz (crear, tomar, resolver, confirmar). Si no, se documenta como siguiente paso.
