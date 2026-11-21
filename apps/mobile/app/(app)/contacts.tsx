import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { Mail, Phone, Plus, Search, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { CATEGORIES, CATEGORY, dialable, roleLine } from '../../components/contacts/contact-meta';
import { ContactSheet, type ContactTarget } from '../../components/contacts/ContactSheet';
import { Avatar } from '../../design/Avatar';
import { Button, IconButton, type PressState } from '../../design/Button';
import { EmptyState, LanesArt } from '../../design/EmptyState';
import { useLayout } from '../../design/layout';
import { FadeIn, Skeleton, SkeletonRows } from '../../design/motion';
import { ErrorNotice } from '../../design/Notice';
import { Page, PageHeader } from '../../design/Page';
import { GroupLabel } from '../../design/Section';
import { Text } from '../../design/Text';
import { color, font, radius, shadow } from '../../design/tokens';
import { api, type Contact } from '../../lib/api';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';

// Contacts: the people the household relies on, grouped by what they help with (health first),
// searchable, each one a tap from a call, a text or an email.
export default function Contacts() {
  const { household } = useHousehold();
  const people = usePeople();
  const { phone, desktop } = useLayout();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<ContactTarget | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const canEdit = household?.role !== 'caregiver';

  const load = useCallback(async () => {
    if (!household) return;
    try {
      const res = await api<{ contacts: Contact[] }>(`/households/${household.id}/contacts`);
      setContacts(res.contacts);
      setError(false);
    } catch {
      setError(true);
    }
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: Contact) =>
      !q ||
      [
        c.name,
        c.role,
        c.organization,
        c.phone,
        c.email,
        c.notes,
        CATEGORY[c.category].label,
        people.byId(c.forMemberId)?.name,
      ].some((v) => v?.toLowerCase().includes(q));
    const shown = (contacts ?? []).filter(match);
    return CATEGORIES.map((k) => ({
      category: k,
      items: shown.filter((c) => c.category === k).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length > 0);
  }, [contacts, query, people]);

  const saved = (c: Contact) => {
    setContacts((all) =>
      all
        ? all.some((x) => x.id === c.id)
          ? all.map((x) => (x.id === c.id ? c : x))
          : [...all, c]
        : [c],
    );
    setSheet({ mode: 'view', contact: c });
  };
  const removed = (c: Contact) => {
    setContacts((all) => (all ? all.filter((x) => x.id !== c.id) : all));
    setSheet(null);
  };
  const openUrl = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <Page
      maxWidth={1180}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <PageHeader
        kicker="Key contacts"
        title="Contacts"
        lead="The people the household relies on: the pediatrician, the daycare, the vet, the plumber. Shared with every adult (and the sitter can read them)."
        action={
          canEdit ? (
            <Button title="Add a contact" icon={Plus} onPress={() => setSheet({ mode: 'new' })} />
          ) : undefined
        }
      />

      {contacts && contacts.length > 0 ? (
        <View style={[styles.search, !phone && styles.searchWide]}>
          <Search size={18} color={color.muted} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, role or who it’s for"
            placeholderTextColor={color.faint}
            accessibilityLabel="Search contacts"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {query ? (
            <IconButton
              icon={X}
              label="Clear search"
              size={32}
              iconSize={16}
              onPress={() => setQuery('')}
            />
          ) : null}
        </View>
      ) : null}

      {error ? (
        <View style={styles.gap}>
          <ErrorNotice message="Couldn’t load contacts. Check your connection." onRetry={load} />
        </View>
      ) : null}
      {!contacts && !error ? (
        <Skeleton label="Loading contacts">
          <View style={styles.gap}>
            <SkeletonRows count={5} />
          </View>
        </Skeleton>
      ) : null}

      {contacts && contacts.length === 0 ? (
        <EmptyState
          art={<LanesArt style={styles.art} />}
          title="Start with the number you look up most"
          body="The pediatrician, the daycare’s front desk, the vet. Add them once and they’re a tap away for both of you, at 2am or in the car."
          action={
            canEdit ? (
              <Button
                title="Add the first contact"
                icon={Plus}
                onPress={() => setSheet({ mode: 'new' })}
              />
            ) : undefined
          }
        />
      ) : null}

      {contacts && contacts.length > 0 && groups.length === 0 ? (
        <EmptyState
          compact
          title={`Nobody matches “${query.trim()}”`}
          body="Try a role (“vet”), a name, or who it’s for."
          action={<Button title="Clear search" variant="secondary" onPress={() => setQuery('')} />}
        />
      ) : null}

      {groups.length ? (
        <FadeIn style={[styles.groups, !phone && styles.groupsWide]}>
          {groups.map((g) => {
            const Icon = CATEGORY[g.category].icon;
            return (
              <View
                key={g.category}
                style={[styles.group, !phone && (desktop ? styles.groupThird : styles.groupHalf)]}
              >
                <View style={styles.groupHead}>
                  <Icon size={16} color={color.muted} strokeWidth={2.2} />
                  <GroupLabel label={CATEGORY[g.category].label} style={styles.groupLabel} />
                </View>
                <View style={styles.cards}>
                  {g.items.map((c) => {
                    const forWho = people.byId(c.forMemberId);
                    return (
                      <View key={c.id} style={styles.card}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${c.name}${roleLine(c) ? `, ${roleLine(c)}` : ''}${forWho ? `, for ${forWho.isMe ? 'you' : forWho.name}` : ''}`}
                          accessibilityHint="Opens the contact"
                          onPress={() => setSheet({ mode: 'view', contact: c })}
                          style={(s: PressState) => [styles.cardMain, s.hovered && styles.hover]}
                        >
                          <Text variant="title" numberOfLines={1}>
                            {c.name}
                          </Text>
                          {roleLine(c) ? (
                            <Text variant="meta" tone="muted" numberOfLines={1}>
                              {roleLine(c)}
                            </Text>
                          ) : null}
                          {forWho ? (
                            <View style={styles.forRow}>
                              <Avatar person={forWho} size={18} />
                              <Text variant="small" tone="muted">
                                For {forWho.isMe ? 'you' : forWho.name}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                        <View style={styles.cardActions}>
                          {c.phone ? (
                            <Pressable
                              accessibilityRole="link"
                              accessibilityLabel={`Call ${c.name} at ${c.phone}`}
                              onPress={() => openUrl(`tel:${dialable(c.phone ?? '')}`)}
                              style={(s: PressState) => [
                                styles.link,
                                s.hovered && styles.linkHover,
                              ]}
                            >
                              <Phone size={15} color={color.ink} strokeWidth={2.2} />
                              <Text variant="small" style={styles.linkText}>
                                {c.phone}
                              </Text>
                            </Pressable>
                          ) : null}
                          {c.email && !phone ? (
                            <Pressable
                              accessibilityRole="link"
                              accessibilityLabel={`Email ${c.name}`}
                              onPress={() => openUrl(`mailto:${c.email}`)}
                              style={(s: PressState) => [
                                styles.link,
                                s.hovered && styles.linkHover,
                              ]}
                            >
                              <Mail size={15} color={color.ink} strokeWidth={2.2} />
                              <Text variant="small" style={styles.linkText} numberOfLines={1}>
                                Email
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </FadeIn>
      ) : null}

      <ContactSheet
        target={sheet}
        onClose={() => setSheet(null)}
        onSaved={saved}
        onRemoved={removed}
        onEdit={(c) => setSheet({ mode: 'edit', contact: c })}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  search: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  searchWide: { maxWidth: 520 },
  searchInput: { flex: 1, minHeight: 44, fontFamily: font.ui, fontSize: 16, color: color.ink },
  gap: { marginTop: 24 },
  art: { maxWidth: 380, marginBottom: 8 },
  groups: { marginTop: 12 },
  groupsWide: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, alignItems: 'flex-start' },
  group: { marginTop: 18 },
  groupHalf: { width: '48.5%' },
  groupThird: { width: '31.9%' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 6 },
  groupLabel: { paddingTop: 0, paddingBottom: 0 },
  cards: { gap: 10, marginTop: 10 },
  card: {
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    boxShadow: shadow.card,
    borderWidth: 1.5,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  cardMain: { padding: 14, paddingBottom: 8, gap: 3, cursor: 'pointer' },
  hover: { backgroundColor: color.ground },
  forRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.lane,
    cursor: 'pointer',
  },
  linkHover: { backgroundColor: color.line2 },
  linkText: { color: color.ink, fontFamily: font.uiBold },
});
