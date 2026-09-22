import type { Priority, TicketStatus } from "@/domain/types";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/labels";

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  waiting: "bg-purple-100 text-purple-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-200 text-gray-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const PRIORITY_CLASS: Record<Priority, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-orange-100 text-orange-800",
  low: "bg-gray-100 text-gray-700",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_CLASS[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
