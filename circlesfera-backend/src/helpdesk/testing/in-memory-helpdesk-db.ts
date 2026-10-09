// A small stand-in for the database, for tests that need real rows behind
// the Help Desk store: tickets and messages in memory, answering the
// queries the store makes. It filters exactly by the `where` it is given, so
// a query that forgets a condition returns what it should not.

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : (a ?? null) === (b ?? null);

const time = (value: unknown) =>
  value instanceof Date ? value.getTime() : Number.NaN;

export class InMemoryHelpdeskDb {
  tickets: Row[] = [];
  messages: Row[] = [];
  events: Row[] = [];
  savedReplies: Row[] = [];
  inboundEmails: Row[] = [];
  private sequence = 0;
  private clock = Date.parse('2026-01-01T00:00:00Z');

  private next(prefix: string) {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  /** Each row is written a moment after the one before. */
  private now() {
    this.clock += 1000;
    return new Date(this.clock);
  }

  private matches(row: Row, where: Where | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, condition]) => {
      if (condition === undefined) return true;
      if (key === 'OR') {
        return (condition as Where[]).some((one) => this.matches(row, one));
      }
      // A message is filtered by its ticket.
      if (key === 'ticket') {
        const ticket = this.tickets.find((t) => t.id === row.ticketId);
        return !!ticket && this.matches(ticket, condition as Where);
      }
      // A ticket is filtered by what it has none of.
      if (key === 'messages' || key === 'events') {
        const { none } = condition as { none: Where };
        return !this[key].some(
          (one) => one.ticketId === row.id && this.matches(one, none),
        );
      }
      const value = row[key];
      if (!isPlainObject(condition)) return same(value, condition);
      return Object.entries(condition).every(([operator, operand]) => {
        switch (operator) {
          case 'equals':
            return same(value, operand);
          case 'in':
            return (operand as unknown[]).includes(value);
          case 'not':
            return !same(value, operand);
          case 'lt':
            return time(value) < time(operand);
          case 'gte':
            return time(value) >= time(operand);
          default:
            throw new Error(`Operator not supported in tests: ${operator}`);
        }
      });
    });
  }

  private ordered(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>) {
    if (!orderBy) return rows;
    const [[field, direction]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => {
      const difference = time(a[field]) - time(b[field]);
      return direction === 'asc' ? difference : -difference;
    });
  }

  private addMessage(ticketId: string, data: Row) {
    this.messages.push({
      id: this.next('m'),
      ticketId,
      authorRef: null,
      visibility: 'PUBLIC',
      channel: 'PRODUCT',
      createdAt: this.now(),
      ...data,
    });
  }

  private picked(ticket: Row, select?: Record<string, unknown>): Row {
    if (!select) return { ...ticket };
    const out: Row = {};
    for (const [key, wanted] of Object.entries(select)) {
      if (!wanted) continue;
      if (key === 'messages' && isPlainObject(wanted)) {
        out.messages = this.ordered(
          this.messages.filter(
            (m) =>
              m.ticketId === ticket.id &&
              this.matches(m, wanted.where as Where | undefined),
          ),
          wanted.orderBy as Record<string, 'asc' | 'desc'> | undefined,
        );
      } else {
        out[key] = ticket[key];
      }
    }
    return out;
  }

  readonly supportTicket = {
    create: async ({ data }: { data: Row }) => {
      const { messages, ...fields } = data as Row & {
        messages?: { create: Row };
      };
      const moment = this.now();
      const ticket: Row = {
        id: this.next('t'),
        reference: this.tickets.length + 1,
        status: 'OPEN',
        category: 'OTHER',
        reply: null,
        resolvedAt: null,
        escalatedReportId: null,
        previousTicketId: null,
        priority: 'NORMAL',
        assignedAgentRef: null,
        waitingRemindedAt: null,
        createdAt: moment,
        updatedAt: moment,
        ...fields,
      };
      this.tickets.push(ticket);
      if (messages?.create)
        this.addMessage(ticket.id as string, messages.create);
      return { ...ticket };
    },

    findFirst: async ({ where }: { where?: Where }) => {
      const found = this.tickets.find((t) => this.matches(t, where));
      return found ? { ...found } : null;
    },

    findMany: async (args: {
      where?: Where;
      orderBy?: Record<string, 'asc' | 'desc'>;
      skip?: number;
      take?: number;
      select?: Record<string, unknown>;
    }) => {
      const rows = this.ordered(
        this.tickets.filter((t) => this.matches(t, args.where)),
        args.orderBy,
      );
      const from = args.skip ?? 0;
      return rows
        .slice(from, args.take === undefined ? undefined : from + args.take)
        .map((ticket) => this.picked(ticket, args.select));
    },

    count: async ({ where }: { where?: Where }) =>
      this.tickets.filter((t) => this.matches(t, where)).length,

    update: async ({ where, data }: { where: Where; data: Row }) => {
      const ticket = this.tickets.find((t) => this.matches(t, where));
      if (!ticket) {
        // What the database client does when no row matches.
        throw Object.assign(new Error('Record to update not found.'), {
          code: 'P2025',
        });
      }
      const { messages, events, ...fields } = data as Row & {
        messages?: { create: Row };
        events?: { create: Row[] };
      };
      Object.assign(ticket, fields, { updatedAt: this.now() });
      if (messages?.create)
        this.addMessage(ticket.id as string, messages.create);
      for (const event of events?.create ?? []) {
        this.events.push({
          id: this.next('e'),
          ticketId: ticket.id,
          createdAt: this.now(),
          ...event,
        });
      }
      return { ...ticket };
    },

    updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
      const rows = this.tickets.filter((t) => this.matches(t, where));
      for (const ticket of rows) {
        Object.assign(ticket, data, { updatedAt: this.now() });
      }
      return { count: rows.length };
    },

    deleteMany: async ({ where }: { where?: Where }) => {
      const gone = this.tickets.filter((t) => this.matches(t, where));
      const ids = new Set(gone.map((t) => t.id));
      this.tickets = this.tickets.filter((t) => !ids.has(t.id));
      // Messages go with their ticket.
      this.messages = this.messages.filter((m) => !ids.has(m.ticketId));
      this.events = this.events.filter((e) => !ids.has(e.ticketId));
      return { count: gone.length };
    },
  };

  readonly helpdeskTicketEvent = {
    findMany: async (args: {
      where?: Where;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }) =>
      this.ordered(
        this.events.filter((e) => this.matches(e, args.where)),
        args.orderBy,
      ).map((e) => ({ ...e })),
  };

  readonly helpdeskMessage = {
    findMany: async (args: {
      where?: Where;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }) =>
      this.ordered(
        this.messages.filter((m) => this.matches(m, args.where)),
        args.orderBy,
      ).map((m) => ({ ...m })),
  };

  readonly helpdeskSavedReply = {
    findMany: async (args: {
      where?: Where;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }) => {
      const rows = this.savedReplies.filter((r) => this.matches(r, args.where));
      const field = Object.keys(args.orderBy ?? {})[0];
      return (
        field
          ? [...rows].sort((a, b) =>
              String(a[field]).localeCompare(String(b[field])),
            )
          : rows
      ).map((r) => ({ ...r }));
    },

    findFirst: async ({ where }: { where?: Where }) => {
      const found = this.savedReplies.find((r) => this.matches(r, where));
      return found ? { ...found } : null;
    },

    create: async ({ data }: { data: Row }) => {
      const moment = this.now();
      const reply: Row = {
        id: this.next('r'),
        createdAt: moment,
        updatedAt: moment,
        ...data,
      };
      this.savedReplies.push(reply);
      return { ...reply };
    },

    updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
      const rows = this.savedReplies.filter((r) => this.matches(r, where));
      for (const reply of rows) {
        Object.assign(reply, data, { updatedAt: this.now() });
      }
      return { count: rows.length };
    },

    deleteMany: async ({ where }: { where?: Where }) => {
      const gone = this.savedReplies.filter((r) => this.matches(r, where));
      this.savedReplies = this.savedReplies.filter((r) => !gone.includes(r));
      return { count: gone.length };
    },
  };

  readonly helpdeskInboundEmail = {
    findUnique: async ({ where }: { where: Where }) => {
      const key = where.organizationId_messageId as Where | undefined;
      const found = this.inboundEmails.find((e) =>
        this.matches(e, key ?? where),
      );
      return found ? { ...found } : null;
    },

    findUniqueOrThrow: async (args: { where: Where }) => {
      const found = await this.helpdeskInboundEmail.findUnique(args);
      if (!found) throw new Error('No record was found.');
      return found;
    },

    create: async ({ data }: { data: Row }) => {
      if (
        this.inboundEmails.some(
          (e) =>
            e.organizationId === data.organizationId &&
            e.messageId === data.messageId,
        )
      ) {
        // What the database client does on a repeated unique value.
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }
      const email: Row = {
        id: this.next('i'),
        outcome: 'RECEIVED',
        ticketId: null,
        noticeSentAt: null,
        receivedAt: this.now(),
        ...data,
      };
      this.inboundEmails.push(email);
      return { ...email };
    },

    deleteMany: async ({ where }: { where?: Where }) => {
      const gone = this.inboundEmails.filter((e) => this.matches(e, where));
      this.inboundEmails = this.inboundEmails.filter((e) => !gone.includes(e));
      return { count: gone.length };
    },
  };
}
