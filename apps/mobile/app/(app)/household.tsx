import { can } from '@familyos/domain';
import { useFocusEffect } from 'expo-router';
import {
  CalendarDays,
  ChevronRight,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Send,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CalendarSheet } from '../../components/household/CalendarSheet';
import { MemberSheet, type MemberTarget } from '../../components/household/MemberSheet';
import { parseTime } from '../../components/rhythm/EventSheet';
import { ago } from '../../components/rhythm/SinceLastLooked';
import { Avatar } from '../../design/Avatar';
import { Button, type PressState } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { Field } from '../../design/Field';
import { useLayout } from '../../design/layout';
import { FadeIn, hapticsAvailable, soundAvailable, useHaptics } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { GroupLabel, SectionHeader } from '../../design/Section';
import { Text } from '../../design/Text';
import { Toggle } from '../../design/Toggle';
import { useToast } from '../../design/Toast';
import { color, font, radius } from '../../design/tokens';
import {
  ApiRequestError,
  api,
  errorMessage,
  type CalendarSource,
  type Invite,
  type Member,
  type MemberState,
} from '../../lib/api';
import { clock } from '../../lib/dates';
import { useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { useMemberState } from '../../lib/member-state';
import { usePeople, type Person } from '../../lib/people';
import { signOut } from '../../lib/sign-out';
import { PushSetting } from '../../components/push/PushSetting';
import {
  setWidgetLockScreenVisible,
  widgetLockScreenVisible,
  widgetsAvailable,
} from '../../native/widget';

const ROLE_LABEL: Record<Member['role'], string> = {
  owner: 'Owner',
  adult: 'Adult',
  caregiver: 'Caregiver',
  child: 'Child',
  pet: 'Pet',
};

// Household: the people and pets with their colors, inviting a partner, the calendars FamilyOS
// reads, and your own settings (haptics, sound, notifications and quiet hours).
export default function HouseholdScreen() {
  const { household, timeZone } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const { desktop } = useLayout();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [calendars, setCalendars] = useState<CalendarSource[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Invite['role']>('adult');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberSheet, setMemberSheet] = useState<MemberTarget | null>(null);
  const [calendarSheet, setCalendarSheet] = useState(false);

  const mayInvite = household ? can(household.role, 'member.invite') : false;
  const mayCalendars = household ? can(household.role, 'calendar.manage') : false;
  const mayAdd = household ? can(household.role, 'member.add_child') : false;
  const base = household ? `/households/${household.id}` : '';

  const load = useCallback(async () => {
    if (!household) return;
    try {
      const [inv, cal] = await Promise.all([
        mayInvite
          ? api<{ invites: Invite[] }>(`${base}/invites`)
          : Promise.resolve({ invites: [] }),
        mayCalendars
          ? api<{ calendars: CalendarSource[] }>(`${base}/calendars`).catch((e: unknown) => {
              if (e instanceof ApiRequestError && e.code === 'calendars_unavailable')
                return { calendars: [] };
              throw e;
            })
          : Promise.resolve({ calendars: [] }),
      ]);
      setInvites(inv.invites);
      setCalendars(cal.calendars);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [household, mayInvite, mayCalendars, base]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!household) return null;

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ link: string }>(`${base}/invites`, {
        method: 'POST',
        body: { email: email.trim(), role },
      });
      setLink(created.link);
      setEmail('');
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await api(`${base}/invites/${id}`, { method: 'DELETE' });
      toast.show('Invite cancelled');
    } catch (caught) {
      setError(errorMessage(caught));
    }
    await load();
  };

  const pending = invites.filter(
    (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
  );

  const memberRow = (p: Person, i: number, all: Person[]) => {
    const mayEdit = p.caredFor || p.isMe || household.role === 'owner';
    // What the row shows under the name: the role (a pet's species), and their note.
    const detail = [p.role === 'pet' ? (p.species ?? 'Pet') : ROLE_LABEL[p.role], p.note].filter(
      Boolean,
    );
    return (
      <Pressable
        key={p.id}
        accessibilityRole={mayEdit ? 'button' : undefined}
        // The name says what the row shows, in the same order ("Biscuit, Dog, Flea meds on the
        // 1st"), then what a tap does.
        accessibilityLabel={`${[p.name, ...(p.isMe ? ['you'] : []), ...detail].join(', ')}${mayEdit ? ', edit' : ''}`}
        disabled={!mayEdit}
        onPress={() => setMemberSheet({ mode: 'edit', person: p })}
        style={(s: PressState) => [
          styles.member,
          i === all.length - 1 && styles.last,
          mayEdit && s.hovered && styles.rowHover,
        ]}
      >
        <Avatar person={p} size={40} />
        <View style={styles.memberText}>
          <Text variant="h3">
            {p.name}
            {p.isMe ? (
              <Text variant="meta" tone="muted">
                {'  '}You
              </Text>
            ) : null}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {detail.join(' · ')}
          </Text>
        </View>
        <View style={[styles.swatch, { backgroundColor: p.color }]} aria-hidden />
        {mayEdit ? <ChevronRight size={18} color={color.faint} strokeWidth={2.2} /> : null}
      </Pressable>
    );
  };

  const adults = people.all.filter((p) => !p.caredFor);
  const children = people.all.filter((p) => p.role === 'child');
  const pets = people.all.filter((p) => p.role === 'pet');

  const members = (
    <View>
      <SectionHeader
        title="People and pets"
        action={
          mayAdd ? (
            <Button
              title="Add a child or pet"
              icon={Plus}
              size="sm"
              variant="secondary"
              onPress={() => setMemberSheet({ mode: 'add' })}
            />
          ) : null
        }
      />
      <GroupLabel label="Adults" />
      {adults.map(memberRow)}
      <GroupLabel label="Children" />
      {children.length ? (
        children.map(memberRow)
      ) : (
        <AddRow
          label="Add a child"
          onPress={() => setMemberSheet({ mode: 'add', role: 'child' })}
          disabled={!mayAdd}
        />
      )}
      <GroupLabel label="Pets" />
      {pets.length ? (
        pets.map(memberRow)
      ) : (
        <AddRow
          label="Add a pet"
          onPress={() => setMemberSheet({ mode: 'add', role: 'pet' })}
          disabled={!mayAdd}
        />
      )}
      <Text variant="meta" tone="muted" style={styles.note}>
        Each color marks what’s theirs across the app: lanes, tasks and the week. Tap someone to
        change it.
      </Text>
    </View>
  );

  const invitePanel = mayInvite ? (
    <View>
      <SectionHeader title={people.partner ? 'Invite someone' : 'Invite your partner'} />
      <View style={styles.form}>
        {!people.partner ? (
          <Text variant="body" tone="muted">
            FamilyOS works best with both of you in it: you’ll see each other’s day and can hand
            things over in one tap.
          </Text>
        ) : null}
        <Field
          label="Their email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="off"
          inputMode="email"
          placeholder="sam@example.com"
          returnKeyType="send"
          onSubmitEditing={() => email.includes('@') && void invite()}
        />
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Their role">
          <Chip label="Adult" selected={role === 'adult'} onPress={() => setRole('adult')} />
          <Chip
            label="Caregiver"
            selected={role === 'caregiver'}
            onPress={() => setRole('caregiver')}
          />
        </View>
        <Button
          title="Create invite link"
          icon={Send}
          busy={busy}
          disabled={!email.includes('@')}
          onPress={invite}
        />
        {link ? (
          <FadeIn style={styles.link}>
            <View style={styles.linkHead}>
              <Link2 size={16} color={color.ink} strokeWidth={2.2} />
              <Text variant="label">Send them this link</Text>
            </View>
            <Text variant="meta" tone="muted">
              It works once, for 48 hours, and is shown only now.
            </Text>
            <Text selectable style={styles.linkText}>
              {link}
            </Text>
          </FadeIn>
        ) : null}
        {pending.length > 0 ? (
          <View style={styles.pending}>
            <Text variant="kicker" tone="muted">
              Waiting to join
            </Text>
            {pending.map((i) => (
              <View key={i.id} style={styles.pendingRow}>
                <Text variant="body" style={styles.pendingText}>
                  {i.email} · {ROLE_LABEL[i.role]}
                </Text>
                <Button
                  title="Cancel invite"
                  size="sm"
                  variant="quiet"
                  onPress={() => revoke(i.id)}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  ) : null;

  const calendarPanel = mayCalendars ? (
    <View>
      <SectionHeader
        title="Calendars"
        action={
          <Button
            title="Connect"
            icon={Plus}
            size="sm"
            variant="secondary"
            onPress={() => setCalendarSheet(true)}
          />
        }
      />
      {calendars === null ? null : calendars.length === 0 ? (
        <View style={styles.calEmpty}>
          <CalendarDays size={20} color={color.ink} strokeWidth={2} />
          <Text variant="body" tone="muted" style={styles.calEmptyText}>
            Bring in the calendars you already keep (Google, iCloud, Outlook) so work and
            appointments show in your lanes. Read-only: nothing is written back.
          </Text>
        </View>
      ) : (
        calendars.map((c, i) => (
          <CalendarRow
            key={c.id}
            calendar={c}
            last={i === calendars.length - 1}
            onChanged={(next) =>
              setCalendars((all) => (all ?? []).map((x) => (x.id === next.id ? next : x)))
            }
            onRemoved={() => setCalendars((all) => (all ?? []).filter((x) => x.id !== c.id))}
          />
        ))
      )}
    </View>
  ) : null;

  return (
    <Page maxWidth={1100}>
      <PageHeader kicker="Household" title={household.name} />
      {error ? (
        <View style={styles.gap}>
          <ErrorNotice message={error} onRetry={load} />
        </View>
      ) : null}
      <FadeIn style={[styles.body, desktop && styles.bodyWide]}>
        <View style={[desktop ? styles.colMain : undefined, styles.stack]}>
          {members}
          {calendarPanel}
        </View>
        <View style={[desktop ? styles.colSide : undefined, styles.stack]}>
          {invitePanel}
          <Settings timeZone={timeZone} />
        </View>
      </FadeIn>
      <MemberSheet target={memberSheet} onClose={() => setMemberSheet(null)} />
      <CalendarSheet
        visible={calendarSheet}
        onClose={() => setCalendarSheet(false)}
        onAdded={(c) => setCalendars((all) => [...(all ?? []), c])}
      />
    </Page>
  );
}

function AddRow({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={(s: PressState) => [
        styles.addRow,
        s.hovered && styles.rowHover,
        disabled && { opacity: 0.4 },
      ]}
    >
      <View style={styles.addIcon}>
        <Plus size={18} color={color.ink} strokeWidth={2.2} />
      </View>
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

function calendarStatus(c: CalendarSource, now: Date): string {
  if (c.status === 'error') {
    const why = errorMessage(new ApiRequestError(0, c.lastErrorCode ?? ''));
    return `Couldn’t sync${c.lastSyncedAt ? ` (last worked ${ago(c.lastSyncedAt, now)})` : ''}. ${why}`;
  }
  if (c.status === 'pending' || !c.lastSyncedAt) return 'Waiting for the first sync';
  return `Synced ${ago(c.lastSyncedAt, now)}`;
}

function CalendarRow({
  calendar: c,
  last,
  onChanged,
  onRemoved,
}: {
  calendar: CalendarSource;
  last: boolean;
  onChanged: (c: CalendarSource) => void;
  onRemoved: () => void;
}) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const owner = people.byId(c.memberId);
  const base = `/households/${household?.id}/calendars/${c.id}`;

  const sync = async () => {
    setSyncing(true);
    try {
      const { calendar } = await api<{ calendar: CalendarSource }>(`${base}/sync`, {
        method: 'POST',
      });
      onChanged(calendar);
      toast.show(
        calendar.status === 'ok' ? `Synced ${calendar.label}` : `Couldn’t sync ${calendar.label}`,
        {
          error: calendar.status !== 'ok',
        },
      );
    } catch (caught) {
      toast.show('Couldn’t sync just now.', { error: true, detail: errorMessage(caught) });
    } finally {
      setSyncing(false);
    }
  };

  const reassign = async (memberId: string) => {
    if (memberId === c.memberId) return;
    const before = c;
    onChanged({ ...c, memberId });
    try {
      const { calendar } = await api<{ calendar: CalendarSource }>(base, {
        method: 'PATCH',
        body: { expectedVersion: c.version, memberId },
      });
      onChanged(calendar);
      toast.show(
        `${calendar.label} now shows in ${people.byId(memberId)?.isMe ? 'your' : `${people.byId(memberId)?.name}’s`} lane`,
      );
    } catch (caught) {
      onChanged(before);
      toast.show('Couldn’t change whose calendar it is.', {
        error: true,
        detail: errorMessage(caught),
      });
    }
  };

  const remove = async () => {
    try {
      await api(`${base}?expectedVersion=${c.version}`, { method: 'DELETE' });
      onRemoved();
      toast.show(`Disconnected ${c.label}`, {
        detail: 'Its events are gone from FamilyOS; the calendar itself is untouched.',
      });
    } catch (caught) {
      toast.show('Couldn’t disconnect it.', { error: true, detail: errorMessage(caught) });
    }
  };

  return (
    <View style={[styles.cal, last && styles.last]}>
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityLabel={`${c.label}, ${owner?.name ?? ''}, ${calendarStatus(c, new Date())}`}
        onPress={() => setOpen((v) => !v)}
        style={(s: PressState) => [styles.calMain, s.hovered && styles.rowHover]}
      >
        <View style={[styles.calIcon, { borderColor: owner?.color ?? color.ink }]}>
          <CalendarDays size={18} color={owner?.color ?? color.ink} strokeWidth={2.2} />
        </View>
        <View style={styles.memberText}>
          <Text variant="title">
            {c.label}
            <Text variant="meta" tone="muted">
              {'  '}
              {owner ? (owner.isMe ? 'Yours' : `${owner.name}’s`) : ''}
            </Text>
          </Text>
          <Text variant="meta" tone={c.status === 'error' ? 'danger' : 'muted'} numberOfLines={2}>
            {calendarStatus(c, new Date())}
          </Text>
          {c.urlHint ? (
            <Text variant="small" tone="faint" numberOfLines={1}>
              {c.urlHint}
            </Text>
          ) : null}
        </View>
        <Button
          title="Sync now"
          icon={RefreshCw}
          size="sm"
          variant="quiet"
          busy={syncing}
          onPress={sync}
        />
      </Pressable>
      {open ? (
        <FadeIn style={styles.calMore}>
          <Text variant="small" tone="muted">
            Whose lane it shows in
          </Text>
          <View style={styles.chips}>
            {people.adults.map((p) => (
              <Chip
                key={p.id}
                label={p.isMe ? 'Mine' : p.name}
                accent={p.color}
                leading={<Avatar person={p} size={18} />}
                selected={c.memberId === p.id}
                onPress={() => void reassign(p.id)}
              />
            ))}
          </View>
          <View style={styles.chips}>
            {confirm ? (
              <>
                <Button title="Yes, disconnect" size="sm" variant="secondary" onPress={remove} />
                <Button
                  title="Keep it"
                  size="sm"
                  variant="quiet"
                  onPress={() => setConfirm(false)}
                />
              </>
            ) : (
              <Button
                title="Disconnect"
                size="sm"
                variant="quiet"
                onPress={() => setConfirm(true)}
              />
            )}
          </View>
        </FadeIn>
      ) : null}
    </View>
  );
}

const NOTIFY: { key: keyof MemberState['notifications']; title: string; line: string }[] = [
  {
    key: 'morningCheckin',
    title: 'Morning check-in',
    line: 'What’s on today, once, before it starts.',
  },
  {
    key: 'handoffReminders',
    title: 'Drop-offs and pickups',
    line: 'A reminder before one that’s yours.',
  },
  {
    key: 'partnerChanges',
    title: 'When plans change',
    line: 'When someone changes something that affects you.',
  },
  {
    key: 'weeklyResetReminder',
    title: 'Weekly Reset',
    line: 'A nudge when it’s time to plan the week.',
  },
];

function Settings({ timeZone }: { timeZone: string }) {
  const haptics = useHaptics();
  const { shortcuts, setShortcuts } = useCapture();
  const toast = useToast();
  const { state, update } = useMemberState();
  const [lockScreen, setLockScreen] = useState(() => widgetsAvailable && widgetLockScreenVisible());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  useEffect(() => {
    setStart(clock(state?.quietHours?.start ?? '21:00'));
    setEnd(clock(state?.quietHours?.end ?? '07:00'));
  }, [state?.quietHours?.start, state?.quietHours?.end]);

  const save = async (patch: Parameters<typeof update>[0]) => {
    const problem = await update(patch);
    if (problem) toast.show('Couldn’t save that setting.', { error: true, detail: problem });
  };
  const saveQuiet = () => {
    const s = parseTime(start);
    const e = parseTime(end);
    if (!s || !e) {
      toast.show('Write the times like 9pm or 21:00.', { error: true });
      return;
    }
    if (s !== state?.quietHours?.start || e !== state?.quietHours?.end)
      void save({ quietHours: { start: s, end: e } });
  };

  const row = (
    title: string,
    line: string,
    value: boolean,
    onChange: (v: boolean) => void,
    disabled = false,
  ) => (
    <View key={title} style={styles.setting}>
      <View style={styles.settingText}>
        <Text variant="title">{title}</Text>
        <Text variant="meta" tone="muted">
          {line}
        </Text>
      </View>
      <Toggle value={value} disabled={disabled} onValueChange={onChange} label={title} />
    </View>
  );

  return (
    <View>
      <SectionHeader title="Your settings" sub="Just for you" />
      {hapticsAvailable
        ? row(
            'Haptics',
            'A light tap when you finish something.',
            haptics.enabled,
            (v) => void save({ haptics: v }),
            !state,
          )
        : null}
      {soundAvailable
        ? row(
            'Sounds',
            'A soft chime for milestones. Off unless you want it.',
            state?.sound ?? false,
            (v) => void save({ sound: v }),
            !state,
          )
        : null}
      {widgetsAvailable
        ? row(
            'Show on Lock Screen',
            'The widget on your Lock Screen shows titles and names. Off shows only that something’s due.',
            lockScreen,
            (v) => {
              setLockScreen(v);
              setWidgetLockScreenVisible(v);
            },
          )
        : null}
      {Platform.OS === 'web'
        ? row(
            'Keyboard shortcuts',
            'N or C opens capture. Turn off if single keys get pressed by accident (this device).',
            shortcuts,
            setShortcuts,
          )
        : null}
      <GroupLabel label="Notifications" />
      <PushSetting />
      {NOTIFY.map((n) =>
        row(
          n.title,
          n.line,
          state?.notifications[n.key] ?? true,
          (v) => void save({ notifications: { [n.key]: v } }),
          !state,
        ),
      )}
      {row(
        'Quiet hours',
        state?.quietHours
          ? `Nothing between ${clock(state.quietHours.start)} and ${clock(state.quietHours.end)}.`
          : 'Nothing at night, unless it can’t wait.',
        !!state?.quietHours,
        (v) =>
          void save({
            quietHours: v
              ? { start: parseTime(start) ?? '21:00', end: parseTime(end) ?? '07:00' }
              : null,
          }),
        !state,
      )}
      {state?.quietHours ? (
        <View style={styles.quiet}>
          <Text variant="meta" tone="muted">
            From
          </Text>
          <TextInput
            accessibilityLabel="Quiet from"
            value={start}
            onChangeText={setStart}
            onBlur={saveQuiet}
            style={styles.timeInput}
          />
          <Text variant="meta" tone="muted">
            to
          </Text>
          <TextInput
            accessibilityLabel="Quiet until"
            value={end}
            onChangeText={setEnd}
            onBlur={saveQuiet}
            style={styles.timeInput}
          />
        </View>
      ) : null}
      <View style={styles.setting}>
        <View style={styles.settingText}>
          <Text variant="title">Time zone</Text>
          <Text variant="meta" tone="muted">
            Dates and times show in {timeZone.replace(/_/g, ' ')}.
          </Text>
        </View>
      </View>
      <Button
        title="Sign out"
        variant="secondary"
        icon={LogOut}
        onPress={() => void signOut()}
        style={styles.signOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 16 },
  body: { marginTop: 32, gap: 40 },
  bodyWide: { flexDirection: 'row', gap: 56, alignItems: 'flex-start' },
  colMain: { flex: 1.1 },
  colSide: { flex: 1 },
  stack: { gap: 44 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    borderRadius: 6,
    cursor: 'pointer',
  },
  last: { borderBottomWidth: 0 },
  rowHover: { backgroundColor: 'rgba(255,255,255,0.6)' },
  memberText: { flex: 1, minWidth: 0, gap: 2 },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  note: { marginTop: 12, maxWidth: 480 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    cursor: 'pointer',
    borderRadius: 6,
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: 14, marginTop: 16 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  link: {
    gap: 6,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderStyle: 'dashed',
    backgroundColor: color.surface,
  },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { fontFamily: font.uiSemi, fontSize: 14, color: color.ink },
  pending: { gap: 4, marginTop: 4 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  pendingText: { flexShrink: 1 },
  calEmpty: { flexDirection: 'row', gap: 12, paddingVertical: 16, alignItems: 'flex-start' },
  calEmptyText: { flex: 1 },
  cal: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  calMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  calIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMore: { gap: 10, paddingBottom: 14, paddingLeft: 54 },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  settingText: { flex: 1, gap: 2 },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  timeInput: {
    width: 90,
    height: 40,
    borderWidth: 1.5,
    borderColor: color.line2,
    borderRadius: radius.md,
    textAlign: 'center',
    fontFamily: font.uiSemi,
    fontSize: 15,
    color: color.ink,
    backgroundColor: color.surface,
  },
  signOut: { marginTop: 18 },
});
