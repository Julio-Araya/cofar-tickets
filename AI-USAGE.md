# AI-USAGE · Cómo se trabajó con agentes de IA

Sale de `docs/ai-log.md`, escrito durante cada fase, y de los reportes de los cuatro PR. No se reconstruye de memoria.

## Herramientas

- **Claude Code** con el modelo Claude Fable 5.1, en terminal, como único ejecutor técnico. Escribió todo el código, el SQL, los tests y los borradores de documentación.
- **Supabase CLI** con Docker para la base local. El agente validó cada migración y el seed ahí antes de pedir que se aplicaran en el cloud.
- **Chrome controlado por el agente** para probar la interfaz con los cuatro roles, sin intervención humana en el navegador.
- **GitHub Actions** (lint, typecheck, test, build) y **Vercel** (preview por PR, producción desde `main`).

## Cómo se estructuró el contexto

Dos archivos fijos y uno vivo.

- **BRIEF.md** define qué se construye y las decisiones ya tomadas: contexto del negocio, alcance, stack, roles, modelo de datos, máquina de estados, SLA, vistas, seed, fases con estimado. Es la fuente de verdad. Cuando algo no calza, el agente para y pregunta.
- **CLAUDE.md** define cómo se trabaja: roles (Julio decide, revisa y mergea; el agente ejecuta), flujo de git (una fase, una rama, un PR; nunca commit a `main`), formato fijo del reporte de fase, reglas técnicas (dominio puro con tests, acceso a datos solo en servidor, eventos en la misma transacción, `can()` antes de cada mutación, Zod en los bordes), secretos, presupuesto de tiempo, y la obligación de registrar en `docs/ai-log.md` cada corrección.
- **docs/ai-log.md** se escribe durante la fase: qué se pidió, dudas y respuestas, correcciones de Julio con sus palabras, qué hizo el agente solo, supuestos, problemas, verificación, enfoques descartados. Al inicio de cada sesión el agente lo lee para saber dónde va.

Además, `.claude/settings.json` niega al agente `git push` a `main`, `gh pr merge` y `supabase db push`. El límite no depende de que el agente lo recuerde.

## El ciclo de cada fase

1. El agente lee BRIEF, CLAUDE y el log, y propone un **plan con dudas** en formato fijo: qué encontró, dos o tres opciones con su costo, su recomendación. No escribe código hasta el OK.
2. Julio responde cada duda, corrige supuestos y agrega requisitos. El agente lo registra en el log antes de empezar.
3. El agente implementa en una rama, con commits chicos, y se detiene para pedir a Julio lo que solo Julio puede hacer: aplicar SQL en el cloud, poner variables en Vercel.
4. Valida en local: tests, lint, typecheck, build, RPC por `psql`, guion en Chrome.
5. Abre el PR con el reporte de seis secciones. Julio revisa y mergea. Las observaciones del cierre entran al log y a la fase siguiente.

Cinco fases, cuatro PR de código y uno de documentación, 31 commits, unas 4.000 líneas de código y SQL, 127 tests. Tiempo total de ejecución: alrededor de 4 h 30 min, dentro del tope de 4 a 5 horas.

## Qué se delegó completo

El agente hizo sin intervención, dentro de lo que el BRIEF fijaba:

- Esqueleto, configuración de herramientas, CI, plantilla de PR.
- Las tres migraciones: esquema, RPC de creación y transición, RPC de prioridad. Incluidos triggers, checks, índices y RLS.
- El seed de 44 escenarios explícitos con eventos coherentes y fechas relativas a `now()`.
- Todo `src/domain` y sus 127 tests.
- La capa de datos, las server actions y las vistas de los tres roles.
- Los guiones de prueba en Chrome y su ejecución.
- Los borradores de README, DECISIONS, TESTING y este documento, a partir del log.

## Dónde intervino Julio y por qué

Las correcciones, en orden, con sus palabras cuando las dio.

