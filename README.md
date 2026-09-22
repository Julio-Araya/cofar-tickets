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

`supabase start` imprime la URL de la API y la `service_role key`. Cópialas en `.env.local`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
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

La autenticación es simulada. En `/login` eliges uno de los usuarios precargados, agrupados por rol:

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
src/lib/           acceso a datos y sesión, solo servidor
src/app/           rutas de Next.js
supabase/          migraciones y seed
docs/ai-log.md     registro de uso de IA por fase
```

## Estado

Fase 1 lista: esqueleto, esquema, seed, sesión simulada, dominio con tests, CI.
Las vistas de solicitante, agente y supervisor llegan en las fases 2 a 4.
