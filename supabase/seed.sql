-- Seed data (BRIEF §11). Deterministic: fixed ids, explicit scenarios, no randomness.
-- Ticket dates are relative to now() so the dashboard always shows the last 30 days.
-- Idempotent: master data uses on conflict; tickets are only created on an empty table.

-- ---------------------------------------------------------------------------
-- Areas
-- ---------------------------------------------------------------------------
insert into areas (id, name, slug) values
  ('aa000000-0000-4000-8000-000000000001', 'TI', 'ti'),
  ('aa000000-0000-4000-8000-000000000002', 'Mantención e infraestructura', 'mantencion')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Categories (support request types, not the ERP product catalog)
-- ---------------------------------------------------------------------------
insert into categories (id, area_id, name, default_priority) values
  ('cc000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'E-commerce, sitio o pedidos online', 'high'),
  ('cc000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', 'Caja y POS de farmacia', 'high'),
  ('cc000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001', 'Sistemas de recetas y trazabilidad', 'high'),
  ('cc000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000001', 'Sistemas corporativos', 'medium'),
  ('cc000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', 'Accesos y contraseñas', 'medium'),
  ('cc000000-0000-4000-8000-000000000006', 'aa000000-0000-4000-8000-000000000001', 'Computador o impresora', 'low'),
  ('cc000000-0000-4000-8000-000000000007', 'aa000000-0000-4000-8000-000000000002', 'Refrigeración de medicamentos', 'high'),
  ('cc000000-0000-4000-8000-000000000008', 'aa000000-0000-4000-8000-000000000002', 'Electricidad e iluminación', 'medium'),
  ('cc000000-0000-4000-8000-000000000009', 'aa000000-0000-4000-8000-000000000002', 'Climatización', 'medium'),
  ('cc000000-0000-4000-8000-000000000010', 'aa000000-0000-4000-8000-000000000002', 'Infraestructura del local', 'low')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
insert into locations (id, name, type) values
  ('10000000-0000-4000-8000-000000000001', 'Oficina central', 'office'),
  ('10000000-0000-4000-8000-000000000002', 'Farmacia', 'pharmacy'),
  ('10000000-0000-4000-8000-000000000003', 'Bodega', 'warehouse')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
insert into users (id, name, email, role, area_id, location_id) values
  -- Requesters: one per location
  ('ee000000-0000-4000-8000-000000000001', 'Carolina Muñoz', 'carolina.munoz@cofar.cl', 'requester', null, '10000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000002', 'Rodrigo Pérez', 'rodrigo.perez@cofar.cl', 'requester', null, '10000000-0000-4000-8000-000000000002'),
  ('ee000000-0000-4000-8000-000000000003', 'Andrea Soto', 'andrea.soto@cofar.cl', 'requester', null, '10000000-0000-4000-8000-000000000003'),
  -- Agents: 2 TI, 1 Mantención
  ('ee000000-0000-4000-8000-000000000004', 'Matías Rojas', 'matias.rojas@cofar.cl', 'agent', 'aa000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000005', 'Valentina Díaz', 'valentina.diaz@cofar.cl', 'agent', 'aa000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000006', 'Felipe Castro', 'felipe.castro@cofar.cl', 'agent', 'aa000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002'),
  -- Supervisor with access to all areas
  ('ee000000-0000-4000-8000-000000000007', 'Paula Fuentes', 'paula.fuentes@cofar.cl', 'supervisor', null, '10000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- SLA policies (default, area_id null). Hours are calendar hours.
-- ---------------------------------------------------------------------------
insert into sla_policies (id, priority, area_id, resolution_hours) values
  ('51a00000-0000-4000-8000-000000000001', 'high', null, 4),
  ('51a00000-0000-4000-8000-000000000002', 'medium', null, 24),
  ('51a00000-0000-4000-8000-000000000003', 'low', null, 72)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tickets: explicit scenarios replayed through the state machine.
--
-- Each scenario: category key, requester key, hours ago it was created,
-- title, and a list of steps "verb:hours[:arg]" where hours is the delay
-- after the previous step. Verbs:
--   take:h:agent      open -> in_progress (assign agent)
--   release:h         in_progress -> open (unassign)
--   wait:h            in_progress -> waiting (reason)
--   resume:h          waiting -> in_progress
--   resolve:h         in_progress -> resolved (note)
--   close:h           resolved -> closed
--   reopen:h          resolved -> in_progress (reason)
--   cancel:h          open -> cancelled
--   prio:h:priority   priority_changed (by the assignee)
-- ---------------------------------------------------------------------------

-- Keep historical updated_at values: the trigger would overwrite them with now().
alter table tickets disable trigger tickets_set_updated_at;

do $$
declare
  cat_ecommerce  constant uuid := 'cc000000-0000-4000-8000-000000000001';
  cat_pos        constant uuid := 'cc000000-0000-4000-8000-000000000002';
  cat_recetas    constant uuid := 'cc000000-0000-4000-8000-000000000003';
  cat_corp       constant uuid := 'cc000000-0000-4000-8000-000000000004';
  cat_accesos    constant uuid := 'cc000000-0000-4000-8000-000000000005';
  cat_pc         constant uuid := 'cc000000-0000-4000-8000-000000000006';
  cat_frio       constant uuid := 'cc000000-0000-4000-8000-000000000007';
  cat_elec       constant uuid := 'cc000000-0000-4000-8000-000000000008';
  cat_clima      constant uuid := 'cc000000-0000-4000-8000-000000000009';
  cat_infra      constant uuid := 'cc000000-0000-4000-8000-000000000010';

  carolina constant uuid := 'ee000000-0000-4000-8000-000000000001';
  rodrigo  constant uuid := 'ee000000-0000-4000-8000-000000000002';
  andrea   constant uuid := 'ee000000-0000-4000-8000-000000000003';
  matias   constant uuid := 'ee000000-0000-4000-8000-000000000004';
  valentina constant uuid := 'ee000000-0000-4000-8000-000000000005';
  felipe   constant uuid := 'ee000000-0000-4000-8000-000000000006';

  -- scenario table: (category, requester, hours_ago, title, description, steps)
  scenarios constant text[][] := array[
    -- Closed within SLA / late, spread over 30 days
    [cat_ecommerce::text, rodrigo::text, '700', 'Pedidos online no llegan al sistema de la farmacia', 'Desde las 9:00 no aparecen pedidos web nuevos en la pantalla de preparación.', 'take:0.5:matias,resolve:2,close:5'],
    [cat_pos::text, rodrigo::text, '690', 'POS caja 2 se reinicia al cobrar con tarjeta', 'Al pasar tarjeta el POS se reinicia y hay que repetir la venta. Solo caja 2.', 'take:1:valentina,resolve:6,close:20'],
    [cat_frio::text, rodrigo::text, '680', 'Alarma de temperatura en refrigerador de oncológicos', 'El refrigerador marca 9,5 °C hace 20 minutos. Trasladamos productos al respaldo.', 'take:0.25:felipe,resolve:1.5,close:3'],
    [cat_accesos::text, carolina::text, '660', 'No puedo entrar al correo corporativo', 'Me pide cambiar la contraseña y luego dice que la nueva no cumple la política.', 'take:3:matias,resolve:2,close:30'],
    [cat_pc::text, carolina::text, '650', 'Impresora de finanzas atasca papel', 'La impresora del segundo piso atasca hojas cada 3 o 4 impresiones.', 'take:20:valentina,resolve:30,close:48'],
    [cat_elec::text, andrea::text, '640', 'Se cortó la luz en pasillo de bodega', 'El pasillo C quedó sin iluminación. Trabajamos con linternas.', 'take:2:felipe,wait:1,resume:10,resolve:4,close:12'],
    [cat_corp::text, carolina::text, '620', 'Error al cerrar el mes en contabilidad', 'El módulo de cierre muestra "Error interno" al confirmar el periodo.', 'take:5:matias,resolve:30,close:10'],
    [cat_clima::text, rodrigo::text, '600', 'Aire acondicionado de sala de venta no enfría', 'La sala está sobre 27 °C. Los clientes se quejan y el personal también.', 'take:4:felipe,resolve:15,close:24'],
    [cat_ecommerce::text, carolina::text, '590', 'Descuento de campaña no se aplica en el carrito', 'El cupón DERMO20 muestra error de vigencia aunque la campaña está activa.', 'take:0.5:valentina,wait:0.5,resume:24,resolve:1,close:2'],
    [cat_infra::text, andrea::text, '570', 'Puerta de bodega no cierra bien', 'La puerta de acceso de camiones queda con juego y no traba.', 'take:24:felipe,resolve:60,close:72'],
    [cat_pos::text, rodrigo::text, '550', 'Boleta impresa sale en blanco', 'La impresora térmica de caja 1 saca boletas en blanco.', 'cancel:2'],
    [cat_accesos::text, andrea::text, '540', 'Acceso al sistema de inventario para nueva persona', 'Se integró un operador nuevo y necesita usuario de inventario.', 'take:1:valentina,resolve:0.5,close:1'],
    [cat_recetas::text, rodrigo::text, '520', 'No se puede registrar receta retenida', 'Al guardar la receta el sistema dice que el folio ya existe.', 'take:0.5:matias,resolve:2,reopen:3,resolve:1,close:4'],
    [cat_pc::text, andrea::text, '500', 'Computador de recepción muy lento', 'Demora más de 5 minutos en abrir el sistema de recepción de mercadería.', 'take:10:valentina,resolve:5,close:100'],
    [cat_frio::text, andrea::text, '480', 'Refrigerador de bodega con puerta que no sella', 'La goma de la puerta está suelta y la temperatura sube al abrir.', 'take:0.5:felipe,resolve:3,close:1'],
    [cat_corp::text, carolina::text, '460', 'Reporte de ventas diario no se genera', 'El reporte automático de las 8:00 no llegó hoy ni ayer.', 'take:2:valentina,wait:2,resume:40,resolve:3,close:5'],
    [cat_ecommerce::text, carolina::text, '440', 'Fotos de productos no cargan en el sitio', 'Varias fichas de dermocosmética muestran imagen rota.', 'take:1:matias,resolve:1,close:0.5'],
    [cat_elec::text, rodrigo::text, '420', 'Luces del letrero exterior apagadas', 'El letrero de la farmacia está apagado desde anoche.', 'take:6:felipe,resolve:12,close:30'],
    [cat_corp::text, andrea::text, '400', 'Guía de despacho no se puede emitir', 'El sistema muestra "folio no disponible" al emitir guía.', 'take:3:matias,release:2,take:5:valentina,resolve:8,close:10'],
    [cat_accesos::text, rodrigo::text, '380', 'Bloqueo de usuario en sistema de farmacia', 'Ingresé mal la clave tres veces y quedó bloqueado.', 'take:0.5:matias,resolve:0.5,close:2'],
    [cat_pos::text, rodrigo::text, '360', 'Lector de código de barras intermitente', 'A veces lee y a veces no. Se puede digitar el código mientras tanto.', 'take:0.25:valentina,prio:0.5:medium,resolve:6,close:12'],
    [cat_pc::text, carolina::text, '340', 'Solicitud de segundo monitor', 'Para revisar planillas y el ERP a la vez.', 'take:30:matias,resolve:20,close:5'],
    [cat_infra::text, andrea::text, '320', 'Filtración de agua en techo de bodega', 'Gotea sobre el pasillo A cuando llueve. No afecta productos por ahora.', 'take:5:felipe,prio:1:medium,resolve:10,close:24'],
    [cat_ecommerce::text, rodrigo::text, '300', 'Cliente no puede pagar con Webpay', 'Tres clientes reportan que el pago rebota al confirmar.', 'take:0.5:valentina,resolve:2.5,close:1'],
    [cat_recetas::text, rodrigo::text, '280', 'Trazabilidad no muestra lote de producto refrigerado', 'El lote de insulina no aparece en la consulta de trazabilidad.', 'take:1:matias,resolve:1.5,close:6'],
    [cat_frio::text, rodrigo::text, '260', 'Termómetro del refrigerador de vacunas sin lectura', 'La pantalla está apagada. No sabemos la temperatura real.', 'take:1:felipe,resolve:4,close:2'],
    [cat_elec::text, carolina::text, '240', 'Enchufe de sala de reuniones sin corriente', 'No carga el notebook en la sala 2.', 'cancel:0.5'],
    [cat_corp::text, andrea::text, '220', 'Diferencia de stock entre sistema y físico', 'El sistema muestra 40 unidades y hay 38 en bodega.', 'take:4:valentina,resolve:10,close:48'],
    [cat_pc::text, rodrigo::text, '200', 'Teclado de caja 3 con teclas pegadas', 'Las teclas 5 y 6 quedan pegadas.', 'take:8:matias,wait:2,resume:100,resolve:4,close:10'],
    [cat_clima::text, andrea::text, '180', 'Ventilación de bodega hace ruido fuerte', 'El extractor vibra y hace un ruido metálico.', 'take:2:felipe,resolve:20,close:30'],
    [cat_accesos::text, carolina::text, '150', 'Necesito acceso al reporte de ventas del ERP', 'Mi jefatura pidió que revise el reporte semanal.', 'take:1:valentina,resolve:1,close:2'],
    [cat_ecommerce::text, carolina::text, '120', 'Correo de confirmación de pedido llega sin datos', 'Los clientes reciben el correo con los campos vacíos.', 'take:0.5:matias,resolve:1,close:24'],
    -- Resolved, waiting for the requester to confirm
    [cat_infra::text, rodrigo::text, '100', 'Vitrina de mostrador con vidrio trizado', 'Vidrio lateral trizado. No hay riesgo inmediato.', 'take:10:felipe,resolve:20'],
    -- In progress, overdue (medium, 24 h)
    [cat_corp::text, carolina::text, '80', 'Sistema de remuneraciones calcula mal las horas extra', 'Las horas extra de septiembre salen duplicadas para dos personas.', 'take:3:valentina'],
    -- Waiting on requester
    [cat_elec::text, andrea::text, '60', 'Tablero eléctrico de bodega con olor a quemado', 'Se siente olor a quemado cerca del tablero principal.', 'take:2:felipe,wait:3'],
    -- Open, overdue (high, 4 h)
    [cat_pos::text, rodrigo::text, '30', 'Caja 1 no emite boleta electrónica', 'La boleta se queda en "pendiente" y no llega al SII.', ''],
    -- In progress, overdue (high, 4 h)
    [cat_recetas::text, rodrigo::text, '6', 'Sistema de recetas no permite dispensar', 'Todas las recetas quedan en estado "en validación".', 'take:0.5:valentina'],
    -- In progress, at risk (high, 3 of 4 h consumed)
    [cat_frio::text, andrea::text, '3', 'Refrigerador de bodega marca 8,5 °C', 'La temperatura subió sobre el rango en la última hora.', 'take:0.25:felipe'],
    -- Waiting, low priority
    [cat_pc::text, carolina::text, '50', 'Notebook no reconoce la red wifi', 'Se conecta al celular pero no a la red de la oficina.', 'take:5:matias,wait:10'],
    -- Open, at risk (medium, 20 of 24 h)
    [cat_clima::text, rodrigo::text, '20', 'Aire acondicionado de bodega de refrigerados gotea', 'Cae agua desde el equipo sobre el piso.', ''],
    -- Open, fresh
    [cat_ecommerce::text, andrea::text, '1', 'Pedido web muestra stock que no existe', 'Un pedido pide 10 unidades de un producto con stock 0 en bodega.', ''],
    -- Resolved, waiting for confirmation
    [cat_accesos::text, andrea::text, '10', 'Reinicio de clave de sistema de bodega', 'Olvidé la clave después de vacaciones.', 'take:1:valentina,resolve:2'],
    -- In progress, overdue (medium)
    [cat_corp::text, rodrigo::text, '26', 'Facturación no envía facturas a clientes empresa', 'Las facturas quedan en cola y no se envían por correo.', 'take:1:matias'],
    -- Open, low priority
    [cat_infra::text, carolina::text, '5', 'Baldosa suelta en entrada de oficina', 'Una baldosa se mueve al pisar, cerca de la puerta.', '']
  ];

  step text;
  parts text[];
  verb text;
  arg text;
  t timestamptz;
  v_ticket_id uuid;
  v_area uuid;
  v_status ticket_status;
  v_priority ticket_priority;
  v_new_priority ticket_priority;
  v_assignee uuid;
  v_agent uuid;
  v_requester uuid;
  v_resolved_at timestamptz;
  v_closed_at timestamptz;
begin
  if exists (select 1 from tickets) then
    raise notice 'seed: tickets already present, skipping scenarios';
    return;
  end if;

  for i in 1 .. array_length(scenarios, 1) loop
    v_requester := scenarios[i][2]::uuid;
    t := now() - (scenarios[i][3]::numeric * interval '1 hour');
    v_assignee := null;
    v_resolved_at := null;
    v_closed_at := null;

    select c.area_id, c.default_priority into v_area, v_priority
      from categories c where c.id = scenarios[i][1]::uuid;

    v_status := 'open';

    insert into tickets (title, description, category_id, area_id, location_id, requester_id,
                         status, priority, created_at, updated_at)
    select scenarios[i][4], scenarios[i][5], scenarios[i][1]::uuid, v_area, u.location_id, v_requester,
           v_status, v_priority, t, t
      from users u where u.id = v_requester
      returning id into v_ticket_id;

    insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
    values (v_ticket_id, v_requester, 'created', null, 'open',
            jsonb_build_object('priority', v_priority, 'priority_source', 'category_default'), t);

    if scenarios[i][6] <> '' then
      foreach step in array string_to_array(scenarios[i][6], ',') loop
        parts := string_to_array(step, ':');
        verb := parts[1];
        t := t + (parts[2]::numeric * interval '1 hour');
        arg := parts[3];

        if t > now() then
          raise exception 'seed scenario % step % lands in the future', i, step;
        end if;

        case verb
          when 'take' then
            v_agent := case arg
              when 'matias' then matias
              when 'valentina' then valentina
              when 'felipe' then felipe
            end;
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_agent, 'taken', v_status, 'in_progress',
                    jsonb_build_object('assignee_id', v_agent), t);
            v_status := 'in_progress';
            v_assignee := v_agent;

          when 'release' then
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_assignee, 'released', v_status, 'open',
                    jsonb_build_object('assignee_id', v_assignee, 'reason', 'Cambio de turno, queda en cola'), t);
            v_status := 'open';
            v_assignee := null;

          when 'wait' then
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_assignee, 'status_changed', v_status, 'waiting',
                    jsonb_build_object('reason', 'A la espera de información del solicitante'), t);
            v_status := 'waiting';

          when 'resume' then
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_assignee, 'status_changed', v_status, 'in_progress', '{}'::jsonb, t);
            v_status := 'in_progress';

          when 'resolve' then
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_assignee, 'status_changed', v_status, 'resolved',
                    jsonb_build_object('reason', 'Se aplicó la corrección y se verificó con el solicitante'), t);
            v_status := 'resolved';
            v_resolved_at := t;

          when 'close' then
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_requester, 'status_changed', v_status, 'closed', '{}'::jsonb, t);
            v_status := 'closed';
            v_closed_at := t;

          when 'reopen' then
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_requester, 'status_changed', v_status, 'in_progress',
                    jsonb_build_object('reason', 'El problema volvió a ocurrir'), t);
            v_status := 'in_progress';
            v_resolved_at := null;

          when 'cancel' then
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_requester, 'status_changed', v_status, 'cancelled', '{}'::jsonb, t);
            v_status := 'cancelled';

          when 'prio' then
            v_new_priority := arg::ticket_priority;
            insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload, created_at)
            values (v_ticket_id, v_assignee, 'priority_changed', null, null,
                    jsonb_build_object('from', v_priority, 'to', v_new_priority,
                                       'reason', 'Hay alternativa de trabajo mientras se repara'), t);
            v_priority := v_new_priority;

          else
            raise exception 'seed scenario % has unknown step verb %', i, verb;
        end case;
      end loop;
    end if;

    update tickets
       set status = v_status,
           priority = v_priority,
           assignee_id = v_assignee,
           resolved_at = v_resolved_at,
           closed_at = v_closed_at,
           updated_at = t
     where id = v_ticket_id;
  end loop;
end $$;

alter table tickets enable trigger tickets_set_updated_at;
