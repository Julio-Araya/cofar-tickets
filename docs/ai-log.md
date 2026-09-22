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

**Enfoques descartados por el agente durante la fase.**
- Generar el seed con un script TypeScript: descartado por Julio a favor de plpgsql (ver dudas).
- Fuentes de Google en el layout de `create-next-app`: quitadas para no depender de red en build.
