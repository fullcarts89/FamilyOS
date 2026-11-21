import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import {
  ArrowRight,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../../design/Avatar';
import { Button, IconButton, type PressState } from '../../design/Button';
import { Chip } from '../../design/Chip';
import { Field } from '../../design/Field';
import { Skeleton, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Sheet, SheetActions } from '../../design/Sheet';
import { Text } from '../../design/Text';
import { useToast } from '../../design/Toast';
import { color, radius } from '../../design/tokens';
import {
  api,
  errorMessage,
  type Contact,
  type ContactCategory,
  type WorkItem,
} from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';
import { STATUS_NOTE, isDone } from '../../lib/tasks';
import { CATEGORIES, CATEGORY, dialable, roleLine } from './contact-meta';

export type ContactTarget =
  | { mode: 'view'; contact: Contact }
  | { mode: 'edit'; contact: Contact }
  | { mode: 'new'; category?: ContactCategory };

/**
 * One contact: call, text or email in a tap (the number and address are also plain, selectable
 * text), who it's for, and the tasks and projects it's linked to. Adding or changing one is a
 * small form: the essentials first, the rest a tap away.
 */
export function ContactSheet({
  target,
  onClose,
  onSaved,
  onRemoved,
  onEdit,
}: {
  target: ContactTarget | null;
  onClose: () => void;
  onSaved: (c: Contact) => void;
  onRemoved: (c: Contact) => void;
  onEdit: (c: Contact) => void;
}) {
  const label =
    target?.mode === 'new'
      ? 'Add a contact'
      : target?.mode === 'edit'
        ? `Edit ${target.contact.name}`
        : (target?.contact.name ?? 'Contact');
  return (
    <Sheet
      visible={target !== null}
      onClose={onClose}
      label={label}
      title={
        target?.mode === 'new' ? 'Add a contact' : target?.mode === 'edit' ? 'Edit' : 'Contact'
      }
      width={540}
    >
      {target?.mode === 'view' ? (
        <ContactView key={target.contact.id} contact={target.contact} onEdit={onEdit} />
      ) : target ? (
        <ContactForm
          key={target.mode === 'edit' ? target.contact.id : 'new'}
          contact={target.mode === 'edit' ? target.contact : null}
          category={target.mode === 'new' ? target.category : undefined}
          onClose={onClose}
          onSaved={onSaved}
          onRemoved={onRemoved}
        />
      ) : null}
    </Sheet>
  );
}

function ContactView({ contact: c, onEdit }: { contact: Contact; onEdit: (c: Contact) => void }) {
  const { household } = useHousehold();
  const people = usePeople();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const forWho = people.byId(c.forMemberId);
  const canEdit = household?.role !== 'caregiver';
  const Icon = CATEGORY[c.category].icon;

  useEffect(() => {
    if (!household) return;
    let alive = true;
    api<{ items: WorkItem[] }>(`/households/${household.id}/contacts/${c.id}`)
      .then((r) => alive && setItems(r.items))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [household, c.id]);

  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <View style={styles.view}>
      <View style={styles.who}>
        <View style={styles.icon}>
          <Icon size={22} color={color.ink} strokeWidth={2} />
        </View>
        <View style={styles.whoText}>
          <Text variant="chapter">{c.name}</Text>
          {roleLine(c) ? (
            <Text variant="body" tone="muted">
              {roleLine(c)}
            </Text>
          ) : null}
        </View>
      </View>
      {forWho ? (
        <View style={styles.forRow}>
          <Avatar person={forWho} size={22} />
          <Text variant="label">For {forWho.isMe ? 'you' : forWho.name}</Text>
        </View>
      ) : null}

      {c.phone || c.email ? (
        <View style={styles.quick}>
          {c.phone ? (
            <Button
              title="Call"
              icon={Phone}
              onPress={() => open(`tel:${dialable(c.phone ?? '')}`)}
            />
          ) : null}
          {c.phone ? (
            <Button
              title="Text"
              icon={MessageSquare}
              variant="secondary"
              onPress={() => open(`sms:${dialable(c.phone ?? '')}`)}
            />
          ) : null}
          {c.email ? (
            <Button
              title="Email"
              icon={Mail}
              variant="secondary"
              onPress={() => open(`mailto:${c.email}`)}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.details}>
        {c.phone ? <Detail label="Phone" value={c.phone} /> : null}
        {c.email ? <Detail label="Email" value={c.email} /> : null}
        {c.address ? (
          <Detail
            label="Address"
            value={c.address}
            action={
              <IconButton
                icon={MapPin}
                label="Open in maps"
                size={34}
                iconSize={16}
                onPress={() =>
                  open(
                    Platform.OS === 'ios'
                      ? `maps:?q=${encodeURIComponent(c.address ?? '')}`
                      : `https://maps.google.com/?q=${encodeURIComponent(c.address ?? '')}`,
                  )
                }
              />
            }
          />
        ) : null}
        {c.notes ? <Detail label="Notes" value={c.notes} /> : null}
      </View>

      <View style={styles.linked}>
        <Text variant="kicker" tone="muted">
          Linked tasks and projects
        </Text>
        {items === null ? (
          <Skeleton>
            <SkeletonRows count={2} />
          </Skeleton>
        ) : items.length === 0 ? (
          <Text variant="meta" tone="muted">
            Nothing linked yet. Link a task to {c.name.split(' ')[0]} from the task itself.
          </Text>
        ) : (
          items.map((i) => (
            <Pressable
              key={i.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: i.id } })}
              style={(s: PressState) => [styles.item, s.hovered && styles.itemHover]}
            >
              <View style={styles.itemText}>
                <Text variant="title" tone={isDone(i) ? 'muted' : 'ink'}>
                  {i.title}
                </Text>
                <Text variant="small" tone="muted">
                  {[
                    i.type === 'project' ? 'Project' : null,
                    isDone(i) ? 'Done' : STATUS_NOTE[i.status],
                    people.byId(i.ownerMemberId) ? people.label(i.ownerMemberId) : 'Either of you',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <ArrowRight size={16} color={color.muted} strokeWidth={2.2} />
            </Pressable>
          ))
        )}
      </View>

      {canEdit ? (
        <SheetActions>
          <View style={styles.actions}>
            <Button title="Edit" icon={Pencil} variant="secondary" onPress={() => onEdit(c)} />
          </View>
        </SheetActions>
      ) : null}
    </View>
  );
}

function Detail({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailText}>
        <Text variant="small" tone="muted">
          {label}
        </Text>
        <Text variant="body" selectable>
          {value}
        </Text>
      </View>
      {action}
    </View>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm({
  contact,
  category,
  onClose,
  onSaved,
  onRemoved,
}: {
  contact: Contact | null;
  category?: ContactCategory;
  onClose: () => void;
  onSaved: (c: Contact) => void;
  onRemoved: (c: Contact) => void;
}) {
  const { household } = useHousehold();
  const people = usePeople();
  const toast = useToast();
  const [name, setName] = useState(contact?.name ?? '');
  const [cat, setCat] = useState<ContactCategory>(contact?.category ?? category ?? 'health');
  const [role, setRole] = useState(contact?.role ?? '');
  const [org, setOrg] = useState(contact?.organization ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [address, setAddress] = useState(contact?.address ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [forId, setForId] = useState<string | null>(contact?.forMemberId ?? null);
  const [more, setMore] = useState(
    !!(contact?.address || contact?.notes || contact?.organization || contact?.forMemberId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const phoneError = phone.trim() && !/[0-9]/.test(phone) ? 'A phone number needs digits.' : null;
  const emailError =
    email.trim() && !EMAIL.test(email.trim()) ? 'That email address looks incomplete.' : null;
  const valid = name.trim().length > 0 && !phoneError && !emailError;
  const value = (s: string) => s.trim() || null;

  const save = async () => {
    if (!household || !valid) return;
    setBusy(true);
    setError(null);
    const fields = {
      name: name.trim(),
      category: cat,
      role: value(role),
      organization: value(org),
      phone: value(phone),
      email: value(email),
      address: value(address),
      notes: value(notes),
      forMemberId: forId,
    };
    try {
      if (contact) {
        const changed = Object.fromEntries(
          Object.entries(fields).filter(
            ([k, v]) => (contact as unknown as Record<string, unknown>)[k] !== v,
          ),
        );
        if (Object.keys(changed).length === 0) {
          onClose();
          return;
        }
        const res = await api<{ contact: Contact }>(
          `/households/${household.id}/contacts/${contact.id}`,
          { method: 'PATCH', body: { expectedVersion: contact.version, ...changed } },
        );
        onSaved(res.contact);
        toast.show(`Saved ${res.contact.name}`);
      } else {
        const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null));
        const res = await api<{ contact: Contact }>(`/households/${household.id}/contacts`, {
          method: 'POST',
          body,
        });
        onSaved(res.contact);
        toast.show(`Added ${res.contact.name}`, {
          detail: `Under ${CATEGORY[res.contact.category].label.toLowerCase()}.`,
        });
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!household || !contact) return;
    setBusy(true);
    try {
      await api(
        `/households/${household.id}/contacts/${contact.id}?expectedVersion=${contact.version}`,
        { method: 'DELETE' },
      );
      onRemoved(contact);
      toast.show(`Removed ${contact.name}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  const forOptions = [...people.caredFor, ...people.adults];

  return (
    <View style={styles.form}>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Dr. Priya Raman, Little Oaks, Dee the plumber…"
        maxLength={120}
        autoFocus={!contact}
      />
      <View style={styles.group}>
        <Text variant="label" style={styles.label}>
          What do they help with?
        </Text>
        <View style={styles.chips}>
          {CATEGORIES.map((k) => (
            <Chip
              key={k}
              label={CATEGORY[k].label}
              icon={CATEGORY[k].icon}
              selected={cat === k}
              onPress={() => setCat(k)}
            />
          ))}
        </View>
      </View>
      <Field
        label="Role"
        value={role}
        onChangeText={setRole}
        placeholder="Pediatrician, vet, plumber, sitter"
        maxLength={80}
      />
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="(503) 555-0114"
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={40}
            error={phoneError}
          />
        </View>
        <View style={styles.pairItem}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            maxLength={254}
            error={emailError}
          />
        </View>
      </View>
      {more ? (
        <>
          <Field
            label="Organization"
            value={org}
            onChangeText={setOrg}
            placeholder="Hawthorne Pediatrics"
            maxLength={120}
          />
          <View style={styles.group}>
            <Text variant="label" style={styles.label}>
              Who is it for?
            </Text>
            <View style={styles.chips}>
              <Chip
                label="The household"
                selected={forId === null}
                onPress={() => setForId(null)}
              />
              {forOptions.map((p) => (
                <Chip
                  key={p.id}
                  label={p.isMe ? 'You' : p.name}
                  leading={<Avatar person={p} size={20} />}
                  selected={forId === p.id}
                  accent={p.color}
                  onPress={() => setForId(p.id)}
                />
              ))}
            </View>
          </View>
          <Field
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="1820 SE Hawthorne Blvd"
            maxLength={300}
          />
          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Nurse line open until 9pm"
            maxLength={2000}
            multiline
          />
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setMore(true)}
          style={(s: PressState) => [styles.more, s.hovered && { opacity: 0.7 }]}
        >
          <Plus size={15} color={color.ink} strokeWidth={2.4} />
          <Text variant="label">Add who it’s for, an address or a note</Text>
        </Pressable>
      )}
      <SheetActions>
        {error ? <ErrorNotice message={error} /> : null}
        <View style={styles.actions}>
          <Button
            title={contact ? 'Save' : 'Add contact'}
            busy={busy}
            disabled={!valid}
            onPress={() => void save()}
          />
          <Button title="Cancel" variant="quiet" onPress={onClose} />
          <View style={styles.spacer} />
          {contact ? (
            confirmDelete ? (
              <Button
                title="Yes, remove"
                variant="secondary"
                size="sm"
                onPress={() => void remove()}
              />
            ) : (
              <IconButton
                icon={Trash2}
                label={`Remove ${contact.name}`}
                onPress={() => setConfirmDelete(true)}
              />
            )
          ) : null}
        </View>
      </SheetActions>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: 16 },
  who: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.lane,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whoText: { flex: 1, gap: 2 },
  forRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quick: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  details: {
    borderRadius: radius.lg,
    backgroundColor: color.ground,
    paddingHorizontal: 14,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  detailText: { flex: 1, gap: 1 },
  linked: { gap: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    cursor: 'pointer',
  },
  itemHover: { opacity: 0.8 },
  itemText: { flex: 1, gap: 1 },
  form: { gap: 14 },
  group: { gap: 8 },
  label: { fontSize: 13.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pair: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  pairItem: { flex: 1, minWidth: 200 },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    alignSelf: 'flex-start',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spacer: { flex: 1 },
});
