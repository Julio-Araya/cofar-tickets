/** Spanish UI labels for domain enums. Code stays in English; the interface does not. */
import type { Priority, Role, TicketStatus } from "@/domain/types";

export const ROLE_LABELS: Record<Role, string> = {
  requester: "Solicitantes",
  agent: "Agentes",
  supervisor: "Supervisión",
};

export const ROLE_LABEL_SINGULAR: Record<Role, string> = {
  requester: "Solicitante",
  agent: "Agente",
  supervisor: "Supervisor/a",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Abierto",
  in_progress: "En curso",
  waiting: "En espera",
  resolved: "Resuelto",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
