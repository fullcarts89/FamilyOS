import { dueOptions } from '@familyos/domain';
import { CalendarDays, CornerDownLeft, Flag, FolderKanban, Inbox } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { api, errorMessage, type TodayResponse, type WorkItem } from '../lib/api';
import { parseCapture } from '../lib/capture-parse';
import { useHousehold } from '../lib/household';
import { usePeople, type Person } from '../lib/people';
import { Avatar, Either } from './Avatar';
import { Button, type PressState } from './Button';
import { Chip, TagChip } from './Chip';
import { useLayout } from './layout';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useToast } from './Toast';
import { color, em, font, radius } from './tokens';

/**
 * Quick capture with a live preview: type "Call the plumber tomorrow @sam #bathroom" and see the
 * day, project and whose list it lands on before adding it. Nothing is guessed by AI.
 */
export function CaptureSheet({
  initialOwner,
  onClose,
  onCreated,
}: {
  /** undefined: me; null: either of you; else a member id. */
  initialOwner: string | null | undefined;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const { phone } = useLayout();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [raw, setRaw] = useState('');
  const [picked, setPicked] = useState<string | null>(
    initialOwner === undefined ? (people.me?.id ?? null) : initialOwner,
  );
  const [pickedDue, setPickedDue] = useState<string | null>(null);
  const [project, setProject] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [projects, setProjects] = useState<WorkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    const base = `/households/${household.id}`;
    api<TodayResponse>(`${base}/today`)
      .then((t) => setToday(t.date))
      .catch(() => setToday(null));
    api<{ items: WorkItem[] }>(`${base}/work-items`)
      .then((r) =>
        setProjects(
          r.items.filter(
            (i) => i.type === 'project' && !['verified_complete', 'done_unverified'].includes(i.status),
          ),
        ),
      )
      .catch(() => setProjects([]));
    const focus = setTimeout(() => input.current?.focus(), 80);
    return () => clearTimeout(focus);
  }, [household]);

  const parsed = useMemo(
    () =>
      parseCapture(
        raw,
        today,
        people.assignable.map((p) => ({ id: p.id, name: p.name, isMe: p.isMe })),
        projects.map((p) => ({ id: p.id, title: p.title })),
      ),
    [raw, today, people.assignable, projects],
  );

  // A name typed in the text ("@sam", "for us") wins over the tapped target.
  const owner = parsed.ownerId !== undefined ? parsed.ownerId : picked;
  const dueOn = parsed.dueOn ?? pickedDue;
  const dueLabel =
    parsed.dueLabel ??
    (pickedDue && today ? (dueOptions(today).find((o) => o.date === pickedDue)?.label ?? null) : null);
  const inProject = projects.find((p) => p.id === parsed.projectId) ?? null;
  const ownerPerson = people.byId(owner);
  const targets: (Person | null)[] = [...people.assignable.slice(0, phone ? 2 : 3), null];

  const save = async (inbox: boolean) => {
    if (!household || !parsed.title) return;
    setBusy(true);
    setError(null);
    try {
      const { item } = await api<{ item: WorkItem }>(`/households/${household.id}/work-items`, {
        method: 'POST',
        body: {
          title: parsed.title,
          type: project ? 'project' : 'task',
          inbox,
          ownerMemberId: owner,
          dueOn,
          ...(inProject && !project && { parentId: inProject.id }),
          ...(parsed.important && { priority: 1 }),
        },
      });
      onCreated();
      onClose();
      const where = inbox
        ? 'the inbox'
        : owner === null
          ? 'up for grabs'
          : ownerPerson?.isMe
            ? 'your list'
            : `${ownerPerson?.name ?? 'their'}’s list`;
      toast.show(`Added to ${where}: ${item.title}`, {
        undo: async () => {
          await api(`/households/${household.id}/work-items/${item.id}`, {
            method: 'PATCH',
            body: { expectedVersion: item.version, status: 'cancelled' },
          }).catch(() => undefined);
          onCreated();
        },
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel =
    owner === null
      ? 'Add to up for grabs'
      : ownerPerson?.isMe
        ? 'Add to your list'
        : `Add to ${ownerPerson?.name ?? 'their'}’s list`;

  return (
    <Sheet
      visible
      onClose={onClose}
      label="Capture something for the household"
      title="What needs doing?"
      width={600}
      anchor="top-right"
      footer={
        <>
          {error ? (
            <Text variant="meta" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={styles.foot}>
            <Button
              title="Put in the inbox"
              variant="quiet"
              size="sm"
              icon={Inbox}
              disabled={!parsed.title || busy}
              onPress={() => save(true)}
              accessibilityLabel="Put it in the inbox to sort later"
            />
            <Button
              title={submitLabel}
              icon={CornerDownLeft}
              iconRight
              busy={busy}
              disabled={!parsed.title}
              onPress={() => save(false)}
            />
          </View>
        </>
      }
    >
      <TextInput
        ref={input}
        value={raw}
        onChangeText={setRaw}
        placeholder="Call the plumber tomorrow"
        placeholderTextColor={color.faint}
        accessibilityLabel="What needs doing?"
        accessibilityHint="Type @ and a name, a day like tomorrow, or # and a project"
        maxLength={500}
        returnKeyType="done"
        onSubmitEditing={() => parsed.title && void save(false)}
        style={[styles.input, phone && styles.inputPhone]}
      />

      <View style={styles.chips} aria-live="polite">
        <TagChip icon={CalendarDays} on={!!dueOn} label={dueLabel ?? 'No day yet'} />
        <TagChip
          icon={FolderKanban}
          on={!!inProject}
          label={inProject ? inProject.title : project ? 'New project' : 'No project'}
        />
        {parsed.important ? <TagChip icon={Flag} on label="Important" /> : null}
      </View>

      <View style={styles.targets} accessibilityRole="radiogroup" accessibilityLabel="Whose list">
        {targets.map((p) => {
          const id = p?.id ?? null;
          const on = owner === id;
          const c = p?.color ?? color.ink;
          return (
            <Pressable
              key={id ?? 'shared'}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={p ? (p.isMe ? 'You' : p.name) : 'Either of you'}
              onPress={() => {
                setPicked(id);
                // Tapping a target overrides a typed @name.
                if (parsed.ownerId !== undefined) setRaw((r) => r.replace(/(^|\s)(@|for\s+)\S+/i, ' ').trim());
              }}
              style={(s: PressState) => [
                styles.target,
                on && { borderColor: c, backgroundColor: color.surface },
                !on && s.hovered && { borderColor: color.line2 },
              ]}
            >
              <View style={styles.targetTop}>
                {p ? <Avatar person={p} size={22} /> : <Either size={22} />}
                <Text variant="h3" style={styles.targetName} numberOfLines={1}>
                  {p ? (p.isMe ? 'You' : p.name) : 'Either'}
                </Text>
              </View>
              {!phone ? (
                <Text variant="small" tone="muted">
                  {p ? (p.isMe ? 'On you' : `${p.name}’s handling`) : 'Up for grabs'}
                </Text>
              ) : null}
              <View style={styles.ghost}>
                {on && parsed.title ? (
                  <>
                    <View style={[styles.ghostBead, { borderColor: c }]} />
                    <Text variant="small" numberOfLines={2} style={styles.ghostText}>
                      {parsed.title}
                    </Text>
                  </>
                ) : on ? (
                  <Text variant="small" tone="faint">
                    Lands here
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {today ? (
        <View style={styles.chips}>
          {dueOptions(today).map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              selected={dueOn === o.date && !parsed.dueOn}
              onPress={() => setPickedDue(pickedDue === o.date ? null : o.date)}
            />
          ))}
          <Chip
            label="Project with steps"
            icon={FolderKanban}
            selected={project}
            onPress={() => setProject((v) => !v)}
          />
        </View>
      ) : null}

      <View style={styles.hint}>
        <Text variant="small" tone="muted">
          Try
        </Text>
        {[
          `@${(people.partner ?? people.me)?.name.split(' ')[0]?.toLowerCase() ?? 'name'}`,
          'tomorrow',
          projects[0] ? `#${projects[0].title.split(/\s+/)[0]?.toLowerCase()}` : '#project',
          '!',
        ].map((code) => (
          <View key={code} style={styles.code}>
            <Text variant="small">{code}</Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: font.displaySemi,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: em(28, -0.02),
    color: color.ink,
    borderBottomWidth: 2,
    borderBottomColor: color.ink,
    paddingTop: 4,
    paddingBottom: 10,
  },
  inputPhone: { fontSize: 23, lineHeight: 30 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  targets: { flexDirection: 'row', gap: 8 },
  target: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    gap: 6,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.ground,
    cursor: 'pointer',
  },
  targetTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  targetName: { fontSize: 15.5, lineHeight: 19, flexShrink: 1 },
  ghost: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, minHeight: 18 },
  ghostBead: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 1 },
  ghostText: { flex: 1 },
  hint: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  code: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: color.lane,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
});
