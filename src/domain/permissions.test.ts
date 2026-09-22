import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ROLE_ACTIONS,
  allowedTransitions,
  can,
  type Action,
} from "./permissions";
import type { DomainTicket, DomainUser, Role, TicketStatus } from "./types";

const TI = "area-ti";
const MANT = "area-mant";

const requester: DomainUser = { id: "req-1", role: "requester", areaId: null };
const otherRequester: DomainUser = { id: "req-2", role: "requester", areaId: null };
const agentTi: DomainUser = { id: "agent-ti-1", role: "agent", areaId: TI };
const agentTi2: DomainUser = { id: "agent-ti-2", role: "agent", areaId: TI };
const agentMant: DomainUser = { id: "agent-mant-1", role: "agent", areaId: MANT };
const supervisorAll: DomainUser = { id: "sup-all", role: "supervisor", areaId: null };
const supervisorTi: DomainUser = { id: "sup-ti", role: "supervisor", areaId: TI };
const supervisorMant: DomainUser = { id: "sup-mant", role: "supervisor", areaId: MANT };

function ticket(overrides: Partial<DomainTicket> = {}): DomainTicket {
  return {
    id: "t-1",
    status: "open",
    priority: "medium",
    areaId: TI,
    requesterId: requester.id,
    assigneeId: null,
    ...overrides,
  };
}

describe("role map", () => {
  const matrix: Record<Role, Action[]> = {
    requester: ["ticket.create", "ticket.view", "ticket.confirm", "ticket.reopen", "ticket.cancel"],
    agent: [
      "ticket.create",
      "ticket.view",
      "ticket.confirm",
      "ticket.reopen",
      "ticket.cancel",
      "queue.view",
      "ticket.take",
      "ticket.release",
      "ticket.transition",
      "ticket.set_priority",
    ],
    supervisor: [
      "ticket.create",
      "ticket.view",
      "ticket.confirm",
      "ticket.reopen",
      "ticket.cancel",
      "queue.view",
      "ticket.release",
      "ticket.set_priority",
      "dashboard.view",
    ],
  };

  it.each(Object.keys(matrix) as Role[])("%s has exactly the expected actions", (role) => {
    expect([...ROLE_ACTIONS[role]].sort()).toEqual([...matrix[role]].sort());
    for (const action of ACTIONS) {
      const user: DomainUser = { id: "x", role, areaId: null };
      expect(can(user, action)).toBe(matrix[role].includes(action));
    }
  });

  it("everyone can create tickets", () => {
    for (const u of [requester, agentTi, supervisorAll]) {
      expect(can(u, "ticket.create")).toBe(true);
    }
  });

  it("only supervisors see the dashboard", () => {
    expect(can(supervisorAll, "dashboard.view")).toBe(true);
    expect(can(agentTi, "dashboard.view")).toBe(false);
    expect(can(requester, "dashboard.view")).toBe(false);
  });
});

describe("ticket.view", () => {
  const t = ticket();

  it("requester sees only own tickets", () => {
    expect(can(requester, "ticket.view", t)).toBe(true);
    expect(can(otherRequester, "ticket.view", t)).toBe(false);
  });

  it("agent sees tickets of own area only", () => {
    expect(can(agentTi, "ticket.view", t)).toBe(true);
    expect(can(agentMant, "ticket.view", t)).toBe(false);
  });

  it("agent sees a ticket they requested even outside their area", () => {
    const own = ticket({ areaId: MANT, requesterId: agentTi.id });
    expect(can(agentTi, "ticket.view", own)).toBe(true);
  });

  it("supervisor sees own area or all areas when area is null", () => {
    expect(can(supervisorAll, "ticket.view", t)).toBe(true);
    expect(can(supervisorTi, "ticket.view", t)).toBe(true);
    expect(can(supervisorMant, "ticket.view", t)).toBe(false);
  });
});

describe("ticket.take", () => {
  it("agent of the area takes an open ticket", () => {
    expect(can(agentTi, "ticket.take", ticket())).toBe(true);
  });

  it("agent of another area cannot take", () => {
    expect(can(agentMant, "ticket.take", ticket())).toBe(false);
  });

  it("supervisor and requester cannot take", () => {
    expect(can(supervisorAll, "ticket.take", ticket())).toBe(false);
    expect(can(requester, "ticket.take", ticket())).toBe(false);
  });

  it.each<TicketStatus>(["in_progress", "waiting", "resolved", "closed", "cancelled"])(
    "cannot take a ticket in %s",
    (status) => {
      expect(can(agentTi, "ticket.take", ticket({ status, assigneeId: agentTi2.id }))).toBe(false);
    },
  );
});

