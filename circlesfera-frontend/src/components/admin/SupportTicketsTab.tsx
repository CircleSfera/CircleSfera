import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  ExternalLink,
  LifeBuoy,
  Mail,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AdminSupportEvent,
  AdminSupportMessage,
  AdminSupportTicket,
} from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import type { PaginatedResponse } from '../../types';
import { formatDate, formatDateTime } from '../../utils/format';
import {
  addToDraft,
  fillSavedReply,
  requesterGreetingName,
} from '../../utils/savedReply';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Textarea } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { FilterDropdown, Pagination } from './AdminTable';
import { staffTabHref } from './adminNav';
import { SavedReplies } from './SavedReplies';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

// A page of tickets, with the names of the agents who have them.
type SupportTicketsPage = PaginatedResponse<AdminSupportTicket> & {
  agents?: Record<string, string>;
};

type TicketStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';
type ShownStatus = TicketStatus | 'ESCALATED' | 'WAITING';

function statusBadgeClass(status: ShownStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'RESOLVED':
      return 'bg-green-500/20 text-green-500';
    case 'CLOSED':
      return 'bg-white/10 text-white/50';
    case 'ESCALATED':
      return 'bg-brand-primary/20 text-brand-primary';
    case 'WAITING':
      return 'bg-white/10 text-white/80';
  }
}

const TICKET_CATEGORIES = ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'] as const;

const PRIORITIES = ['HIGH', 'NORMAL', 'LOW'] as const;

const HOUR_MS = 60 * 60 * 1000;

// How often the ticket is read again while the agent writes in it.
const NEW_MESSAGE_CHECK_MS = 20_000;

/** How long an open ticket has waited for an answer; marked after two days. */
function WaitingTime({ since }: { since: string }) {
  const { t } = useTranslation();
  const hours = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / HOUR_MS),
  );
  return (
    <span className={hours >= 48 ? 'font-semibold text-yellow-400' : undefined}>
      {hours < 1
        ? t('admin.support.waiting_under_hour')
        : hours < 24
          ? t('admin.support.waiting_hours', { count: hours })
          : t('admin.support.waiting_days', { count: Math.floor(hours / 24) })}
    </span>
  );
}

/** One message of the conversation, as the agent sees it. */
function ConversationMessage({
  message,
  requester,
}: {
  message: AdminSupportMessage;
  requester: string;
}) {
  const { t, i18n } = useTranslation();
  const internal = message.visibility === 'INTERNAL';
  // What the system notes is stored as a key and written here in the
  // agent's language.
  const decided =
    message.authorKind === 'SYSTEM'
      ? /^handover\.decided:(RESOLVED|REJECTED|GONE)$/.exec(message.body)
      : null;
  const systemText = decided
    ? t(`admin.support.system.handover_${decided[1]}`)
    : null;
  const author =
    message.authorKind === 'REQUESTER'
      ? requester
      : message.authorKind === 'AGENT'
        ? t('admin.support.author_team')
        : t('admin.support.author_system');
  return (
    <li
      className={`rounded-xl border p-3 ${
        internal
          ? 'border-dashed border-yellow-400/40 bg-yellow-400/5'
          : message.authorKind === 'REQUESTER'
            ? 'border-white/10 bg-white/5'
            : 'border-brand-primary/30 bg-brand-primary/10'
      }`}
    >
      <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-white/60">
        <span className="font-semibold text-white/85">{author}</span>
        {internal && (
          <span className="font-semibold text-yellow-400">
            {t('admin.support.internal_note')}
          </span>
        )}
        <span>{formatDateTime(message.createdAt, i18n.language)}</span>
      </p>
      <p className="text-sm text-white/85 whitespace-pre-wrap wrap-break-word leading-relaxed">
        {systemText ?? message.body}
      </p>
    </li>
  );
}

