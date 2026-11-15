import { router } from 'expo-router';
import {
  ArrowRight,
  Baby,
  CalendarDays,
  Check,
  Link2,
  PawPrint,
  Plus,
  Send,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarSheet } from '../../components/household/CalendarSheet';
import { ColorPicker } from '../../components/household/ColorPicker';
import { freeColor } from '../../components/household/MemberSheet';
import { Avatar } from '../../design/Avatar';
import { Button } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { LanesArt } from '../../design/EmptyState';
import { Field } from '../../design/Field';
import { useLayout } from '../../design/layout';
import { FadeIn, useAcknowledgment, useCelebrate } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, font, radius, tint } from '../../design/tokens';
import { api, errorMessage, type CalendarSource, type Member, type WorkItem } from '../../lib/api';
import { SETUP_KEY } from '../../lib/acknowledgments';
import { useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';

const STEPS = [
  'Welcome',
  'You',
  'Children and pets',
  'Your partner',
  'Calendars',
  'First thing',
] as const;

// First-time setup for a new household's owner: six short steps, each skippable, each saving as it
// goes. Nothing here is required; everything can be changed later in Household.
export default function Setup() {
  const { household, putMember } = useHousehold();
  const people = usePeople();
  const { phone } = useLayout();
  const insets = useSafeAreaInsets();
  const { acknowledge } = useAcknowledgment(SETUP_KEY);
  const { celebrate } = useCelebrate();
  const [step, setStep] = useState(0);

  if (!household) return null;
  const me = people.me;
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const finish = async () => {
    await acknowledge();
    router.replace('/');
    celebrate({
      key: `household-ready:${household.id}`,
      title: 'Your household is set up',
      line: 'Today shows your rhythm. Add to it whenever something comes up.',
      colors: people.all.map((p) => p.color),
    });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + (phone ? 18 : 48), paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
        >
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[
                styles.dot,
                phone && styles.dotPhone,
                i <= step && { backgroundColor: me?.color ?? color.ink },
                i === step && styles.dotOn,
                phone && i === step && styles.dotPhoneOn,
              ]}
            />
          ))}
          <Text variant="small" tone="muted" style={styles.stepName} numberOfLines={1}>
            {STEPS[step]}
          </Text>
          {step > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void finish()}
              style={styles.skipAll}
            >
              <Text variant="label" tone="muted">
                Finish later
              </Text>
            </Pressable>
          ) : null}
        </View>

        <FadeIn key={step} style={styles.body}>
          {step === 0 ? (
            <Welcome name={me?.name ?? ''} onStart={next} onSkip={() => void finish()} />
          ) : step === 1 ? (
            <You onNext={next} putMember={putMember} />
          ) : step === 2 ? (
            <Family onNext={next} />
          ) : step === 3 ? (
            <Partner onNext={next} />
          ) : step === 4 ? (
            <Calendars onNext={next} />
          ) : (
            <FirstThing onDone={() => void finish()} />
          )}
        </FadeIn>
      </View>
    </ScrollView>
  );
}

function Head({ kicker, title, line }: { kicker?: string; title: string; line: string }) {
  return (
    <View style={styles.head}>
      {kicker ? (
        <Text variant="kicker" tone="muted">
          {kicker}
        </Text>
      ) : null}
      <Text variant="hero">{title}</Text>
      <Text variant="lead" tone="muted" style={styles.lead}>
        {line}
      </Text>
    </View>
  );
}

function Nav({
  onNext,
  label = 'Next',
  skip = 'Skip for now',
  busy,
  disabled,
}: {
  onNext: () => void;
  label?: string;
  skip?: string | null;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.nav}>
      <Button
        title={label}
        icon={ArrowRight}
        iconRight
        size="lg"
        busy={busy}
        disabled={disabled}
        onPress={onNext}
      />
      {skip ? <Button title={skip} variant="quiet" onPress={onNext} style={styles.center} /> : null}
    </View>
  );
}

