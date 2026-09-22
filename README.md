# Tickets Cofar

Sistema de tickets de soporte interno para Cofar Salud. Ejercicio técnico.
El alcance y las decisiones están en [BRIEF.md](BRIEF.md). La forma de trabajo con agentes de IA está en [CLAUDE.md](CLAUDE.md).

## Stack

Next.js (App Router) + TypeScript, Supabase (Postgres), Zod, Vitest, Tailwind.
Node 22 LTS (`.nvmrc`).

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

En `supabase/config.toml` están apagados Studio, Realtime, Storage, Edge Functions, Analytics e Inbucket: no se usan y acortan el arranque. Studio además necesita que Docker Desktop tenga permiso de compartir la carpeta del repo. Si quieres Studio, habilita ese permiso y pon `enabled = true` en `[studio]`. Para consultar la base sin Studio:

```bash
docker exec -it supabase_db_cofar-tickets psql -U postgres
```

Luego:

```bash
npm run dev               # http://localhost:3000
```

Para volver a un estado limpio con el seed: `npm run db:reset`.

## Usar un proyecto Supabase cloud

1. Crea el proyecto en supabase.com.
2. Aplica `supabase/migrations/*.sql` y luego `supabase/seed.sql` desde el SQL Editor, en ese orden.
3. Pon la URL del proyecto y la `service_role key` en `.env.local` (o en las variables del deploy).

La key de servicio nunca llega al navegador: todo acceso a datos ocurre en el servidor.

## Entrar

La autenticación es simulada y el link desplegado es público (sin Deployment Protection), para que el revisor entre sin cuenta. Eso significa que **cualquiera con la URL puede entrar como cualquier usuario de prueba**. Es aceptable para una demo con datos ficticios; la versión real va con SSO corporativo y RLS sobre el JWT (ver DECISIONS.md).
 En `/login` eliges uno de los usuarios precargados, agrupados por rol:

| Rol | Usuarios | Qué ve |
|---|---|---|
| Solicitante | Carolina Muñoz (oficina), Rodrigo Pérez (farmacia), Andrea Soto (bodega) | Sus tickets |
| Agente | Matías Rojas (TI), Valentina Díaz (TI), Felipe Castro (Mantención) | Cola de su área |
| Supervisora | Paula Fuentes | Todas las áreas y dashboard |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests de dominio con Vitest |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local |

## Estructura

```
src/domain/        lógica pura: tipos, máquina de estados, permisos (con tests)
src/lib/db         consultas y llamadas a las RPC, solo servidor
src/lib/actions    server actions: validan con Zod, preguntan can() y llaman a la RPC
src/lib/           sesión, env, etiquetas
src/app/           rutas de Next.js
supabase/          migraciones y seed
docs/ai-log.md     registro de uso de IA por fase
```

## Deploy (Vercel)

Proyecto `cofar-tickets` importado desde este repo, framework Next.js, Node 22. Variables de entorno:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | URL base del proyecto, `https://<ref>.supabase.co`, sin `/rest/v1` |
| `SUPABASE_SERVICE_ROLE_KEY` | Key `service_role` o `secret` (`sb_secret_...`) |

## Estado

- Fase 1: esqueleto, esquema, seed, sesión simulada, dominio con tests, CI.
- Fase 2: vistas del solicitante (crear, mis tickets, detalle con línea de tiempo y acciones) y RPC de escritura con guarda de concurrencia.
- Fases 3 y 4: vistas del agente, SLA y dashboard del supervisor.