/** One change of the ticket, as a line between the messages. */
function HistoryLine({
  event,
  requester,
  agentName,
}: {
  event: AdminSupportEvent;
  requester: string;
  agentName: (agentRef: string | null) => string;
}) {
  const { t, i18n } = useTranslation();
  const values = (name: (value: string | null) => string) => ({
    from: name(event.fromValue),
    to: name(event.toValue),
  });
  const what = {
    STATE: () =>
      t(
        'admin.support.event.state',
        values((value) => t(`admin.support.event.state_name.${value}`)),
      ),
    TOPIC: () =>
      t(
        'admin.support.event.topic',
        values((value) => t(`supportPage.category.${value}`)),
      ),
    PRIORITY: () =>
      t(
        'admin.support.event.priority',
        values((value) => t(`admin.support.priority.${value}`)),
      ),
    ASSIGNMENT: () => t('admin.support.event.assignment', values(agentName)),
    HANDOVER: () => t('admin.support.event.handover'),
  }[event.kind]();
  const who =
    event.actorKind === 'REQUESTER'
      ? requester
      : event.actorKind === 'SYSTEM'
        ? t('admin.support.author_system')
        : event.actorRef
          ? agentName(event.actorRef)
          : t('admin.support.author_team');
  return (
    <li className="flex flex-wrap items-center gap-x-2 px-3 text-xs text-white/60">
      <span className="text-white/80">{what}</span>
      <span>{who}</span>
      <span>{formatDateTime(event.createdAt, i18n.language)}</span>
    </li>
  );
}