function Welcome({
  name,
  onStart,
  onSkip,
}: {
  name: string;
  onStart: () => void;
  onSkip: () => void;
}) {
  const people = usePeople();
  return (
    <View style={styles.stepBody}>
      <Head
        kicker="Welcome to FamilyOS"
        title={`Hi ${name.split(' ')[0]}. Let’s set up your household.`}
        line="A few small steps, about two minutes. Skip anything; it all lives in Household later."
      />
      <LanesArt colors={[people.me?.color, '#D99A1C', '#2F6FB3']} height={20} style={styles.art} />
      <View style={styles.promises}>
        {[
          'Today shows the day as lanes: who has the kids, who has what.',
          'Hand things to each other in one tap. No scores, no counting.',
          'Your existing calendars, read-only, right in the lanes.',
        ].map((p) => (
          <View key={p} style={styles.promise}>
            <Check size={16} color={color.ink} strokeWidth={2.6} />
            <Text variant="body" style={styles.promiseText}>
              {p}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.nav}>
        <Button title="Let’s go" icon={ArrowRight} iconRight size="lg" onPress={onStart} />
        <Button title="Skip setup" variant="quiet" onPress={onSkip} style={styles.center} />
      </View>
    </View>
  );
}

function You({ onNext, putMember }: { onNext: () => void; putMember: (m: Member) => void }) {
  const { household } = useHousehold();
  const people = usePeople();
  const me = people.me;
  const [hex, setHex] = useState(me?.color ?? '#D2553F');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!household || !me) return;
    if (hex.toUpperCase() === me.color.toUpperCase()) return onNext();
    setBusy(true);
    try {
      const { member } = await api<{ member: Member }>(
        `/households/${household.id}/members/${me.id}`,
        {
          method: 'PATCH',
          body: { expectedVersion: me.version, color: hex },
        },
      );
      putMember(member);
      onNext();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.stepBody}>
      <Head
        title="Pick your color"
        line={`It marks what’s yours in ${household?.name ?? 'the household'}: your lane, your tasks, your handoffs.`}
      />
      <View style={styles.previewRow}>
        <Avatar person={{ initial: me?.initial ?? '?', color: hex }} size={52} />
        <View style={[styles.previewLane, { backgroundColor: tint(hex, 0.16) }]}>
          <View
            style={[styles.previewBlock, { backgroundColor: hex, left: '12%', width: '22%' }]}
          />
          <View
            style={[
              styles.previewBlock,
              { backgroundColor: tint(hex, 0.45), left: '46%', width: '30%' },
            ]}
          />
        </View>
      </View>
      <ColorPicker value={hex} onChange={setHex} label="Your color" />
      {error ? <ErrorNotice message={error} /> : null}
      <Nav onNext={save} busy={busy} skip={null} label="Looks good" />
    </View>
  );
}

function Family({ onNext }: { onNext: () => void }) {
  const { household, putMember } = useHousehold();
  const people = usePeople();
  const [role, setRole] = useState<'child' | 'pet'>('child');
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Dog');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cared = people.caredFor;

  const add = async () => {
    if (!household || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { member } = await api<{ member: Member }>(`/households/${household.id}/members`, {
        method: 'POST',
        body: {
          role,
          displayName: name.trim(),
          color: freeColor(people.all.map((p) => p.color)),
          ...(role === 'pet' && { species }),
        },
      });
      putMember(member);
      setName('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stepBody}>
      <Head
        title="Who do you look after?"
        line="Children and pets get a lane too, so drop-offs, pickups and vet visits show who has them. No accounts needed."
      />
      {cared.length > 0 ? (
        <View style={styles.added}>
          {cared.map((p) => (
            <FadeIn key={p.id} style={styles.addedRow}>
              <Avatar person={p} size={34} />
              <Text variant="h3" style={styles.addedName}>
                {p.name}
              </Text>
              <Text variant="meta" tone="muted">
                {p.role === 'pet' ? (p.species ?? 'Pet') : 'Child'}
              </Text>
            </FadeIn>
          ))}
        </View>
      ) : null}
      <View style={styles.card}>
        <View style={styles.chips}>
          <Chip
            label="A child"
            icon={Baby}
            selected={role === 'child'}
            onPress={() => setRole('child')}
          />
          <Chip
            label="A pet"
            icon={PawPrint}
            selected={role === 'pet'}
            onPress={() => setRole('pet')}
          />
        </View>
        <Field
          label={role === 'pet' ? 'Their name' : 'Their name'}
          value={name}
          onChangeText={setName}
          placeholder={role === 'pet' ? 'Biscuit' : 'June'}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => void add()}
        />
        {role === 'pet' ? (
          <View style={styles.chips}>
            {['Dog', 'Cat', 'Rabbit', 'Bird', 'Other'].map((s) => (
              <Chip key={s} label={s} selected={species === s} onPress={() => setSpecies(s)} />
            ))}
          </View>
        ) : null}
        {error ? <ErrorNotice message={error} /> : null}
        <Button
          title={`Add ${name.trim() || (role === 'pet' ? 'pet' : 'child')}`}
          icon={Plus}
          variant="secondary"
          busy={busy}
          disabled={!name.trim()}
          onPress={add}
        />
      </View>
      <Nav
        onNext={onNext}
        label={cared.length ? 'Next' : 'Next'}
        skip={cared.length ? null : 'Nobody to add'}
      />
    </View>
  );
}

function Partner({ onNext }: { onNext: () => void }) {
  const { household } = useHousehold();
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invite = async () => {
    if (!household) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ link: string }>(`/households/${household.id}/invites`, {
        method: 'POST',
        body: { email: email.trim(), role: 'adult' },
      });
      setLink(created.link);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.stepBody}>
      <Head
        title="Bring in your partner"
        line="FamilyOS is built for two: you’ll see each other’s day, and hand things over in one tap."
      />
      {link ? (
        <FadeIn style={styles.link}>
          <View style={styles.linkHead}>
            <Link2 size={16} color={color.ink} strokeWidth={2.2} />
            <Text variant="label">Send them this link</Text>
          </View>
          <Text variant="meta" tone="muted">
            Text it or email it however you like. It works once, for 48 hours, and is shown only
            now.
          </Text>
          <Text selectable style={styles.linkText}>
            {link}
          </Text>
        </FadeIn>
      ) : (
        <View style={styles.card}>
          <Field
            label="Their email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="off"
            inputMode="email"
            placeholder="theo@example.com"
          />
          {error ? <ErrorNotice message={error} /> : null}
          <Button
            title="Create their invite link"
            icon={Send}
            variant="secondary"
            busy={busy}
            disabled={!email.includes('@')}
            onPress={invite}
          />
        </View>
      )}
      <Nav onNext={onNext} skip={link ? null : 'Later'} />
    </View>
  );
}

