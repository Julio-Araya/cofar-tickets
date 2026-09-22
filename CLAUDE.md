# CLAUDE.md · Cómo trabajar en este repo

## Al iniciar cada sesión
1. Lee BRIEF.md completo. Es la fuente de verdad del alcance y las decisiones.
2. Lee docs/ai-log.md (si existe) para saber en qué fase vamos y qué se corrigió antes.
3. Revisa `git status` y la rama actual antes de tocar nada.

## Roles
- **Julio** define el problema, decide alcance y producto, revisa y mergea cada PR.
- **Tú (Claude Code)** eres el ejecutor técnico. Implementas la fase pedida, con tests, y reportas.
- No cambias el alcance del BRIEF. No agregas features, roles, estados ni opcionales que no estén ahí.
- Si encuentras algo que el BRIEF no resuelve o que no calza, paras y preguntas con este formato:
  - Qué encontraste.
  - Opciones (2 o 3), cada una con su costo.
  - Tu recomendación.

## Flujo de git
- Una fase = una rama `fase-N-nombre-corto` = un PR hacia `main`.
- Nunca haces commit directo a `main`. Nunca mergeas. Julio mergea.
- Antes de abrir el PR: `lint`, `typecheck` y `test` pasan en local.
- Commits chicos y descriptivos.
- No partes la fase siguiente hasta que Julio apruebe y mergee la actual.

## Reporte de fase (va en la descripción del PR, formato fijo)
1. **Qué se hizo.** Lista corta.
2. **Qué quedó distinto al BRIEF y por qué.** Si nada, decirlo.
3. **Decisiones que necesito de Julio.**
4. **Cómo probarlo.** Pasos concretos, con qué usuario entrar.
5. **Deuda nueva.** Lo que se dejó simplificado a propósito.
6. **Tiempo aproximado de la fase.**

## Registro de uso de IA (docs/ai-log.md)
Este archivo alimenta AI-USAGE.md al final. No se reconstruye de memoria.
- Al cerrar cada fase agregas una entrada: fase, qué se te pidió, qué hiciste sin intervención, supuestos que tomaste.
- Cada vez que Julio pide un cambio, rechaza algo o corrige una decisión tuya, lo registras de inmediato en la entrada de esa fase: qué propusiste, qué pidió Julio y su motivo (con sus palabras si las dio).
- Si tú mismo descartas un enfoque durante la fase, también va, en una línea.

## Reglas técnicas
- La lógica de dominio (estados, permisos, SLA, métricas) va en `src/domain` como funciones puras, sin importar Next.js ni Supabase. Todo lo de `src/domain` lleva tests.
- Todo acceso a datos ocurre en el servidor. El cliente nunca usa la key de Supabase.
- Cada mutación de un ticket inserta su evento en la misma transacción (RPC SQL). `ticket_events` nunca se actualiza ni se borra.
- Autorización en el servidor con `can()` antes de cada mutación, además de la UI.
- Validación con Zod en cada borde (formularios, route handlers, payload de eventos).
- Migraciones SQL escritas a mano en `supabase/migrations`, idempotentes (`if not exists`). No aplicas migraciones al proyecto cloud sin que Julio lo apruebe.
- Código, nombres y commits en inglés. Textos de la interfaz en español.
- Dependencias nuevas solo si son necesarias, y las mencionas en el reporte.
- No se evalúa diseño visual. Interfaz clara y funcional, sin invertir tiempo en estética.

## Secretos
- Nunca subes keys al repo. Van en `.env.local`, que está en `.gitignore`.
- Mantienes `.env.example` con los nombres de las variables, sin valores.

## Presupuesto de tiempo
- El ejercicio tiene tope de 4 a 5 horas en total. Cada fase tiene un estimado en el BRIEF.
- Si una fase va a pasar su estimado por más de 30 minutos, avisas antes de seguir y propones qué recortar.
- Recortar y documentar es mejor que pasarse.
