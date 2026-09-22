# TESTING · Qué se probó, qué no y por qué

## Criterio

El riesgo está en el dominio: transiciones, permisos, SLA y métricas deciden qué puede pasar y qué se le muestra a quién. Ahí van los tests automáticos. La interfaz es delgada (server components que llaman a funciones de dominio y a tres RPC) y el presupuesto era de 4 a 5 horas, así que se probó a mano en el navegador siguiendo un guion por fase, y se documentó.

## Qué se probó automáticamente

127 tests con Vitest, todos sobre `src/domain`, sin Next.js ni Supabase. Corren en cada PR (`npm test`) junto con lint, typecheck y build.

| Módulo | Tests | Qué cubren |
|---|---|---|
| `stateMachine.test.ts` | 48 | La tabla completa: las 36 combinaciones desde/hacia (8 permitidas, 28 prohibidas), actor, motivo requerido y efecto sobre el asignado de cada transición, `validateTransition` con motivo faltante o en blanco |
| `permissions.test.ts` | 38 | Matriz rol × acción, y `can()` con ticket: dueño, asignado, agente de otra área, supervisor con área y sin área, cada acción en cada estado relevante |
| `events.test.ts` | 12 | Qué evento emite cada transición (`taken`, `released`, `status_changed`), motivo recortado u omitido, esquemas de payload aceptan lo que producen seed y RPC y rechazan lo malformado |
| `sla.test.ts` | 18 | Política de área sobre la por defecto; reloj corriendo sin pausas, con una y varias pausas, en espera ahora; umbrales exactos de 75 % y 100 %; reloj detenido en la última resolución; reabierto; cancelado sin SLA; tramos de prioridad: bajar no des-vence, subir acorta el resto, cambiar en espera no consume |
| `metrics.test.ts` | 6 | Abiertos por estado, sin dueño, carga por agente, ventana de 30 días, tiempo medio y cumplimiento, vencidos y en riesgo, caso vacío |
| `queue.test.ts` | 5 | Sin dueño primero, luego SLA más comprometido, luego antigüedad; resueltos al final; no muta la entrada |

## Qué se probó a mano, con evidencia en `docs/ai-log.md`

**Las RPC contra Postgres local, por `psql`**, al escribir cada migración:
- `create_ticket`: copia área y prioridad de la categoría, ubicación del solicitante, evento `created`; categoría inexistente rechazada.
- `apply_ticket_transition`: tomar, segundo tomar concurrente rechazado con `ticket_state_conflict`, resolver, reabrir (mantiene asignado, limpia `resolved_at`), cerrar, ticket inexistente.
- `change_ticket_priority`: cambio con evento, prioridad esperada desactualizada rechazada, prioridad igual rechazada, motivo vacío rechazado, ticket resuelto rechazado.
- Trigger de `ticket_events`: `update` y `delete` fallan. RLS activo en las 7 tablas. `anon` no puede ejecutar ninguna RPC por REST.

**La interfaz en Chrome contra la base local**, un guion por fase con los cuatro roles:
- Fase 1: entrar, salir, redirección sin cookie o con cookie inválida.
- Fase 2 (Rodrigo): mis tickets, crear con prioridad y área derivadas, cancelar, reabrir con motivo, confirmar y cerrar. 404 al pegar el id de un ticket ajeno. Conflicto de concurrencia: tomar el ticket por `psql` con la página abierta y luego intentar cancelar.
- Fase 3 (Matías, Valentina, Paula): 404 en la cola para un solicitante; cola ordenada con ubicación; tomar, esperar, cambiar prioridad en espera, retomar, resolver; una agente no asignada no puede soltar ni transicionar pero sí cambiar prioridad; la supervisora ve las dos áreas y suelta; los 8 eventos quedaron con los payloads esperados.
- Fase 4 (Paula): dashboard con los conteos exactos que el seed diseñó (4 vencidos, 2 en riesgo, 84 % de cumplimiento), un ticket con cambio de prioridad medido por tramos (44 %), un ticket en espera con 35,3 h descontadas y límite pausado.

**Contra el proyecto cloud, solo lectura**: login y lista de tickets de un solicitante, para validar URL y key. No se escribió en la base cloud durante el desarrollo.

## Qué no se probó y por qué

- **Componentes de interfaz.** No se evalúa diseño y la lógica que muestran ya está testeada en el dominio. Un test de render agregaría poco por su costo.
- **Las RPC con un test automatizado contra una base real.** Requeriría levantar Supabase en CI (Docker, unos minutos por corrida). Se probaron a mano por `psql` con los casos listados arriba.
- **Test end-to-end del camino feliz** (crear, tomar, resolver, confirmar). El BRIEF lo condicionaba a cerrar la fase 4 con menos de 4 horas; se cerró en unas 4 h 5 min. El camino está cubierto por los tests de dominio de cada paso y por el guion manual de las fases 2 y 3. Es el siguiente paso.
- **Carga y concurrencia real** (dos navegadores tomando a la vez). La guarda de estado se probó con `psql` en paralelo a la página, no con dos sesiones simultáneas.

## Cómo correr lo automático

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Siguientes pasos, en orden de valor

1. Test end-to-end del camino feliz con Playwright contra Supabase local.
2. Test de las tres RPC contra Postgres en CI, con los mismos casos que hoy se corren por `psql`.
3. Tests de `src/lib/sla.ts` (mapeo de filas a `computeSla`) cuando el SLA pase a columnas derivadas.
