# Tickets Cofar

Sistema de tickets de soporte interno para Cofar Salud. Ejercicio técnico.

- **Demo:** https://tickets-cofar.relevostudio.com (o la URL de producción del proyecto `cofar-tickets` en Vercel)
- **Alcance y decisiones ya tomadas:** [BRIEF.md](BRIEF.md)
- **Decisiones de producto y arquitectura, escala y deuda:** [DECISIONS.md](DECISIONS.md)
- **Cómo se trabajó con agentes de IA:** [AI-USAGE.md](AI-USAGE.md), alimentado por [docs/ai-log.md](docs/ai-log.md)
- **Qué se probó y qué no:** [TESTING.md](TESTING.md)
- **Cómo trabaja el agente en este repo:** [CLAUDE.md](CLAUDE.md)

## Qué hace

- Un solicitante crea un ticket (título, descripción, categoría). La categoría enruta al área y fija la prioridad.
- Un agente ve la cola de su área, toma, pone en espera, retoma, suelta, resuelve y ajusta la prioridad con motivo.
- El solicitante confirma, reabre o cancela los suyos.
- Todo queda en un log de eventos inmutable: línea de tiempo por ticket.
- SLA por prioridad calculado desde los eventos, descontando esperas y por tramos de prioridad. Estado, porcentaje y fecha límite en cada lista.
- Dashboard del supervisor: abiertos por estado, sin dueño, carga por agente, tiempo medio de resolución y cumplimiento de SLA en 30 días, vencidos y en riesgo.

## Stack

Next.js 16 (App Router) + TypeScript, Supabase (Postgres), Zod, Vitest, Tailwind. Node 22 LTS (`.nvmrc`). CI en GitHub Actions. Deploy en Vercel.

## Entrar

La autenticación es simulada y el link desplegado es público, para que el revisor entre sin cuenta. Eso significa que **cualquiera con la URL puede entrar como cualquier usuario de prueba**. Es aceptable para una demo con datos ficticios; la versión real va con SSO corporativo y RLS sobre el JWT (ver DECISIONS.md §5).

En `/login` eliges uno de los usuarios precargados, agrupados por rol:

| Rol | Usuarios | Qué ve |
|---|---|---|
| Solicitante | Carolina Muñoz (oficina), Rodrigo Pérez (farmacia), Andrea Soto (bodega) | Sus tickets con SLA, crear, confirmar, reabrir, cancelar |
| Agente | Matías Rojas (TI), Valentina Díaz (TI), Felipe Castro (Mantención) | Cola de su área, mis asignados, transiciones y prioridad |
| Supervisora | Paula Fuentes | Cola de todas las áreas, soltar, prioridad, dashboard |

Recorrido sugerido: entrar como **Paula** y abrir el Dashboard; como **Matías** tomar TK-0036 desde la Cola; como **Rodrigo** confirmar un ticket resuelto.

## Levantar en local

Requisitos: Node 22, Docker corriendo, [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
npm run db:start          # levanta Postgres local, aplica migraciones y seed
cp .env.example .env.local
```

`supabase start` imprime la URL de la API y la key de servicio (aparece como `Secret` o `service_role`, según la versión del CLI). Cópialas en `.env.local`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<secret / service_role key>
```

Luego `npm run dev` y abre http://localhost:3000. Para volver al seed: `npm run db:reset`.

En `supabase/config.toml` están apagados Studio, Realtime, Storage, Edge Functions, Analytics e Inbucket: no se usan y acortan el arranque. Studio además necesita que Docker Desktop tenga permiso de compartir la carpeta del repo. Para consultar la base sin Studio:

```bash
docker exec -it supabase_db_cofar-tickets psql -U postgres
```

## Usar un proyecto Supabase cloud

1. Crea el proyecto en supabase.com.
2. En el SQL Editor ejecuta, en orden y cada archivo completo: `supabase/migrations/20260922000000_initial_schema.sql`, `supabase/migrations/20260922100000_ticket_rpc.sql`, `supabase/migrations/20260922200000_priority_rpc.sql`, `supabase/seed.sql`. Los cuatro son idempotentes.
3. Pon la URL base del proyecto (`https://<ref>.supabase.co`, sin `/rest/v1`) y la key `service_role` o `secret` en `.env.local` o en las variables del deploy.

La key de servicio nunca llega al navegador: todo acceso a datos ocurre en el servidor.

## Deploy (Vercel)

Proyecto importado desde este repo, framework Next.js, Node 22. Variables de entorno:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | URL base del proyecto, `https://<ref>.supabase.co`, sin `/rest/v1` |
| `SUPABASE_SERVICE_ROLE_KEY` | Key `service_role` o `secret` (`sb_secret_...`) |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` / `typecheck` / `test` / `build` | Lo mismo que corre el CI en cada PR |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local |

## Estructura

```
src/domain/        lógica pura con tests: tipos, máquina de estados, permisos, eventos, SLA, métricas, cola
src/lib/db         consultas y llamadas a las RPC, solo servidor
src/lib/actions    server actions: validan con Zod, preguntan can() y llaman a la RPC
src/lib/           sesión, env, SLA por lote, etiquetas, formato
src/app/           rutas: login, mis tickets, nuevo, detalle, cola, asignados, dashboard
src/components/    tabla de tickets y badges
supabase/          migraciones (esquema, RPC de transición, RPC de prioridad) y seed
docs/ai-log.md     registro de uso de IA por fase
```

## Cómo se construyó

Cinco fases, cada una una rama y un PR revisado y mergeado por Julio: esqueleto y dominio, solicitante y RPC, agente, SLA y dashboard, documentación. El detalle está en AI-USAGE.md.
