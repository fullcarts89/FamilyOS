import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Link2, Mail, MessageSquare, Phone, Plus, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, IconButton, type PressState } from '../../design/Button';
import { Skeleton, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Sheet } from '../../design/Sheet';
import { useSheetAutoFocus } from '../../design/sheet-entered';
import { Text } from '../../design/Text';
import { color, font, radius } from '../../design/tokens';
import { api, errorMessage, type Contact, type WorkItem } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { ContactForm } from './ContactSheet';
import { CATEGORY, dialable, roleLine } from './contact-meta';

type Linked = NonNullable<WorkItem['contact']>;

/**
 * The key contact a task or project involves (the plumber for the renovation): call or text in
 * a tap from the task itself. Linking one is a pick from the household's contacts, or a new one
 * added right there.
 */
export function ContactLink({
  item,
  canEdit,
  onLink,
}: {
  item: WorkItem;
  canEdit: boolean;
  /** Link (or, with null, unlink) a contact; resolves once saved. */
  onLink: (contact: Pick<Contact, 'id' | 'name'> | null) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const c = item.contact ?? null;
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);
  const first = c?.name.split(' ')[0] ?? '';

  return (
    <View style={styles.block}>
      <Text variant="kicker" tone="muted">
        Contact
      </Text>
      {c ? (
        <View style={styles.card} accessibilityLabel={`Contact: ${c.name}`}>
          <View style={styles.cardHead}>
            <ContactIcon contact={c} />
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${c.name}${roleLine(c) ? `, ${roleLine(c)}` : ''}. Open contacts`}
              onPress={() => router.push('/contacts')}
              style={(s: PressState) => [styles.cardText, s.hovered && { opacity: 0.75 }]}
            >
              <Text variant="title">{c.name}</Text>
              {roleLine(c) ? (
                <Text variant="meta" tone="muted">
                  {roleLine(c)}
                </Text>
              ) : null}
              {c.phone ? (
                <Text variant="meta" selectable>
                  {c.phone}
                </Text>
              ) : null}
            </Pressable>
            {canEdit ? (
              <IconButton
                icon={X}
                label={`Unlink ${c.name}`}
                size={34}
                iconSize={16}
                onPress={() => void onLink(null)}
              />
            ) : null}
          </View>
          {c.phone || c.email ? (
            <View style={styles.quick}>
              {c.phone ? (
                <Button
                  title="Call"
                  icon={Phone}
                  size="sm"
                  accessibilityLabel={`Call ${c.name} at ${c.phone}`}
                  onPress={() => open(`tel:${dialable(c.phone ?? '')}`)}
                />
              ) : null}
              {c.phone ? (
                <Button
                  title="Text"
                  icon={MessageSquare}
                  size="sm"
                  variant="secondary"
                  accessibilityLabel={`Text ${c.name} at ${c.phone}`}
                  onPress={() => open(`sms:${dialable(c.phone ?? '')}`)}
                />
              ) : null}
              {c.email ? (
                <Button
                  title="Email"
                  icon={Mail}
                  size="sm"
                  variant="secondary"
                  accessibilityLabel={`Email ${c.name}`}
                  onPress={() => open(`mailto:${c.email}`)}
                />
              ) : null}
            </View>
          ) : (
            <Text variant="meta" tone="muted">
              No number or email for {first} yet. Add one in Contacts.
            </Text>
          )}
          {canEdit ? (
            <Button
              title="Change contact"
              size="sm"
              variant="quiet"
              onPress={() => setPicking(true)}
              style={styles.change}
            />
          ) : null}
        </View>
      ) : canEdit ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setPicking(true)}
          style={(s: PressState) => [styles.add, s.hovered && styles.addHover]}
        >
          <Link2 size={16} color={color.ink} strokeWidth={2.2} />
          <View style={styles.cardText}>
            <Text variant="label">Link a contact</Text>
            <Text variant="small" tone="muted">
              The plumber, the vet, the school office: call them from here.
            </Text>
          </View>
        </Pressable>
      ) : (
        <Text variant="meta" tone="muted">
          No contact linked.
        </Text>
      )}
      <ContactPicker
        visible={picking}
        current={c?.id ?? null}
        onClose={() => setPicking(false)}
        onPick={async (picked) => {
          await onLink(picked);
          setPicking(false);
        }}
      />
    </View>
  );
}

function ContactIcon({ contact }: { contact: Pick<Linked, 'category'> }) {
  const Icon = CATEGORY[contact.category].icon;
  return (
    <View style={styles.icon}>
      <Icon size={18} color={color.ink} strokeWidth={2} />
    </View>
  );
}

/** Pick one of the household's contacts, or add a new one and link it in the same step. */
function ContactPicker({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: string | null;
  onClose: () => void;
  onPick: (c: Contact) => Promise<void>;
}) {
  const { household } = useHousehold();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !household) return;
    setQuery('');
    setAdding(false);
    setError(null);
    let alive = true;
    api<{ contacts: Contact[] }>(`/households/${household.id}/contacts`)
      .then((r) => alive && setContacts(r.contacts))
      .catch((caught) => {
        if (!alive) return;
        setContacts([]);
        setError(errorMessage(caught));
      });
    return () => {
      alive = false;
    };
  }, [visible, household]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts ?? [])
      .filter(
        (c) =>
          !q ||
          [c.name, c.role, c.organization, c.phone, CATEGORY[c.category].label].some((v) =>
            v?.toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, query]);

  const pick = async (c: Contact) => {
    setBusy(c.id);
    setError(null);
    try {
      await onPick(c);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      label={adding ? 'Add a contact' : 'Link a contact'}
      title={adding ? 'Add a contact' : 'Link a contact'}
      width={520}
    >
      {adding ? (
        <ContactForm
          contact={null}
          category={contacts?.length ? undefined : 'home'}
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            setContacts((all) => [...(all ?? []), c]);
            void pick(c);
          }}
          onRemoved={() => undefined}
        />
      ) : (
        <View style={styles.picker}>
          <View style={styles.search}>
            <Search size={16} color={color.muted} strokeWidth={2.2} />
            <SearchInput value={query} onChangeText={setQuery} />
          </View>
          {error ? <ErrorNotice message={error} /> : null}
          {contacts === null ? (
            <Skeleton>
              <SkeletonRows count={3} />
            </Skeleton>
          ) : shown.length === 0 ? (
            <Text variant="meta" tone="muted">
              {contacts.length === 0
                ? 'No contacts yet. Add the first one here.'
                : `No one matches “${query.trim()}”.`}
            </Text>
          ) : (
            <View style={styles.list}>
              {shown.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Link ${c.name}${roleLine(c) ? `, ${roleLine(c)}` : ''}`}
                  accessibilityState={{ selected: c.id === current, busy: busy === c.id }}
                  disabled={busy !== null}
                  onPress={() => void pick(c)}
                  style={(s: PressState) => [
                    styles.row,
                    c.id === current && styles.rowOn,
                    s.hovered && styles.rowHover,
                  ]}
                >
                  <ContactIcon contact={c} />
                  <View style={styles.cardText}>
                    <Text variant="title" numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      {[roleLine(c), c.phone].filter(Boolean).join(' · ') ||
                        CATEGORY[c.category].label}
                    </Text>
                  </View>
                  {c.id === current ? (
                    <Text variant="small" tone="muted">
                      Linked
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
          <Button
            title="Add a new contact"
            icon={Plus}
            variant="secondary"
            size="sm"
            onPress={() => setAdding(true)}
            style={styles.newContact}
          />
        </View>
      )}
    </Sheet>
  );
}

/** The picker's search, focused once the sheet is on screen (design/sheet-entered.ts). */
function SearchInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const { autoFocus } = useSheetAutoFocus(ref, true);
  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      placeholder="Search by name, role or number"
      placeholderTextColor={color.faint}
      accessibilityLabel="Search contacts"
      autoFocus={autoFocus}
      style={styles.searchInput}
    />
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 24, gap: 10 },
  card: {
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.hairline,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardText: { flex: 1, minWidth: 0, gap: 2, cursor: 'pointer' },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.lane,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quick: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  change: { alignSelf: 'flex-start', marginTop: -4 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.line2,
    cursor: 'pointer',
  },
  addHover: { borderColor: color.ink },
  picker: { gap: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
  },
  searchInput: { flex: 1, fontFamily: font.ui, fontSize: 16, color: color.ink, minHeight: 44 },
  list: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    cursor: 'pointer',
  },
  rowOn: { backgroundColor: color.lane },
  rowHover: { backgroundColor: color.ground },
  newContact: { alignSelf: 'flex-start', marginTop: 4 },
});