describe("ticket.release", () => {
  const inProgress = ticket({ status: "in_progress", assigneeId: agentTi.id });

  it("assignee releases", () => {
    expect(can(agentTi, "ticket.release", inProgress)).toBe(true);
  });

  it("another agent of the area cannot release", () => {
    expect(can(agentTi2, "ticket.release", inProgress)).toBe(false);
  });

  it("supervisor of the area releases, of another area does not", () => {
    expect(can(supervisorAll, "ticket.release", inProgress)).toBe(true);
    expect(can(supervisorTi, "ticket.release", inProgress)).toBe(true);
    expect(can(supervisorMant, "ticket.release", inProgress)).toBe(false);
  });

  it("requester cannot release", () => {
    expect(can(requester, "ticket.release", inProgress)).toBe(false);
  });

  it("nothing to release when open", () => {
    expect(can(agentTi, "ticket.release", ticket())).toBe(false);
  });
});

describe("ticket.transition (waiting, resume, resolve)", () => {
  const inProgress = ticket({ status: "in_progress", assigneeId: agentTi.id });
  const waiting = ticket({ status: "waiting", assigneeId: agentTi.id });

  it("assignee can move in_progress to waiting or resolved", () => {
    const targets = allowedTransitions(agentTi, inProgress).map((t) => t.to).sort();
    expect(targets).toEqual(["open", "resolved", "waiting"]);
    expect(can(agentTi, "ticket.transition", inProgress)).toBe(true);
  });

  it("assignee resumes from waiting", () => {
    expect(allowedTransitions(agentTi, waiting).map((t) => t.to)).toEqual(["in_progress"]);
    expect(can(agentTi, "ticket.transition", waiting)).toBe(true);
  });

  it("non-assignee agent, supervisor and requester cannot transition", () => {
    expect(can(agentTi2, "ticket.transition", inProgress)).toBe(false);
    expect(can(supervisorAll, "ticket.transition", inProgress)).toBe(false);
    expect(can(requester, "ticket.transition", inProgress)).toBe(false);
    expect(allowedTransitions(supervisorAll, inProgress).map((t) => t.to)).toEqual(["open"]);
  });

  it("no transition from an open ticket for the assignee action", () => {
    expect(can(agentTi, "ticket.transition", ticket())).toBe(false);
  });
});

describe("requester actions: confirm, reopen, cancel", () => {
  const resolved = ticket({ status: "resolved", assigneeId: agentTi.id });

  it("owner confirms or reopens a resolved ticket", () => {
    expect(can(requester, "ticket.confirm", resolved)).toBe(true);
    expect(can(requester, "ticket.reopen", resolved)).toBe(true);
  });

  it("someone else cannot confirm or reopen", () => {
    expect(can(otherRequester, "ticket.confirm", resolved)).toBe(false);
    expect(can(agentTi, "ticket.confirm", resolved)).toBe(false);
    expect(can(supervisorAll, "ticket.reopen", resolved)).toBe(false);
  });

  it("owner cancels only while open", () => {
    expect(can(requester, "ticket.cancel", ticket())).toBe(true);
    expect(can(requester, "ticket.cancel", ticket({ status: "in_progress", assigneeId: agentTi.id }))).toBe(false);
    expect(can(requester, "ticket.cancel", ticket({ status: "waiting", assigneeId: agentTi.id }))).toBe(false);
    expect(can(otherRequester, "ticket.cancel", ticket())).toBe(false);
  });

  it("an agent who requested a ticket acts as its owner", () => {
    const own = ticket({ status: "resolved", requesterId: agentMant.id, assigneeId: agentTi.id });
    expect(can(agentMant, "ticket.confirm", own)).toBe(true);
  });

  it("nothing for the owner in terminal states", () => {
    for (const status of ["closed", "cancelled"] as const) {
      const t = ticket({ status });
      expect(can(requester, "ticket.confirm", t)).toBe(false);
      expect(can(requester, "ticket.reopen", t)).toBe(false);
      expect(can(requester, "ticket.cancel", t)).toBe(false);
    }
  });
});

describe("ticket.set_priority", () => {
  it.each<TicketStatus>(["open", "in_progress", "waiting"])(
    "agent of the area and supervisor can change priority in %s",
    (status) => {
      const t = ticket({ status });
      expect(can(agentTi, "ticket.set_priority", t)).toBe(true);
      expect(can(agentTi2, "ticket.set_priority", t)).toBe(true);
      expect(can(supervisorAll, "ticket.set_priority", t)).toBe(true);
      expect(can(supervisorTi, "ticket.set_priority", t)).toBe(true);
    },
  );

  it.each<TicketStatus>(["resolved", "closed", "cancelled"])(
    "nobody changes priority in %s",
    (status) => {
      const t = ticket({ status, assigneeId: agentTi.id });
      expect(can(agentTi, "ticket.set_priority", t)).toBe(false);
      expect(can(supervisorAll, "ticket.set_priority", t)).toBe(false);
    },
  );

  it("agent or supervisor of another area, and requester, cannot", () => {
    expect(can(agentMant, "ticket.set_priority", ticket())).toBe(false);
    expect(can(supervisorMant, "ticket.set_priority", ticket())).toBe(false);
    expect(can(requester, "ticket.set_priority", ticket())).toBe(false);
  });
});
