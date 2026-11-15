import { dueOptions, workItemMachine, type WorkItemStatus } from '@familyos/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Lock, Repeat2, Send } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { TaskRow } from '../../../components/tasks/TaskRow';
import { Avatar, Either } from '../../../design/Avatar';
import { Button, type PressState } from '../../../design/Button';
import { Chip } from '../../../design/Chip';
import { Hatch } from '../../../design/Hatch';
import { useLayout } from '../../../design/layout';
import {
  FadeIn,
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  useCelebrate,
} from '../../../design/motion';
import { ErrorNotice } from '../../../design/Notice';
import { Page } from '../../../design/Page';
import { RoundCheckbox } from '../../../design/RoundCheckbox';
import { SectionHeader } from '../../../design/Section';
import { Text } from '../../../design/Text';
import { useToast } from '../../../design/Toast';
import { color, font, radius } from '../../../design/tokens';
import {
  api,
  errorMessage,
  type Comment,
  type ItemDetail,
  type TodayResponse,
  type WorkItem,
} from '../../../lib/api';
import { useCapture } from '../../../lib/capture';
import { addDays, relativeDay } from '../../../lib/dates';
import { useHousehold } from '../../../lib/household';
import { goBack } from '../../../lib/navigation';
import { usePeople } from '../../../lib/people';
import {
  CLOSED,
  STATUS_NOTE,
  STATUS_SENTENCE,
  actionLabel,
  canTick,
  dueDate,
  dueText,
  isDone,
  useTaskActions,
  whenOf,
} from '../../../lib/tasks';

/** What a history entry says, from its action and its (content-free) payload. */
function describe(action: string, payload: { toStatus?: WorkItemStatus; fields?: string[] }) {
  if (action === 'work_item.updated' && payload.toStatus) {
    const to = payload.toStatus;
    return to === 'verified_complete'
      ? 'marked it done'
      : `moved it to “${STATUS_NOTE[to] ?? 'to do'}”`;
  }
  if (action === 'work_item.updated' && payload.fields?.includes('owner_member_id'))
    return 'changed who has it';
  if (action === 'work_item.updated' && payload.fields?.some((f) => f.startsWith('due')))
    return 'changed the day';
  return HISTORY[action] ?? 'updated it';
}

const HISTORY: Record<string, string> = {
  'work_item.captured': 'captured this',
  'work_item.created': 'added this',
  'work_item.accepted': 'kept it from the inbox',
  'work_item.discarded': 'let it go',
  'work_item.updated': 'updated it',
  'work_item.commented': 'commented',
  'routine.occurrence_created': 'scheduled this from the routine',
  'routine.occurrence_skipped': 'skipped this one',
  'routine.occurrence_unskipped': 'brought this one back',
  'routine.occurrence_reassigned': 'changed whose turn it is',
  'routine.occurrence_paused': 'paused the routine',
  'routine.occurrence_resumed': 'resumed the routine',
  'routine.occurrence_cancelled': 'ended the routine',
};