**Antes de escribir código (respuestas al plan).**
- Node 22 LTS en `engines` y CI en vez del Node local: "Vercel corre LTS".
- `SUPABASE_URL` sin prefijo `NEXT_PUBLIC_`: "el cliente nunca habla con Supabase, no debe estar expuesta al navegador".
- Prioridad editable solo en `open`, `in_progress` y `waiting`, no en `resolved`: "la prioridad define el SLA y en resolved el reloj ya se detuvo".
- Supervisor fiel al BRIEF (no toma ni transiciona): "si un agente falta, el supervisor suelta el ticket y otro agente lo toma, así que no queda bloqueado".
- Seed en plpgsql con escenarios explícitos: "sin aleatoriedad, con fechas relativas a now() para que el dashboard siempre muestre los últimos 30 días".
- Reglas `deny` en `.claude/settings.json`.

**Requisitos agregados durante las fases.**
- 404 en `/tickets/[id]` cuando `can(user, "ticket.view", ticket)` falla: "un solicitante que cambie el id en la URL no debe ver un ticket ajeno".
- Columna de ubicación en la cola: "el mismo problema no pesa igual en la farmacia que en la oficina, y el dato ya está en el ticket".
- Revocar `execute` a `anon` y `authenticated` en la migración 3.
- Fecha límite en las tablas, no solo porcentaje: "un supervisor necesita saber para cuándo".
- Tiempo descontado por esperas visible en el detalle: "es lo que hace visible la regla".
- Documentar que con auth simulada y link público cualquiera entra como cualquier usuario.
- Conectar `parseEventPayload`, que el agente había definido y no usado, en la fase 4.

**La corrección más importante: el SLA por tramos de prioridad.** El agente propuso calcular el objetivo con la prioridad actual del ticket. Julio: "rompe la auditabilidad: cambiar la prioridad reescribe el pasado y un ticket puede vencer o dejar de estar vencido por horas que corrieron bajo otro plazo". La solución acumula por tramos, cada uno contra su objetivo, usando los eventos `priority_changed` que ya traían `from`, `to` y fecha. Costó unos 10 minutos extra, con un tope de 20 fijado de antemano.

**Límites operativos.** Julio aplicó él mismo cada migración y el seed en el cloud desde el SQL Editor, puso las variables en Vercel, creó el proyecto de Vercel y pidió aviso antes de cualquier escritura en la base cloud: "ahí están los datos que va a ver Rodrigo". El agente probó contra el cloud solo en lectura.

## Qué salidas se rechazaron o se corrigieron

- Cinco supuestos del agente en la fase 1 se confirmaron; tres propuestas del plan se corrigieron (Node, variable pública, prioridad en `resolved`).
- Generar el seed con un script TypeScript: descartado por Julio a favor de plpgsql.
- El objetivo de SLA con prioridad actual: rechazado, ver arriba.
- Julio marcó dos deudas que el agente había dado por cerradas al seguir el BRIEF literal: no existe `waiting → open`, y cancelar solo desde `open` deja sin salida a un ticket mal creado ya tomado.

## Qué detectó el agente por su cuenta

- El `revoke` de la fase 2 sobre las RPC era cosmético porque Postgres da `execute` a `PUBLIC`. Lo corrigió en la fase 3 y lo verificó por REST.
- `SUPABASE_URL` en `.env.local` traía `/rest/v1/` al final. Lo corrigió y pidió revisar el valor en Vercel.
- El primer mensaje de conflicto ("cambio no válido") era engañoso. Tras reproducir un tomar concurrente por `psql`, agregó el estado visto como campo oculto y un mensaje que dice lo que pasó.
- El trigger de `updated_at` pisaba las fechas históricas del seed; Docker Desktop no podía montar la carpeta que Studio necesita; el `.gitignore` generado ignoraba `.env.example`. Los tres se resolvieron y documentaron.
- Intentó probar una server action con `curl` a mano, desistió y usó el navegador.

## Lo que funcionó y lo que no

Funcionó: el plan con dudas antes de cada fase. Las correcciones llegaron cuando costaban minutos, no horas. El log escrito en el momento hizo este documento posible. Las reglas `deny` y el flujo de PR dieron un límite claro que el agente no tenía que recordar.

Costó: el agente tiende a dar por resuelto lo que el BRIEF dice literalmente (el supervisor, cancelar desde `open`) sin señalar el hueco. Julio tuvo que declarar esas deudas. Y las pruebas de interfaz en Chrome fueron lentas por clics que no registraban al primer intento; un test end-to-end automatizado sería más barato a la segunda iteración.