function Calendars({ onNext }: { onNext: () => void }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<CalendarSource[]>([]);
  return (
    <View style={styles.stepBody}>
      <Head
        title="Bring in your calendars"
        line="Work, appointments, school: whatever you already keep in Google, iCloud or Outlook shows in your lane. Read-only; nothing is written back."
      />
      {added.map((c) => (
        <FadeIn key={c.id} style={styles.addedRow}>
          <CalendarDays size={20} color={color.ink} strokeWidth={2.2} />
          <Text variant="h3" style={styles.addedName}>
            {c.label}
          </Text>
          <Text variant="meta" tone="muted">
            Connected
          </Text>
        </FadeIn>
      ))}
      <Button
        title={added.length ? 'Connect another' : 'Connect a calendar'}
        icon={CalendarDays}
        variant="secondary"
        onPress={() => setOpen(true)}
      />
      <Nav onNext={onNext} skip={added.length ? null : 'Skip for now'} />
      <CalendarSheet
        visible={open}
        onClose={() => setOpen(false)}
        onAdded={(c) => setAdded((a) => [...a, c])}
      />
    </View>
  );
}

function FirstThing({ onDone }: { onDone: () => void }) {
  const { household } = useHousehold();
  const { changed } = useCapture();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<WorkItem | null>(null);
  const people = usePeople();
  useEffect(() => setError(null), [title]);
  const save = async () => {
    if (!household || !title.trim()) return;
    setBusy(true);
    try {
      const { item } = await api<{ item: WorkItem }>(`/households/${household.id}/work-items`, {
        method: 'POST',
        body: {
          title: title.trim(),
          type: 'task',
          inbox: false,
          ownerMemberId: people.me?.id ?? null,
        },
      });
      setSaved(item);
      changed();
      toast.show(`On your list: ${item.title}`, {
        detail: 'Add more any time with the + button or N.',
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.stepBody}>
      <Head
        title="What’s one thing on your mind?"
        line="The thing you’d otherwise have to remember. It goes on your list, and you can hand it over any time."
      />
      {saved ? (
        <FadeIn style={styles.addedRow}>
          <View style={[styles.check, { backgroundColor: people.me?.color ?? color.ink }]}>
            <Check size={14} color={color.onInk} strokeWidth={3} />
          </View>
          <Text variant="h3" style={styles.addedName}>
            {saved.title}
          </Text>
        </FadeIn>
      ) : (
        <View style={styles.card}>
          <Field
            label="Something to do"
            value={title}
            onChangeText={setTitle}
            placeholder="Book June’s 2-year checkup"
            maxLength={500}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
          />
          {error ? <ErrorNotice message={error} /> : null}
          <Button
            title="Add it"
            icon={Plus}
            variant="secondary"
            busy={busy}
            disabled={!title.trim()}
            onPress={save}
          />
        </View>
      )}
      <Nav onNext={onDone} label="Go to Today" skip={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.ground },
  page: { paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  dot: { width: 22, height: 6, borderRadius: 3, backgroundColor: color.lane },
  dotOn: { width: 36 },
  dotPhone: { width: 12 },
  dotPhoneOn: { width: 22 },
  stepName: { marginLeft: 8, flex: 1 },
  skipAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  body: { marginTop: 26 },
  stepBody: { gap: 22 },
  head: { gap: 10 },
  lead: { maxWidth: 560 },
  art: { marginVertical: 6 },
  promises: { gap: 12 },
  promise: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  promiseText: { flex: 1 },
  center: { alignSelf: 'center' },
  nav: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewLane: { flex: 1, height: 40, borderRadius: 12, overflow: 'hidden' },
  previewBlock: { position: 'absolute', top: 7, bottom: 7, borderRadius: 7 },
  card: {
    gap: 14,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  added: { gap: 8 },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  addedName: { flex: 1 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
