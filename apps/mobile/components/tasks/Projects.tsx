import { router } from 'expo-router';
import { ChevronDown, ChevronUp, Flag, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, type PressState } from '../../design/Button';
import { EmptyState } from '../../design/EmptyState';
import { Hatch } from '../../design/Hatch';
import { useLayout } from '../../design/layout';
import { SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { color, font, radius } from '../../design/tokens';
import { api, errorMessage, type WorkItem } from '../../lib/api';
import { useCapture } from '../../lib/capture';
import { addDays, daysBetween, shortDate } from '../../lib/dates';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';
import { dueDate, isDone } from '../../lib/tasks';
import { TaskRow } from './TaskRow';

interface ProjectView {
  project: WorkItem;
  steps: WorkItem[];
  done: number;
  target: string | null;
}

/**
 * Projects as tracks to their target dates: a bead per step at its due date (hatched when late),
 * done steps filled, steps without a date waiting at the end. Open one to see and tick its steps.
 */
export function Projects({
  items,
  today,
  onComplete,
  onReopen,
  onAssign,
  onChanged,
}: {
  items: WorkItem[];
  today: string;
  onComplete: (item: WorkItem) => void;
  onReopen: (item: WorkItem) => void;
  onAssign: (item: WorkItem, owner: string | null) => void;
  onChanged: () => void;
}) {
  const { timeZone } = useHousehold();
  const { phone } = useLayout();
  const { open } = useCapture();
  const projects: ProjectView[] = items
    .filter((i) => i.type === 'project' && !isDone(i))
    .map((project) => {
      const steps = items.filter((i) => i.parentId === project.id);
      return {
        project,
        steps,
        done: steps.filter(isDone).length,
        target: dueDate(project, timeZone),
      };
    })
    .sort((a, b) => (a.target ?? '9999').localeCompare(b.target ?? '9999'));

  // One time scale for every track: from a week ago to just past the furthest target.
  const targets = projects.map((p) => p.target).filter((t): t is string => !!t);
  const start = addDays(today, -7);
  const furthest = targets.reduce((max, t) => (t > max ? t : max), addDays(today, 28));
  const end = addDays(furthest, 4);
  const span = Math.max(1, daysBetween(start, end));
  const pos = (date: string) => Math.min(100, Math.max(0, (daysBetween(start, date) / span) * 100));
  const ticks = Array.from({ length: 12 }, (_, i) => addDays(today, (i + 1) * 7)).filter(
    (d) => d < end,
  );
  const step = Math.ceil(ticks.length / 5);

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Projects"
        sub="Tracks to their target dates"
        action={
          <Button
            title="New project"
            size="sm"
            variant="secondary"
            icon={Plus}
            onPress={() => open()}
          />
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          compact
          title="No projects on the go"
          body="Bigger jobs with steps, like a renovation or clearing the garage. Capture one and choose “Project with steps”."
        />
      ) : (
        <>
          {!phone ? (
            <View style={styles.scaleRow} aria-hidden>
              <View style={styles.info} />
              <View style={styles.scale}>
                {ticks
                  .filter((_, i) => i % step === 0)
                  .map((t) => (
                    <Text
                      key={t}
                      variant="small"
                      tone="muted"
                      style={[styles.tick, { left: `${pos(t)}%` }]}
                    >
                      {shortDate(t, today)}
                    </Text>
                  ))}
                <Text
                  variant="small"
                  style={[styles.tick, styles.todayTick, { left: `${pos(today)}%` }]}
                >
                  Today
                </Text>
              </View>
            </View>
          ) : null}
          {projects.map((p) => (
            <ProjectTrack
              key={p.project.id}
              view={p}
              today={today}
              pos={pos}
              onComplete={onComplete}
              onReopen={onReopen}
              onAssign={onAssign}
              onChanged={onChanged}
            />
          ))}
        </>
      )}
    </View>
  );
}