// One task or project: what it is, where it stands, who has it and when, its steps, the
// conversation and its history. Every status change is offered in plain words.
export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const { desktop } = useLayout();
  const { changed } = useCapture();
  const { celebrate } = useCelebrate();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [projects, setProjects] = useState<WorkItem[]>([]);
  const [today, setToday] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [comment, setComment] = useState('');
  const [subtask, setSubtask] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hid = household?.id ?? '';
  const base = `/households/${hid}/work-items/${id}`;

  const load = useCallback(async () => {
    if (!household || !id) return;
    try {
      const [d, c, td, list] = await Promise.all([
        api<ItemDetail>(base),
        api<{ comments: Comment[] }>(`${base}/comments`),
        api<TodayResponse>(`/households/${household.id}/today`),
        api<{ items: WorkItem[] }>(`/households/${household.id}/work-items`),
      ]);
      setDetail(d);
      setTitle(d.item.title);
      setNotes(d.item.description ?? '');
      setComments(c.comments);
      setToday(td.date);
      setProjects(list.items.filter((i) => i.type === 'project' && !CLOSED.includes(i.status)));
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }, [household, id, base]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChange = useCallback((item: WorkItem) => {
    setDetail((d) =>
      d
        ? d.item.id === item.id
          ? { ...d, item }
          : { ...d, subtasks: d.subtasks.map((s) => (s.id === item.id ? item : s)) }
        : d,
    );
  }, []);
  const actions = useTaskActions(onChange, ({ kind, after }) => {
    changed();
    void load();
    if (kind !== 'completed') return;
    if (after.type === 'project') {
      celebrate({
        key: `project-done:${after.id}`,
        title: `${after.title} is finished`,
        line: 'That one took real work. It’s done.',
        colors: people.all.map((p) => p.color),
      });
    } else if (detail?.item.type === 'project' && after.parentId === detail.item.id) {
      const remaining = detail.subtasks.filter((s) => s.id !== after.id && !isDone(s));
      if (remaining.length === 0) {
        celebrate({
          key: `project-steps-done:${detail.item.id}`,
          title: `Every step of ${detail.item.title} is done`,
          line: 'All that’s left is to call it finished.',
          colors: people.all.map((p) => p.color),
        });
      }
    }
  });

  if (!household) return null;
  if (!detail) {
    return (
      <Page maxWidth={1100}>
        {loadError ? (
          <ErrorNotice message={loadError} onRetry={load} />
        ) : (
          <Skeleton label="Loading">
            <SkeletonBlock width={120} height={12} />
            <View style={{ height: 14 }} />
            <SkeletonBlock width="60%" height={34} />
            <View style={{ height: 24 }} />
            <SkeletonRows count={3} />
          </Skeleton>
        )}
      </Page>
    );
  }

  const { item, subtasks, progress, timeline, routine } = detail;
  const done = isDone(item);
  const owner = people.byId(item.ownerMemberId);
  const due = today ? dueText(item, today, timeZone) : null;
  const late = today && !CLOSED.includes(item.status) && whenOf(item, today, timeZone) === 'late';
  const parent = item.parentId ? projects.find((p) => p.id === item.parentId) : null;
  const next = item.status === 'new' ? [] : workItemMachine.table[item.status];

  const run = async (work: () => Promise<unknown>, success?: string) => {
    setError(null);
    try {
      await work();
      if (success) toast.show(success);
      changed();
    } catch (caught) {
      setError(errorMessage(caught));
    }
    await load();
  };

  const setStatus = (status: WorkItemStatus) =>
    status === 'verified_complete'
      ? actions.complete(item)
      : run(
          () => actions.patch(item, { status }),
          `${actionLabel(status, item.status)}: ${item.title}`,
        );

  const saveText = () => {
    const changes: Record<string, unknown> = {};
    if (title.trim() && title.trim() !== item.title) changes.title = title.trim();
    if ((notes || null) !== (item.description || null)) changes.description = notes || null;
    if (Object.keys(changes).length) void run(() => actions.patch(item, changes), 'Saved');
  };

  const kicker =
    item.type === 'project'
      ? 'Project'
      : routine
        ? 'Routine'
        : parent
          ? `Step in ${parent.title}`
          : 'Task';

  const headline = (
    <View style={styles.headline}>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          parent
            ? router.push({ pathname: '/item/[id]', params: { id: parent.id } })
            : goBack('/tasks')
        }
        style={styles.back}
      >
        <ArrowLeft size={16} color={color.muted} strokeWidth={2.2} />
        <Text variant="label" tone="muted">
          {parent ? parent.title : 'Tasks'}
        </Text>
      </Pressable>
      <Text variant="kicker" tone="muted">
        {kicker}
        {item.visibility === 'private' ? ' · Private' : ''}
      </Text>
      <View style={styles.titleRow}>
        {item.status !== 'new' ? (
          <View style={styles.titleCheck}>
            <RoundCheckbox
              size={30}
              checked={done}
              waiting={!done && !canTick(item)}
              color={owner?.color ?? color.ink}
              label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
              onPress={() => (done ? actions.reopen(item) : actions.complete(item))}
            />
          </View>
        ) : null}
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveText}
          multiline
          accessibilityLabel="Title"
          maxLength={500}
          style={[styles.title, done && styles.titleDone]}
        />
      </View>
      <Text variant="lead" tone="muted">
        {STATUS_SENTENCE[item.status]}
        {due && !done
          ? ` ${due.includes('late') ? 'It’s' : 'Due'} ${due.charAt(0).toLowerCase()}${due.slice(1)}.`
          : ''}
      </Text>
    </View>
  );

  const lateCallout =
    late && today ? (
      <View style={styles.late}>
        <View style={styles.lateHead}>
          <Hatch width={18} height={12} radius={3} />
          <Text variant="label">
            This was due{' '}
            {relativeDay(dueDate(item, timeZone) ?? today, today, { late: false }).toLowerCase()}.
            What’s next?
          </Text>
        </View>
        <View style={styles.chips}>
          <Button
            title="Do it today"
            size="sm"
            onPress={() => actions.reschedule(item, today, 'Moved to today')}
          />
          <Button
            title="Move to tomorrow"
            size="sm"
            variant="secondary"
            onPress={() => actions.reschedule(item, addDays(today, 1), 'Moved to tomorrow')}
          />
          {people.partner && owner?.isMe ? (
            <Button
              title={`Hand to ${people.partner.name}`}
              size="sm"
              variant="secondary"
              onPress={() => actions.assign(item, people.partner?.id ?? null)}
            />
          ) : null}
        </View>
      </View>
    ) : null;

  const statusActions =
    next.length > 0 ? (
      <View style={styles.block}>
        <Text variant="kicker" tone="muted">
          Where it stands
        </Text>
        <View style={styles.chips}>
          {next.map((status) => (
            <Chip
              key={status}
              label={actionLabel(status, item.status)}
              selected={false}
              onPress={() => void setStatus(status)}
            />
          ))}
        </View>
      </View>
    ) : item.status === 'new' ? (
      <View style={styles.block}>
        <Text variant="body" tone="muted">
          This is still in the inbox.
        </Text>
        <Button
          title="Sort the inbox"
          size="sm"
          variant="secondary"
          onPress={() => router.push('/inbox')}
        />
      </View>
    ) : null;

  const notesBlock = (
    <View style={styles.block}>
      <Text variant="kicker" tone="muted">
        Notes
      </Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        onBlur={saveText}
        multiline
        placeholder="Add details: numbers, links, what was agreed…"
        placeholderTextColor={color.faint}
        accessibilityLabel="Notes"
        maxLength={10000}
        style={styles.notes}
      />
    </View>
  );

  const steps =
    item.type === 'project' ? (
      <View style={styles.section}>
        <SectionHeader
          title="Steps"
          sub={progress ? `${progress.done} of ${progress.total} done` : undefined}
        />
        {progress && progress.total > 0 ? (
          <View style={styles.progress} aria-hidden>
            {subtasks.map((s) => (
              <View
                key={s.id}
                style={[
                  styles.progressBead,
                  {
                    borderColor: people.colorOf(s.ownerMemberId),
                    backgroundColor: isDone(s) ? people.colorOf(s.ownerMemberId) : color.surface,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
        {subtasks.map((s, i) => (
          <TaskRow
            key={s.id}
            item={s}
            today={today}
            onComplete={actions.complete}
            onReopen={actions.reopen}
            onAssign={actions.assign}
            onReschedule={actions.reschedule}
            last={i === subtasks.length - 1}
          />
        ))}
        <View style={styles.addRow}>
          <TextInput
            value={subtask}
            onChangeText={setSubtask}
            placeholder="Add a step"
            placeholderTextColor={color.faint}
            accessibilityLabel="Add a step"
            maxLength={500}
            onSubmitEditing={() =>
              subtask.trim() &&
              void run(async () => {
                await api(`/households/${hid}/work-items`, {
                  method: 'POST',
                  body: { title: subtask, parentId: item.id, inbox: false },
                });
                setSubtask('');
              })
            }
            style={styles.addInput}
          />
          <Button
            title="Add step"
            size="sm"
            disabled={!subtask.trim()}
            onPress={() =>
              void run(async () => {
                await api(`/households/${hid}/work-items`, {
                  method: 'POST',
                  body: { title: subtask, parentId: item.id, inbox: false },
                });
                setSubtask('');
              })
            }
          />
        </View>
      </View>
    ) : null;

  const conversation = (
    <View style={styles.section}>
      <SectionHeader title="Conversation" sub={comments.length ? undefined : 'Nothing yet'} />
      {comments.map((c) => {
        const by = people.byId(c.authorMemberId);
        return (
          <View key={c.id} style={styles.comment}>
            <Avatar person={by} size={28} />
            <View style={styles.commentBody}>
              <Text variant="label">
                {by ? (by.isMe ? 'You' : by.name) : 'Someone'}{' '}
                <Text variant="small" tone="faint">
                  {when(c.createdAt, timeZone)}
                </Text>
              </Text>
              <Text variant="body">{c.body}</Text>
            </View>
          </View>
        );
      })}
      <View style={styles.commentInputRow}>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Write a note to the household…"
          placeholderTextColor={color.faint}
          accessibilityLabel="Add a comment"
          multiline
          maxLength={4000}
          style={styles.commentInput}
        />
        <Button
          title="Post"
          size="sm"
          icon={Send}
          disabled={!comment.trim()}
          onPress={() =>
            void run(async () => {
              await api(`${base}/comments`, { method: 'POST', body: { body: comment } });
              setComment('');
            })
          }
        />
      </View>
    </View>
  );

  const side = (
    <View style={[styles.side, desktop && styles.sideWide]}>
      {item.status !== 'new' ? (
        <View style={styles.block}>
          <Text variant="kicker" tone="muted">
            Who has it
          </Text>
          <View style={styles.chips}>
            {people.assignable.map((p) => (
              <Chip
                key={p.id}
                label={p.isMe ? 'Me' : p.name}
                leading={<Avatar person={p} size={18} />}
                accent={p.color}
                selected={item.ownerMemberId === p.id}
                onPress={() => item.ownerMemberId !== p.id && void actions.assign(item, p.id)}
              />
            ))}
            <Chip
              label="Either of us"
              leading={<Either size={18} />}
              selected={item.ownerMemberId === null}
              onPress={() => item.ownerMemberId !== null && void actions.assign(item, null)}
            />
          </View>
        </View>
      ) : null}
      {today && !routine ? (
        <View style={styles.block}>
          <Text variant="kicker" tone="muted">
            When
          </Text>
          <View style={styles.chips}>
            {dueOptions(today).map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                selected={item.dueOn === o.date}
                onPress={() =>
                  item.dueOn !== o.date &&
                  void run(
                    () => actions.patch(item, { dueOn: o.date }),
                    `Moved to ${o.label.toLowerCase()}`,
                  )
                }
              />
            ))}
            <Chip
              label="No date"
              selected={!item.dueOn && !item.dueAt}
              onPress={() =>
                (item.dueOn || item.dueAt) &&
                void run(() => actions.patch(item, { dueOn: null, dueAt: null }), 'Date cleared')
              }
            />
          </View>
          {due && !dueOptions(today).some((o) => o.date === item.dueOn) ? (
            <Text variant="meta" tone="muted">
              Now: {due}
            </Text>
          ) : null}
        </View>
      ) : null}
      {item.type !== 'project' && !routine && subtasks.length === 0 && projects.length > 0 ? (
        <View style={styles.block}>
          <Text variant="kicker" tone="muted">
            Project
          </Text>
          <View style={styles.chips}>
            {projects.map((p) => (
              <Chip
                key={p.id}
                label={p.title}
                selected={item.parentId === p.id}
                onPress={() =>
                  void run(
                    () => actions.patch(item, { parentId: item.parentId === p.id ? null : p.id }),
                    item.parentId === p.id ? 'Taken out of the project' : `Added to ${p.title}`,
                  )
                }
              />
            ))}
          </View>
        </View>
      ) : null}
      {routine ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/routine/[id]', params: { id: routine.id } })}
          style={(s: PressState) => [styles.routine, s.hovered && { borderColor: color.ink }]}
        >
          <Repeat2 size={18} color={color.ink} strokeWidth={2.2} />
          <View style={styles.routineText}>
            <Text variant="label">{routine.title}</Text>
            <Text variant="meta" tone="muted">
              One turn of a routine. Open the routine
            </Text>
          </View>
        </Pressable>
      ) : null}
      {routine &&
      !routine.ended &&
      item.occurrenceIndex !== null &&
      !CLOSED.includes(item.status) ? (
        <Button
          title="Skip this one"
          size="sm"
          variant="secondary"
          onPress={() =>
            void run(
              () =>
                api(
                  `/households/${hid}/routines/${routine.id}/occurrences/${item.occurrenceIndex}/skip`,
                  {
                    method: 'POST',
                    body: { expectedVersion: routine.version },
                  },
                ),
              `Skipped this time: ${item.title}`,
            )
          }
        />
      ) : null}
      {item.visibility === 'private' ? (
        <View style={styles.private}>
          <Lock size={14} color={color.muted} />
          <Text variant="meta" tone="muted">
            Only you can see this.
          </Text>
        </View>
      ) : null}
      <View style={styles.block}>
        <Text variant="kicker" tone="muted">
          History
        </Text>
        {timeline.map((e) => (
          <Text key={e.id} variant="small" tone="muted">
            <Text variant="small">
              {e.actorMemberId ? people.label(e.actorMemberId, 'Someone') : 'FamilyOS'}
            </Text>{' '}
            {describe(e.action, e.payload)} · {when(e.createdAt, timeZone)}
          </Text>
        ))}
      </View>
    </View>
  );

  return (
    <Page maxWidth={1180}>
      <FadeIn>
        {headline}
        {error ? (
          <View style={styles.block}>
            <ErrorNotice message={error} onRetry={load} />
          </View>
        ) : null}
        {lateCallout}
        <View style={[styles.body, desktop && styles.bodyWide]}>
          <View style={styles.main}>
            {statusActions}
            {notesBlock}
            {steps}
            {conversation}
          </View>
          {side}
        </View>
      </FadeIn>
    </Page>
  );
}

function when(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const styles = StyleSheet.create({
  headline: { gap: 8 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    alignSelf: 'flex-start',
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  titleCheck: { paddingTop: 10 },
  title: {
    flex: 1,
    fontFamily: font.serif,
    fontSize: 38,
    lineHeight: 46,
    color: color.ink,
    paddingVertical: 2,
  },
  titleDone: { color: color.muted, textDecorationLine: 'line-through' },
  late: {
    marginTop: 20,
    gap: 10,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.ink,
  },
  lateHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { marginTop: 8, gap: 8 },
  bodyWide: { flexDirection: 'row', gap: 56, alignItems: 'flex-start' },
  main: { flex: 1.5, minWidth: 0 },
  side: { gap: 4 },
  sideWide: {
    flex: 1,
    minWidth: 0,
    marginTop: 24,
    paddingLeft: 28,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
  },
  block: { marginTop: 24, gap: 10 },
  section: { marginTop: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notes: {
    minHeight: 96,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    fontFamily: font.ui,
    fontSize: 15,
    lineHeight: 22,
    color: color.ink,
    textAlignVertical: 'top',
  },
  progress: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 14 },
  progressBead: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  addInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    fontFamily: font.ui,
    fontSize: 15,
    color: color.ink,
  },
  comment: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  commentBody: { flex: 1, gap: 2 },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 12 },
  commentInput: {
    flex: 1,
    minHeight: 48,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    fontFamily: font.ui,
    fontSize: 15,
    color: color.ink,
  },
  routine: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    cursor: 'pointer',
  },
  routineText: { flex: 1 },
  private: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
});
