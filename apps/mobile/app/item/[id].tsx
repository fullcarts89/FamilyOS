import {
  STATUS_ACTIONS,
  STATUS_PRESENTATION,
  describeDue,
  workItemMachine,
  type WorkItemStatus,
} from '@familyos/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Chip, ItemRow, ListScreen, Section, StatusBadge } from '../../components/items';
import { Body, Button, ErrorText, Field, Title } from '../../components/ui';
import {
  api,
  errorMessage,
  type Comment,
  type ItemDetail,
  type TodayResponse,
} from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { goBack } from '../../lib/navigation';
import { useTheme } from '../../lib/theme';

/** What a timeline entry says, from its action and its (content-free) payload. */
function describe(
  action: string,
  payload: { toStatus?: WorkItemStatus; fields?: string[] },
): string {
  if (action === 'work_item.updated' && payload.toStatus)
    return `moved it to “${STATUS_PRESENTATION[payload.toStatus].label}”`;
  if (action === 'work_item.updated' && payload.fields?.includes('owner_member_id'))
    return 'changed the owner';
  return TIMELINE_LABELS[action] ?? 'updated it';
}

const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
const CLOSED: readonly WorkItemStatus[] = [...DONE, 'cancelled'];

const TIMELINE_LABELS: Record<string, string> = {
  'work_item.captured': 'captured this',
  'work_item.created': 'created this',
  'work_item.accepted': 'accepted it from the inbox',
  'work_item.discarded': 'discarded it',
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

export default function ItemScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household, members, memberName, timeZone } = useHousehold();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [today, setToday] = useState('');
  const [comment, setComment] = useState('');
  const [subtask, setSubtask] = useState('');
  const [error, setError] = useState<string | null>(null);

  const base = household ? `/households/${household.id}/work-items/${id}` : '';

  const load = useCallback(async () => {
    if (!household || !id) return;
    try {
      const [d, c, td] = await Promise.all([
        api<ItemDetail>(base),
        api<{ comments: Comment[] }>(`${base}/comments`),
        api<TodayResponse>(`/households/${household.id}/today`),
      ]);
      setDetail(d);
      setComments(c.comments);
      setToday(td.date);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [household, id, base]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!household) return null;
  if (!detail) {
    return (
      <ListScreen footer={<Button title="Back" onPress={() => goBack()} />}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator />}
      </ListScreen>
    );
  }

  const { item, subtasks, progress, timeline, routine } = detail;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
      await load();
    }
  };

  const setStatus = (status: WorkItemStatus) =>
    run(() =>
      api(base, {
        method: 'PATCH',
        // Choosing "Done — I confirm it" is the member's explicit confirmation (evidence E3).
        body: {
          expectedVersion: item.version,
          status,
          ...(status === 'verified_complete' && { confirmed: true }),
        },
      }),
    );

  const setOwner = (ownerMemberId: string | null) =>
    run(() =>
      api(base, { method: 'PATCH', body: { expectedVersion: item.version, ownerMemberId } }),
    );

  const nextStatuses = item.status === 'new' ? [] : workItemMachine.table[item.status];
  const due = today ? describeDue(item, today, timeZone) : null;

  return (
    <ListScreen footer={<Button title="Back" onPress={() => goBack()} />}>
      <Title>{item.title}</Title>
      <View style={styles.row}>
        <StatusBadge status={item.status} />
        {due ? <Body muted>Due {due}</Body> : null}
        {item.visibility === 'private' ? <Body muted>Private</Body> : null}
      </View>
      {item.description ? <Body>{item.description}</Body> : null}
      {routine && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/routine/[id]', params: { id: routine.id } })}
        >
          <Body muted>↻ Part of the routine “{routine.title}” →</Body>
        </Pressable>
      )}
      {error && <ErrorText>{error}</ErrorText>}

      {item.status === 'new' ? (
        <Body muted>This is still in the inbox. Sort it from Today.</Body>
      ) : (
        <Section title="Owner" row>
          {members
            .filter((m) => m.role !== 'child')
            .map((m) => (
              <Chip
                key={m.id}
                label={m.displayName}
                selected={item.ownerMemberId === m.id}
                onPress={() => setOwner(item.ownerMemberId === m.id ? null : m.id)}
              />
            ))}
        </Section>
      )}

      {routine &&
        !routine.ended &&
        item.occurrenceIndex !== null &&
        !CLOSED.includes(item.status) && (
          <Section title="This occurrence" row>
            {[
              <Chip
                key="skip"
                label="Skip this one"
                selected={false}
                onPress={() =>
                  run(() =>
                    api(
                      `/households/${household.id}/routines/${routine.id}/occurrences/${item.occurrenceIndex}/skip`,
                      { method: 'POST', body: { expectedVersion: routine.version } },
                    ),
                  )
                }
              />,
            ]}
          </Section>
        )}

      {nextStatuses.length > 0 && (
        <Section title="Change status" row>
          {nextStatuses.map((status) => (
            <Chip
              key={status}
              label={
                status === 'in_progress' && DONE.includes(item.status)
                  ? 'Reopen'
                  : (STATUS_ACTIONS[status] ?? status)
              }
              selected={false}
              onPress={() => setStatus(status)}
            />
          ))}
        </Section>
      )}

      {item.type === 'project' && (
        <Section
          title={progress ? `Subtasks · ${progress.done} of ${progress.total} done` : 'Subtasks'}
        >
          {[
            ...subtasks.map((s) => <ItemRow key={s.id} item={s} today={today} />),
            <View key="add" style={styles.add}>
              <View style={styles.addField}>
                <Field
                  label="Add a subtask"
                  value={subtask}
                  onChangeText={setSubtask}
                  maxLength={500}
                />
              </View>
              <Button
                title="Add"
                disabled={!subtask.trim()}
                onPress={() =>
                  run(async () => {
                    await api(`/households/${household.id}/work-items`, {
                      method: 'POST',
                      body: { title: subtask, parentId: item.id, inbox: false },
                    });
                    setSubtask('');
                  })
                }
              />
            </View>,
          ]}
        </Section>
      )}

      <Section title="Comments" empty="No comments yet.">
        {comments.map((c) => (
          <View key={c.id} style={[styles.comment, { borderColor: t.border }]}>
            <Text style={[styles.commentAuthor, { color: t.muted }]}>
              {memberName(c.authorMemberId) ?? 'Someone'}
            </Text>
            <Text style={{ color: t.text, fontSize: 15 }}>{c.body}</Text>
          </View>
        ))}
      </Section>
      <Field
        label="Add a comment"
        value={comment}
        onChangeText={setComment}
        maxLength={4000}
        multiline
      />
      <Button
        title="Post comment"
        disabled={!comment.trim()}
        onPress={() =>
          run(async () => {
            await api(`${base}/comments`, { method: 'POST', body: { body: comment } });
            setComment('');
          })
        }
      />

      <Section title="Timeline">
        {timeline.map((e) => (
          <Text key={e.id} style={{ color: t.muted, fontSize: 13 }}>
            {e.actorMemberId ? (memberName(e.actorMemberId) ?? 'Someone') : 'FamilyOS'}{' '}
            {describe(e.action, e.payload)} · {new Date(e.createdAt).toLocaleString()}
          </Text>
        ))}
      </Section>
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  add: { gap: 8 },
  addField: { flex: 1 },
  comment: { borderLeftWidth: 3, paddingLeft: 10, gap: 2 },
  commentAuthor: { fontSize: 13, fontWeight: '600' },
});
