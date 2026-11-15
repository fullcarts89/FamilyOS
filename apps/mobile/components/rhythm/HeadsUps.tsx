import type { HeadsUp } from '@familyos/domain';
import { router } from 'expo-router';
import { Car, Repeat2, Vote } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, type PressState } from '../../design/Button';
import { Hatch } from '../../design/Hatch';
import { FadeIn } from '../../design/motion';
import { Text } from '../../design/Text';
import { color, radius } from '../../design/tokens';
import type { Occurrence, WorkItem } from '../../lib/api';
import { relativeDay } from '../../lib/dates';
import type { People } from '../../lib/people';
import { CARE_VERB, timeOf } from '../../lib/rhythm';

export interface DatedHeadsUp {
  date: string;
  headsUp: HeadsUp;
}

/**
 * Heads-ups as rows you can act on: a pickup that clashes with a meeting ("Ask Theo to cover"),
 * a drop-off nobody has, a routine still open after its day. Each is a rule over real data; the
 * buttons do the thing, and the row leaves once the server agrees.
 */
export function HeadsUps({
  items,
  today,
  timeZone,
  people,
  occurrence,
  workItem,
  onCover,
  onOpen,
  onComplete,
  onAssign,
}: {
  items: DatedHeadsUp[];
  today: string;
  timeZone: string;
  people: People;
  occurrence: (key: string) => Occurrence | undefined;
  workItem: (id: string) => WorkItem | undefined;
  onCover: (o: Occurrence, memberId: string) => Promise<boolean>;
  onOpen: (o: Occurrence) => void;
  onComplete: (item: WorkItem) => void;
  onAssign: (item: WorkItem, ownerId: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.list}>
      {items.map(({ date, headsUp }) => (
        <FadeIn key={headsUp.id}>
          <HeadsUpRow
            date={date}
            h={headsUp}
            today={today}
            timeZone={timeZone}
            people={people}
            occurrence={occurrence}
            workItem={workItem}
            onCover={onCover}
            onOpen={onOpen}
            onComplete={onComplete}
            onAssign={onAssign}
          />
        </FadeIn>
      ))}
    </View>
  );
}

const dayWord = (date: string, today: string) => relativeDay(date, today, { late: false });

function HeadsUpRow({
  date,
  h,
  today,
  timeZone,
  people,
  occurrence,
  workItem,
  onCover,
  onOpen,
  onComplete,
  onAssign,
}: {
  date: string;
  h: HeadsUp;
  today: string;
  timeZone: string;
  people: People;
  occurrence: (key: string) => Occurrence | undefined;
  workItem: (id: string) => WorkItem | undefined;
  onCover: (o: Occurrence, memberId: string) => Promise<boolean>;
  onOpen: (o: Occurrence) => void;
  onComplete: (item: WorkItem) => void;
  onAssign: (item: WorkItem, ownerId: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const when = dayWord(date, today);
  const cover = async (o: Occurrence, id: string) => {
    setBusy(id);
    await onCover(o, id);
    setBusy(null);
  };

  let icon = <Hatch width={18} height={12} radius={3} />;
  let text: string;
  let actions: React.ReactNode = null;
  let open: (() => void) | null = null;

  if (h.type === 'handoff_conflict' || h.type === 'care_unassigned') {
    const o = occurrence(h.occurrenceKey);
    const child = people.byId(
      o?.careMemberId ?? (h.type === 'care_unassigned' ? h.careMemberId : null),
    );
    const what =
      child && o?.careAction
        ? `${child.name}’s ${CARE_VERB[o.careAction]}`
        : `“${o?.title ?? 'the event'}”`;
    const at = timeOf(h.time, timeZone);
    if (h.type === 'handoff_conflict') {
      const clash = occurrence(h.conflictingOccurrenceKey);
      const who = people.byId(h.memberId);
      const whose = who?.isMe ? 'Your' : `${who?.name ?? 'Someone'}’s`;
      text = `${when}: ${whose} ${clash ? `“${clash.title}”` : 'other plan'} runs into ${what} at ${at}.`;
      const others = people.adults.filter((p) => p.id !== h.memberId);
      actions = o
        ? others
            .slice(0, 2)
            .map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant="primary"
                title={p.isMe ? 'I’ll cover it' : `Ask ${p.name} to cover`}
                busy={busy === p.id}
                onPress={() => void cover(o, p.id)}
              />
            ))
        : null;
    } else {
      text = `${when}: nobody has ${what} at ${at} yet.`;
      icon = <Car size={17} color={child?.color ?? color.ink} strokeWidth={2.4} />;
      const me = people.me;
      const partner = people.partner;
      actions = o ? (
        <>
          {me && !me.caredFor ? (
            <Button
              size="sm"
              title="I’ll take it"
              busy={busy === me.id}
              onPress={() => void cover(o, me.id)}
            />
          ) : null}
          {partner ? (
            <Button
              size="sm"
              variant="secondary"
              title={`Ask ${partner.name}`}
              busy={busy === partner.id}
              onPress={() => void cover(o, partner.id)}
            />
          ) : null}
        </>
      ) : null;
    }
    if (o) open = () => onOpen(o);
  } else if (h.type === 'overdue_routine') {
    const item = workItem(h.workItemId);
    const owner = people.byId(h.ownerMemberId);
    icon = <Repeat2 size={17} color={owner?.color ?? color.ink} strokeWidth={2.4} />;
    const title = item?.title ?? 'A routine';
    const late = relativeDay(h.dueOn, today);
    text = owner
      ? `${title} · ${late} · ${owner.isMe ? 'yours' : `${owner.name}’s turn`}`
      : `${title} · ${late} · nobody has it yet`;
    actions = item ? (
      <>
        <Button
          size="sm"
          title={owner?.isMe || !owner ? 'Do it now' : 'Mark done'}
          onPress={() => onComplete(item)}
        />
        {owner?.isMe && people.partner ? (
          <Button
            size="sm"
            variant="secondary"
            title={`Hand to ${people.partner.name}`}
            onPress={() => onAssign(item, people.partner?.id ?? null)}
          />
        ) : !owner?.isMe && people.me ? (
          <Button
            size="sm"
            variant="secondary"
            title="I’ll take it"
            onPress={() => onAssign(item, people.me?.id ?? null)}
          />
        ) : null}
      </>
    ) : null;
    open = () => router.push({ pathname: '/item/[id]', params: { id: h.workItemId } });
  } else {
    icon = <Vote size={17} color={color.ink} strokeWidth={2.2} />;
    text = h.text;
    open = () => router.push('/reset');
  }

  return (
    <View style={styles.row}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.body}>
        <Pressable
          accessibilityRole={open ? 'button' : undefined}
          accessibilityHint={open ? 'Opens the details' : undefined}
          disabled={!open}
          onPress={open ?? undefined}
          style={(s: PressState) => [
            open && { cursor: 'pointer' },
            s.hovered && open && { opacity: 0.8 },
          ]}
        >
          <Text variant="title">{text}</Text>
        </Pressable>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  icon: { width: 22, paddingTop: 3, alignItems: 'center' },
  body: { flex: 1, gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