// Messages and changes of a ticket in the order they happened; a change
// written with a message comes right after it.
function timelineOf(
  messages: AdminSupportMessage[],
  events: AdminSupportEvent[],
) {
  return [
    ...messages.map((message) => ({ message, at: message.createdAt })),
    ...events.map((event) => ({ event, at: event.createdAt })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export default function SupportTicketsTab({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [whose, setWhose] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [priorityFilter, setPriorityFilter] = useState('');
  const myRef = useAdminAuthStore((state) => state.admin?.id);
  // Who leads the team gives tickets to others; every agent takes and lets go.
  const leadsTeam = useAdminAuthStore((state) =>
    state.hasPermission('support.manage'),
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // The last message on screen when the agent started writing, and where.
  const [writingFrom, setWritingFrom] = useState<{
    ticketId: string;
    lastId: string | null;
  } | null>(null);
  const [checkingBeforeSend, setCheckingBeforeSend] = useState(false);
  const [draftKind, setDraftKind] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [leaveAs, setLeaveAs] = useState<'RESOLVED' | 'WAITING' | 'OPEN'>(
    'RESOLVED',
  );
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmEscalate, setConfirmEscalate] = useState(false);

  const { data, isLoading } = useQuery<SupportTicketsPage>({
    queryKey: [
      'admin',
      'support-tickets',
      page,
      statusFilter,
      categoryFilter,
      whose,
      priorityFilter,
    ],
    queryFn: () =>
      adminApi
        .getSupportTickets(
          page,
          20,
          statusFilter || undefined,
          categoryFilter || undefined,
          {
            ...(whose !== 'all' && { assignment: whose }),
            ...(priorityFilter && { priority: priorityFilter }),
          },
        )
        .then((res) => res.data as SupportTicketsPage),
  });

  const selectedTicket = data?.data.find((t) => t.id === selectedTicketId);
  const requesterName = selectedTicket?.user?.profile?.username
    ? `@${selectedTicket.user.profile.username}`
    : (selectedTicket?.email ?? '');

  // The conversation of the selected ticket, internal notes included.
  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ['admin', 'support-ticket', selectedTicketId],
    queryFn: () =>
      adminApi
        .getSupportTicket(selectedTicketId as string)
        .then((res) => res.data),
    enabled: !!selectedTicketId,
    // While the agent writes, someone else may write in the same ticket.
    refetchInterval: draft.trim() ? NEW_MESSAGE_CHECK_MS : false,
  });
  const messages: AdminSupportMessage[] = detail?.messages ?? [];
  // Who has a ticket: nobody, who is signed in, or an agent by name. An
  // agent the team no longer has is not named.
  const agentNames = { ...data?.agents, ...detail?.agents };
  const assigneeLabel = (agentRef: string | null | undefined) =>
    !agentRef
      ? t('admin.support.assignee_nobody')
      : agentRef === myRef
        ? t('admin.support.assignee_me')
        : (agentNames[agentRef] ?? t('admin.support.assignee_former'));
  // The agents a ticket can be given to, for who leads the team.
  const { data: assignable } = useQuery({
    queryKey: ['admin', 'support-agents'],
    queryFn: () => adminApi.getSupportAgents().then((res) => res.data),
    enabled: leadsTeam,
    staleTime: 5 * 60 * 1000,
  });
  const lastMessageId = messages.at(-1)?.id ?? null;
  // A message that arrived after the agent started writing in this ticket.
  const arrivedAfter = (latest: string | null) =>
    writingFrom?.ticketId === selectedTicketId &&
    writingFrom.lastId !== null &&
    latest !== null &&
    latest !== writingFrom.lastId;
  const newMessageArrived = !!draft.trim() && arrivedAfter(lastMessageId);
  const answered = messages.some(
    (message) =>
      message.authorKind === 'AGENT' && message.visibility === 'PUBLIC',
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'support-ticket'] });
  };

  const messageMutation = useMutation({
    mutationFn: (id: string) =>
      adminApi.addSupportMessage(id, {
        body: draft.trim(),
        visibility: kind,
        ...(kind === 'PUBLIC' && { status: leaveAs }),
      }),
    onSuccess: () => {
      setDraft('');
      refresh();
      onToast(
        t(
          kind === 'PUBLIC'
            ? 'admin.support.toast_answered'
            : 'admin.support.toast_note_added',
        ),
        'success',
      );
    },
    onError: () => onToast(t('admin.support.toast_error'), 'error'),
  });

  // Reads the ticket once more before sending: if someone wrote meanwhile,
  // nothing is sent and the warning asks the agent to read it first.
  const send = async (id: string) => {
    setCheckingBeforeSend(true);
    const { data: fresh } = await refetchDetail();
    setCheckingBeforeSend(false);
    if (arrivedAfter(fresh?.messages.at(-1)?.id ?? null)) return;
    messageMutation.mutate(id);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status?: TicketStatus }) =>
      adminApi.updateSupportTicket(id, { status }),
    onSuccess: (_, variables) => {
      refresh();
      if (variables.status === 'CLOSED') {
        setSelectedTicketId(null);
      }
      onToast(t('admin.support.toast_updated'), 'success');
    },
    onError: () => onToast(t('admin.support.toast_error'), 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, agentRef }: { id: string; agentRef: string | null }) =>
      adminApi.assignSupportTicket(id, agentRef),
    onSuccess: () => {
      refresh();
      onToast(t('admin.support.toast_updated'), 'success');
    },
    onError: () => onToast(t('admin.support.toast_error'), 'error'),
  });

  const priorityMutation = useMutation({
    mutationFn: ({
      id,
      priority,
    }: {
      id: string;
      priority: 'LOW' | 'NORMAL' | 'HIGH';
    }) => adminApi.updateSupportTicket(id, { priority }),
    onSuccess: () => {
      refresh();
      onToast(t('admin.support.toast_updated'), 'success');
    },
    onError: () => onToast(t('admin.support.toast_error'), 'error'),
  });

  const escalateMutation = useMutation({
    mutationFn: (id: string) => adminApi.escalateSupportTicket(id),
    onSuccess: () => {
      refresh();
      onToast(t('admin.support.toast_escalated'), 'success');
    },
    onError: () => onToast(t('admin.support.toast_error'), 'error'),
  });

  // With moderation: handed over, and its report not decided yet. Support
  // cannot answer or close it meanwhile.
  const withModeration =
    selectedTicket?.status === 'ESCALATED' &&
    ['PENDING', 'REVIEWING'].includes(
      selectedTicket.escalatedReport?.status ?? 'PENDING',
    );

  const { data: account } = useQuery({
    queryKey: ['admin', 'support-account', selectedTicket?.id],
    queryFn: () =>
      adminApi
        .getSupportTicketAccount(selectedTicket?.id as string)
        .then((res) => res.data),
    enabled: !!selectedTicket?.id,
  });

  const handleStatusChange = (status: TicketStatus) => {
    if (!selectedTicket) return;

    if (status === 'CLOSED' && !answered) {
      setConfirmClose(true);
      return;
    }

    updateMutation.mutate({ id: selectedTicket.id, status });
  };

  // An answer cannot be sent to a closed ticket or to one that is with
  // moderation; a note always can.
  const canAnswer = selectedTicket?.status !== 'CLOSED' && !withModeration;
  const kind = canAnswer ? draftKind : 'INTERNAL';

  const isFiltered =
    statusFilter !== '' ||
    categoryFilter !== '' ||
    whose !== 'all' ||
    priorityFilter !== '';

  return (
    <div className="flex flex-col min-h-0 gap-4">
      <AdminPageHeader
        title={t('admin.support.title')}
        subtitle={t('admin.support.subtitle')}
      />

      <AdminFilterBar>
        <AdminSegmentedControl
          value={whose}
          onChange={(value) => {
            setWhose(value as typeof whose);
            setPage(1);
            setSelectedTicketId(null);
          }}
          options={[
            { value: 'all', label: t('admin.support.whose_all') },
            { value: 'mine', label: t('admin.support.whose_mine') },
            { value: 'unassigned', label: t('admin.support.whose_unassigned') },
          ]}
        />
        <div className="sm:w-44">
          <FilterDropdown
            label={t('admin.support.filter_priority')}
            value={priorityFilter}
            onChange={(v) => {
              setPriorityFilter(v);
              setPage(1);
              setSelectedTicketId(null);
            }}
            options={[
              { value: '', label: t('admin.support.priority_all') },
              ...PRIORITIES.map((value) => ({
                value,
                label: t(`admin.support.priority.${value}`),
              })),
            ]}
          />
        </div>
        <div className="sm:w-56">
          <FilterDropdown
            label={t('admin.support.filter_status')}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
              setSelectedTicketId(null);
            }}
            options={[
              { value: '', label: t('admin.support.status_all') },
              { value: 'OPEN', label: t('admin.support.status_open') },
              { value: 'RESOLVED', label: t('admin.support.status_resolved') },
              { value: 'CLOSED', label: t('admin.support.status_closed') },
              {
                value: 'WAITING',
                label: t('admin.support.status_waiting'),
              },
              {
                value: 'ESCALATED',
                label: t('admin.support.status_escalated'),
              },
            ]}
          />
        </div>
        <div className="sm:w-56">
          <FilterDropdown
            label={t('admin.support.filter_category')}
            value={categoryFilter}
            onChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
              setSelectedTicketId(null);
            }}
            options={[
              { value: '', label: t('admin.support.category_all') },
              ...TICKET_CATEGORIES.map((value) => ({
                value,
                label: t(`supportPage.category.${value}`),
              })),
            ]}
          />
        </div>
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedTicketId}
        onBack={() => setSelectedTicketId(null)}
        onClearSelection={() => setSelectedTicketId(null)}
        listTitle={t('admin.support.list_title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={5} />
              ) : !data || data.data.length === 0 ? (
                <AdminEmptyState
                  icon={LifeBuoy}
                  title={
                    isFiltered
                      ? t('admin.support.empty_filtered_title')
                      : t('admin.support.empty_title')
                  }
                  description={
                    isFiltered
                      ? t('admin.support.empty_filtered_description')
                      : t('admin.support.empty_description')
                  }
                  compact
                />
              ) : (
                data.data.map((ticket) => (
                  <AdminListRow
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={
                      selectedTicketId === ticket.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={ticket.subject}
                    subtitle={ticket.email}
                    badge={
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${statusBadgeClass(ticket.status)}`}
                      >
                        {ticket.status === 'ESCALATED'
                          ? t('admin.support.status_escalated')
                          : ticket.status === 'WAITING'
                            ? t('admin.support.status_waiting')
                            : ticket.status}
                      </span>
                    }
                    meta={
                      <>
                        <span className="text-white/70">
                          {t(`supportPage.category.${ticket.category}`)}
                        </span>
                        {ticket.priority === 'HIGH' && (
                          <span className="font-semibold text-yellow-400">
                            {t('admin.support.priority.HIGH')}
                          </span>
                        )}
                        <span>{assigneeLabel(ticket.assignedAgentRef)}</span>
                        {ticket.status === 'OPEN' ? (
                          <WaitingTime since={ticket.createdAt} />
                        ) : (
                          <span>
                            {formatDate(ticket.createdAt, i18n.language)}
                          </span>
                        )}
                      </>
                    }
                  />
                ))
              )}
            </div>
            <div className="shrink-0 pt-2 border-t border-white/5">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          <AnimatePresence mode="wait">
            {selectedTicket ? (
              <motion.div
                key={selectedTicket.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <div className="p-4 border-b border-white/5 flex flex-col gap-3 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-white truncate">
                      {selectedTicket.subject}
                    </h3>
                    <p className="text-xs text-white/50 truncate">
                      {selectedTicket.reference
                        ? `#${selectedTicket.reference}`
                        : `ID: ${selectedTicket.id}`}
                    </p>
                  </div>
                  {withModeration && (
                    <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-3 text-sm text-white/85">
                      <p>{t('admin.support.with_moderation_notice')}</p>
                      <a
                        href={staffTabHref('reports')}
                        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-primary hover:underline"
                      >
                        {t('admin.support.view_reports')}
                        <ExternalLink size={14} aria-hidden />
                      </a>
                    </div>
                  )}
                  {selectedTicket.status === 'ESCALATED' && !withModeration && (
                    <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85">
                      {t('admin.support.moderation_decided')}
                    </p>
                  )}
                  {selectedTicket.status !== 'CLOSED' && !withModeration && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => handleStatusChange('RESOLVED')}
                        isLoading={updateMutation.isPending}
                        className="bg-green-500/20 text-green-500 hover:bg-green-500/30 border border-green-500/50 text-xs sm:text-sm font-semibold min-h-10 sm:min-h-11"
                      >
                        <CheckCircle size={16} className="mr-2 shrink-0" />
                        {t('admin.support.mark_resolved')}
                      </Button>
                      <Button
                        onClick={() => handleStatusChange('CLOSED')}
                        isLoading={updateMutation.isPending}
                        variant="secondary"
                        className="text-xs sm:text-sm font-semibold border-white/5 min-h-10 sm:min-h-11"
                      >
                        <XCircle size={16} className="mr-2 shrink-0" />
                        {t('admin.support.mark_closed')}
                      </Button>
                      {selectedTicket.status === 'OPEN' && (
                        <Button
                          onClick={() => setConfirmEscalate(true)}
                          isLoading={escalateMutation.isPending}
                          variant="secondary"
                          className="text-xs sm:text-sm font-semibold border-white/5 min-h-10 sm:min-h-11"
                        >
                          <ShieldAlert size={16} className="mr-2 shrink-0" />
                          {t('admin.support.hand_to_moderation')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 sm:p-3 space-y-3">
                  <dl className="text-sm">
                    <div className="py-2.5 border-b border-white/5">
                      <dt className="text-xs font-medium text-white/40 mb-1">
                        {t('admin.support.email_label')}
                      </dt>
                      <dd className="text-white font-semibold flex items-center gap-2">
                        <Mail size={14} className="text-white/40 shrink-0" />
                        {selectedTicket.email}
                      </dd>
                      {selectedTicket.user?.profile?.username && (
                        <dd className="text-xs text-white/50 mt-1">
                          @{selectedTicket.user?.profile?.username}
                        </dd>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5">
                      <dt className="text-xs font-medium text-white/40">
                        {t('admin.support.status_label')}
                      </dt>
                      <dd>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(selectedTicket.status)}`}
                        >
                          {selectedTicket.status === 'ESCALATED'
                            ? t('admin.support.status_escalated')
                            : selectedTicket.status === 'WAITING'
                              ? t('admin.support.status_waiting')
                              : selectedTicket.status}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5">
                      <dt className="text-xs font-medium text-white/40">
                        {t('admin.support.filter_priority')}
                      </dt>
                      <dd className="w-40">
                        <FilterDropdown
                          label={t('admin.support.set_priority')}
                          value={selectedTicket.priority ?? 'NORMAL'}
                          onChange={(value) =>
                            priorityMutation.mutate({
                              id: selectedTicket.id,
                              priority: value as 'LOW' | 'NORMAL' | 'HIGH',
                            })
                          }
                          options={PRIORITIES.map((value) => ({
                            value,
                            label: t(`admin.support.priority.${value}`),
                          }))}
                        />
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5">
                      <dt className="text-xs font-medium text-white/40">
                        {t('admin.support.assignee')}
                      </dt>
                      <dd className="flex items-center gap-2">
                        {leadsTeam && assignable ? (
                          <FilterDropdown
                            label={t('admin.support.assign_to')}
                            value={selectedTicket.assignedAgentRef ?? ''}
                            onChange={(value) =>
                              assignMutation.mutate({
                                id: selectedTicket.id,
                                agentRef: value || null,
                              })
                            }
                            options={[
                              {
                                value: '',
                                label: t('admin.support.assignee_nobody'),
                              },
                              ...assignable.map((agent) => ({
                                value: agent.ref,
                                label:
                                  agent.ref === myRef
                                    ? t('admin.support.assignee_me_named', {
                                        name: agent.name,
                                      })
                                    : agent.name,
                              })),
                              // Who has it now, when they can no longer be
                              // given tickets.
                              ...(selectedTicket.assignedAgentRef &&
                              !assignable.some(
                                (agent) =>
                                  agent.ref === selectedTicket.assignedAgentRef,
                              )
                                ? [
                                    {
                                      value: selectedTicket.assignedAgentRef,
                                      label: assigneeLabel(
                                        selectedTicket.assignedAgentRef,
                                      ),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        ) : (
                          <span className="text-sm font-semibold text-white">
                            {assigneeLabel(selectedTicket.assignedAgentRef)}
                          </span>
                        )}
                        {!leadsTeam &&
                          !selectedTicket.assignedAgentRef &&
                          myRef && (
                            <Button
                              variant="secondary"
                              className="min-h-11 text-sm"
                              isLoading={assignMutation.isPending}
                              onClick={() =>
                                assignMutation.mutate({
                                  id: selectedTicket.id,
                                  agentRef: myRef,
                                })
                              }
                            >
                              {t('admin.support.take')}
                            </Button>
                          )}
                        {!leadsTeam &&
                          selectedTicket.assignedAgentRef === myRef &&
                          myRef && (
                            <Button
                              variant="secondary"
                              className="min-h-11 text-sm"
                              isLoading={assignMutation.isPending}
                              onClick={() =>
                                assignMutation.mutate({
                                  id: selectedTicket.id,
                                  agentRef: null,
                                })
                              }
                            >
                              {t('admin.support.release')}
                            </Button>
                          )}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-white/40">
                    {t('admin.support.created_at', {
                      date: formatDateTime(
                        selectedTicket.createdAt,
                        i18n.language,
                      ),
                    })}
                  </p>

                  {account && (
                    <section
                      aria-label={t('admin.support.account.title')}
                      className="rounded-xl border border-white/10 bg-white/3 p-3"
                    >
                      <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2">
                        {t('admin.support.account.title')}
                      </p>
                      <dl className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-white/50">
                            {t('admin.support.account.plan')}
                          </dt>
                          <dd className="font-semibold text-white">
                            {account.plan
                              ? account.plan.name
                              : t('admin.support.account.no_plan')}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-white/50">
                            {t('admin.support.account.identity')}
                          </dt>
                          <dd className="font-semibold text-white">
                            {account.identityVerified
                              ? t('admin.support.account.yes')
                              : t('admin.support.account.no')}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-white/50">
                            {t('admin.support.account.payouts')}
                          </dt>
                          <dd className="font-semibold text-white">
                            {account.payouts.enabled
                              ? t('admin.support.account.payouts_enabled')
                              : account.payouts.connected
                                ? t('admin.support.account.payouts_pending')
                                : t('admin.support.account.payouts_none')}
                          </dd>
                        </div>
                      </dl>
                      <ul className="mt-2 space-y-1 border-t border-white/5 pt-2 text-sm">
                        {account.profiles.map((profile) => (
                          <li
                            key={profile.id}
                            className="flex justify-between gap-3"
                          >
                            <span className="truncate text-white/70">
                              @{profile.username}
                            </span>
                            <span
                              className={
                                profile.banned || profile.suspended
                                  ? 'font-semibold text-brand-secondary'
                                  : 'font-semibold text-white'
                              }
                            >
                              {profile.banned
                                ? t('admin.support.account.banned')
                                : profile.suspended
                                  ? t('admin.support.account.suspended')
                                  : t('admin.support.account.in_good_standing')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section
                    aria-label={t('admin.support.conversation')}
                    className="space-y-2"
                  >
                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">
                      {t('admin.support.conversation')}
                    </p>
                    {/* Until the conversation loads, what the requester wrote */}
                    {messages.length === 0 && (
                      <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                        {selectedTicket.message}
                      </p>
                    )}
                    <ol className="space-y-2">
                      {timelineOf(messages, detail?.events ?? []).map(
                        (entry) =>
                          'message' in entry ? (
                            <ConversationMessage
                              key={entry.message.id}
                              message={entry.message}
                              requester={requesterName}
                            />
                          ) : (
                            <HistoryLine
                              key={entry.event.id}
                              event={entry.event}
                              requester={requesterName}
                              agentName={assigneeLabel}
                            />
                          ),
                      )}
                    </ol>
                  </section>

                  <div className="space-y-3 pt-3 border-t border-white/5">
                    {canAnswer && (
                      <AdminSegmentedControl
                        value={draftKind}
                        onChange={(value) =>
                          setDraftKind(value as 'PUBLIC' | 'INTERNAL')
                        }
                        options={[
                          {
                            value: 'PUBLIC',
                            label: t('admin.support.kind_answer'),
                          },
                          {
                            value: 'INTERNAL',
                            label: t('admin.support.kind_note'),
                          },
                        ]}
                      />
                    )}
                    {kind === 'PUBLIC' && (
                      <SavedReplies
                        leadsTeam={leadsTeam}
                        onToast={onToast}
                        onInsert={(body) => {
                          if (!draft.trim()) {
                            setWritingFrom({
                              ticketId: selectedTicket.id,
                              lastId: lastMessageId,
                            });
                          }
                          setDraft(
                            addToDraft(
                              draft,
                              fillSavedReply(body, {
                                name: requesterGreetingName(
                                  selectedTicket.user?.profile,
                                ),
                                subject: selectedTicket.subject,
                                reference: selectedTicket.reference,
                              }),
                            ),
                          );
                        }}
                      />
                    )}
                    <Textarea
                      value={draft}
                      onChange={(e) => {
                        if (!draft.trim()) {
                          setWritingFrom({
                            ticketId: selectedTicket.id,
                            lastId: lastMessageId,
                          });
                        }
                        setDraft(e.target.value);
                      }}
                      aria-label={t(
                        kind === 'PUBLIC'
                          ? 'admin.support.kind_answer'
                          : 'admin.support.kind_note',
                      )}
                      placeholder={t(
                        kind === 'PUBLIC'
                          ? 'admin.support.reply_placeholder'
                          : 'admin.support.note_placeholder',
                      )}
                      rows={4}
                      maxLength={5000}
                    />
                    <p className="text-xs text-white/60">
                      {t(
                        kind === 'PUBLIC'
                          ? 'admin.support.answer_hint'
                          : 'admin.support.note_hint',
                      )}
                    </p>
                    {newMessageArrived && (
                      <div
                        role="status"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-yellow-400">
                            {t('admin.support.new_message_title')}
                          </p>
                          <p className="text-xs text-white/70">
                            {t('admin.support.new_message_hint')}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          className="min-h-11"
                          onClick={() =>
                            setWritingFrom({
                              ticketId: selectedTicket.id,
                              lastId: lastMessageId,
                            })
                          }
                        >
                          {t('admin.support.new_message_read')}
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {kind === 'PUBLIC' && (
                        <div className="sm:w-56">
                          <FilterDropdown
                            label={t('admin.support.leave_as')}
                            value={leaveAs}
                            onChange={(value) =>
                              setLeaveAs(value as typeof leaveAs)
                            }
                            options={[
                              {
                                value: 'RESOLVED',
                                label: t('admin.support.leave_resolved'),
                              },
                              {
                                value: 'WAITING',
                                label: t('admin.support.leave_waiting'),
                              },
                              {
                                value: 'OPEN',
                                label: t('admin.support.leave_open'),
                              },
                            ]}
                          />
                        </div>
                      )}
                      <Button
                        onClick={() => send(selectedTicket.id)}
                        isLoading={
                          messageMutation.isPending || checkingBeforeSend
                        }
                        disabled={!draft.trim() || newMessageArrived}
                        className="min-h-11"
                      >
                        {t(
                          kind === 'PUBLIC'
                            ? 'admin.support.send_answer'
                            : 'admin.support.save_note',
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-start justify-center pt-6 px-2"
              >
                <AdminEmptyState
                  icon={LifeBuoy}
                  title={t('admin.support.detail_empty_title')}
                  description={t('admin.support.detail_empty_description')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        }
      />

      <ConfirmModal
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          if (selectedTicket) {
            updateMutation.mutate({
              id: selectedTicket.id,
              status: 'CLOSED',
            });
          }
          setConfirmClose(false);
        }}
        title={t('admin.support.confirm_close_title')}
        message={t('admin.support.confirm_close_message')}
        confirmText={t('admin.shared.confirm')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={false}
      />
      <ConfirmModal
        isOpen={confirmEscalate}
        onClose={() => setConfirmEscalate(false)}
        onConfirm={() => {
          if (selectedTicket) escalateMutation.mutate(selectedTicket.id);
          setConfirmEscalate(false);
        }}
        title={t('admin.support.confirm_escalate_title')}
        message={t('admin.support.confirm_escalate_message')}
        confirmText={t('admin.support.hand_to_moderation')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={false}
      />
    </div>
  );
}