function ProjectTrack({
  view,
  today,
  pos,
  onComplete,
  onReopen,
  onAssign,
  onChanged,
}: {
  view: ProjectView;
  today: string;
  pos: (date: string) => number;
  onComplete: (item: WorkItem) => void;
  onReopen: (item: WorkItem) => void;
  onAssign: (item: WorkItem, owner: string | null) => void;
  onChanged: () => void;
}) {
  const { phone } = useLayout();
  const { timeZone } = useHousehold();
  const people = usePeople();
  const [open, setOpen] = useState(false);
  const { project, steps, done, target } = view;
  const dated = steps.filter((s) => !isDone(s) && dueDate(s, timeZone));
  const undatedOpen = steps.filter((s) => !isDone(s) && !dueDate(s, timeZone));
  const finished = steps.filter(isDone);
  const daysLeft = target ? daysBetween(today, target) : 0;
  const summary = [
    `${done} of ${steps.length} steps`,
    !target
      ? 'no target date'
      : daysLeft < 0
        ? `${-daysLeft} days past ${shortDate(target, today)}`
        : daysLeft === 0
          ? 'due today'
          : `${daysLeft} days to ${shortDate(target, today)}`,
  ].join(' · ');

  const bead = (s: WorkItem, style?: object) => {
    const c = people.colorOf(s.ownerMemberId);
    const late = !isDone(s) && (dueDate(s, timeZone) ?? today) < today;
    return (
      <Pressable
        key={s.id}
        accessibilityRole="button"
        accessibilityLabel={`${s.title}, ${people.label(s.ownerMemberId)}${late ? ', late' : ''}. Open`}
        onPress={() => router.push({ pathname: '/item/[id]', params: { id: s.id } })}
        style={(st: PressState) => [
          styles.bead,
          { borderColor: c, backgroundColor: isDone(s) ? c : color.surface },
          st.hovered && { transform: [{ scale: 1.25 }] },
          style,
        ]}
      >
        {late ? <Hatch width={13} height={13} radius={7} outline={false} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.track}>
      <View style={[styles.trackRow, phone && styles.trackRowPhone]}>
        <View style={[styles.info, phone && styles.infoPhone]}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: project.id } })}
          >
            {(s: PressState) => (
              <Text variant="h3" style={s.hovered && styles.underline}>
                {project.title}
              </Text>
            )}
          </Pressable>
          <Text variant="meta" tone="muted">
            {summary}
          </Text>
          <Pressable
            accessibilityRole="button"
            aria-expanded={open}
            onPress={() => setOpen((v) => !v)}
            style={styles.toggle}
          >
            <Text variant="small" style={styles.toggleText}>
              {open ? 'Hide steps' : steps.length ? 'Show steps' : 'Add steps'}
            </Text>
            {open ? (
              <ChevronUp size={14} strokeWidth={2.4} color={color.ink} />
            ) : (
              <ChevronDown size={14} strokeWidth={2.4} color={color.ink} />
            )}
          </Pressable>
        </View>
        {phone ? (
          <View style={styles.beadsRow} aria-hidden>
            {[...finished, ...dated, ...undatedOpen].map((s) => bead(s))}
          </View>
        ) : (
          <View style={styles.line}>
            <View style={styles.doneCluster}>{finished.slice(-5).map((s) => bead(s))}</View>
            <View style={styles.rail}>
              <View style={[styles.past, { width: `${pos(today)}%` }]} />
              {target ? (
                <View
                  style={[
                    styles.future,
                    { left: `${pos(today)}%`, width: `${Math.max(0, pos(target) - pos(today))}%` },
                  ]}
                />
              ) : null}
              <View style={[styles.todayMark, { left: `${pos(today)}%` }]} />
              {dated.map((s) =>
                bead(s, {
                  position: 'absolute',
                  left: `${pos(dueDate(s, timeZone) ?? today)}%`,
                  top: '50%',
                  marginLeft: -9,
                  marginTop: -9,
                  zIndex: 2,
                }),
              )}
              {target ? (
                <View style={[styles.flag, { left: `${pos(target)}%` }]}>
                  <Flag size={12} strokeWidth={2.4} color={color.onInk} />
                  <Text variant="small" color={color.onInk} style={styles.flagText}>
                    {shortDate(target, today)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.noDate}>
              {undatedOpen.slice(0, 4).map((s) => bead(s))}
              {undatedOpen.length > 0 ? (
                <Text variant="small" tone="muted">
                  no date
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </View>
      {open ? (
        <View style={[styles.steps, !phone && styles.stepsWide]}>
          {steps.map((s) => (
            <TaskRow
              key={s.id}
              item={s}
              today={today}
              onComplete={onComplete}
              onReopen={onReopen}
              onAssign={onAssign}
            />
          ))}
          <AddStep projectId={project.id} onAdded={onChanged} />
        </View>
      ) : null}
    </View>
  );
}

function AddStep({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const { household } = useHousehold();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    if (!household || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/households/${household.id}/work-items`, {
        method: 'POST',
        body: { title, parentId: projectId, inbox: false },
      });
      setTitle('');
      onAdded();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.addStep}>
      <View style={styles.addRow}>
        <Plus size={18} color={color.muted} strokeWidth={2.2} />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Add a step"
          placeholderTextColor={color.faint}
          accessibilityLabel="Add a step"
          onSubmitEditing={add}
          returnKeyType="done"
          maxLength={500}
          style={styles.addInput}
        />
        {title.trim() ? <Button title="Add" size="sm" busy={busy} onPress={add} /> : null}
      </View>
      {error ? (
        <Text variant="meta" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const INFO = 300;
const styles = StyleSheet.create({
  section: { marginTop: 48 },
  scaleRow: { flexDirection: 'row', gap: 28, paddingTop: 10 },
  info: { width: INFO, gap: 3 },
  infoPhone: { width: 'auto' },
  scale: { flex: 1, height: 18, marginLeft: 76, marginRight: 110, position: 'relative' },
  tick: { position: 'absolute', transform: [{ translateX: -20 }], fontFamily: font.displaySemi },
  todayTick: { fontFamily: font.display, color: color.ink },
  track: { borderBottomWidth: 1, borderBottomColor: color.hairline, paddingVertical: 16 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  trackRowPhone: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  underline: { textDecorationLine: 'underline' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    alignSelf: 'flex-start',
  },
  toggleText: {
    fontFamily: 'Figtree-700',
    textDecorationLine: 'underline',
    textDecorationColor: color.line2,
  },
  beadsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  line: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  doneCluster: {
    width: 76,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 3,
    paddingRight: 10,
  },
  rail: { flex: 1, height: 40, position: 'relative', justifyContent: 'center' },
  past: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.hairline,
  },
  future: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: color.ink },
  todayMark: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: 2,
    marginLeft: -1,
    backgroundColor: color.ink,
  },
  flag: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingLeft: 7,
    paddingRight: 9,
    marginLeft: -4,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    zIndex: 1,
  },
  flagText: { fontFamily: font.display },
  noDate: { width: 110, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14 },
  bead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  steps: { marginTop: 8 },
  stepsWide: { maxWidth: 760 },
  addStep: { paddingVertical: 6, gap: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  addInput: {
    flex: 1,
    minHeight: 40,
    fontFamily: font.ui,
    fontSize: 15,
    color: color.ink,
  },
});
