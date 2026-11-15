import { Plus, X } from 'lucide-react-native';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, IconButton, type PressState } from '../../design/Button';
import { RoundCheckbox } from '../../design/RoundCheckbox';
import { GroupLabel } from '../../design/Section';
import { Text } from '../../design/Text';
import { color, font, radius } from '../../design/tokens';
import type { GroceryAisle, GroceryItem } from '../../lib/api';
import { AISLES, AISLE_LABEL, guessAisle, splitDetail } from '../../lib/grocery-words';
import { usePeople } from '../../lib/people';

/** Quick add: type it, see where it goes ("Produce"), tap the aisle to change it, Enter to add. */
export function GroceryAdd({
  onAdd,
  autoFocus,
  compact,
}: {
  onAdd: (raw: string, aisle?: GroceryAisle) => Promise<boolean>;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [raw, setRaw] = useState('');
  const [aisle, setAisle] = useState<GroceryAisle | null>(null);
  const [picking, setPicking] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const name = splitDetail(raw).name;
  const guessed = aisle ?? (name ? guessAisle(name) : null);

  const submit = async () => {
    if (!name) return;
    const text = raw;
    const where = guessed ?? undefined;
    setRaw('');
    setAisle(null);
    setPicking(false);
    input.current?.focus();
    const ok = await onAdd(text, where);
    if (!ok) setRaw(text);
  };

  return (
    <View style={styles.add}>
      <View style={[styles.addRow, compact && styles.addRowCompact]}>
        <Plus size={18} color={color.ink} strokeWidth={2.4} />
        <TextInput
          ref={input}
          value={raw}
          onChangeText={(t) => {
            setRaw(t);
            if (!t) setAisle(null);
          }}
          onSubmitEditing={() => void submit()}
          placeholder={
            compact ? 'Add milk, 2 lemons…' : 'Add to the list: milk, 2 lemons, dog food…'
          }
          placeholderTextColor={color.faint}
          accessibilityLabel="Add to the grocery list"
          returnKeyType="done"
          blurOnSubmit={false}
          autoFocus={autoFocus}
          maxLength={120}
          style={styles.addInput}
        />
        {guessed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Aisle: ${AISLE_LABEL[guessed]}. Change the aisle`}
            onPress={() => setPicking((v) => !v)}
            style={(s: PressState) => [styles.aisleTag, s.hovered && { borderColor: color.ink }]}
          >
            <Text variant="small" tone="muted">
              {AISLE_LABEL[guessed]}
            </Text>
          </Pressable>
        ) : null}
        <Button
          title="Add"
          size="sm"
          disabled={!name}
          onPress={() => void submit()}
          style={styles.addButton}
        />
      </View>
      {picking ? (
        <View style={styles.aislePick} accessibilityRole="radiogroup" aria-label="Aisle">
          {AISLES.map((a) => (
            <Pressable
              key={a}
              accessibilityRole="radio"
              accessibilityState={{ checked: guessed === a }}
              aria-checked={guessed === a}
              onPress={() => {
                setAisle(a);
                setPicking(false);
                input.current?.focus();
              }}
              style={(s: PressState) => [
                styles.aisleChip,
                guessed === a && styles.aisleChipOn,
                s.hovered && guessed !== a && { borderColor: color.ink },
              ]}
            >
              <Text variant="small" color={guessed === a ? color.onInk : color.ink}>
                {AISLE_LABEL[a]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The list by aisle, in store order. Ticking an item strikes it through at once and leaves it
 * where it is (so the list doesn't jump under your thumb in the store) until "Clear checked".
 */
export function GroceryList({
  items,
  onToggle,
  onRemove,
  onClear,
  showChecked = true,
}: {
  items: GroceryItem[];
  onToggle: (item: GroceryItem) => void;
  onRemove?: (item: GroceryItem) => void;
  onClear?: () => void;
  showChecked?: boolean;
}) {
  const people = usePeople();
  const groups = useMemo(() => {
    const shown = showChecked ? items : items.filter((i) => i.checkedAt === null);
    return AISLES.map((aisle) => ({
      aisle,
      items: shown
        .filter((i) => i.aisle === aisle)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length > 0);
  }, [items, showChecked]);
  const checked = items.filter((i) => i.checkedAt !== null).length;

  return (
    <View>
      {groups.map((g) => (
        <View key={g.aisle} style={styles.group}>
          <GroupLabel label={AISLE_LABEL[g.aisle]} />
          {g.items.map((item, i) => {
            const done = item.checkedAt !== null;
            const by = people.byId(item.checkedByMemberId);
            return (
              <View
                key={item.id}
                style={[styles.item, i === g.items.length - 1 && styles.itemLast]}
              >
                <RoundCheckbox
                  checked={done}
                  onPress={() => onToggle(item)}
                  label={done ? `Uncheck ${item.name}` : `Check off ${item.name}`}
                  color={color.ink}
                  size={24}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={done ? `Uncheck ${item.name}` : `Check off ${item.name}`}
                  onPress={() => onToggle(item)}
                  style={styles.itemText}
                >
                  <Text variant="title" tone={done ? 'faint' : 'ink'} style={done && styles.struck}>
                    {item.name}
                    {item.detail ? (
                      <Text variant="body" tone={done ? 'faint' : 'muted'}>
                        {'  '}
                        {item.detail}
                      </Text>
                    ) : null}
                  </Text>
                  {done && by && !by.isMe ? (
                    <Text variant="small" tone="faint">
                      In {by.name}’s cart
                    </Text>
                  ) : null}
                </Pressable>
                {onRemove ? (
                  <IconButton
                    icon={X}
                    label={`Remove ${item.name}`}
                    size={34}
                    iconSize={16}
                    onPress={() => onRemove(item)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      {onClear && checked > 0 ? (
        <View style={styles.clear}>
          <Button
            title={checked === 1 ? 'Clear the checked item' : `Clear ${checked} checked`}
            variant="secondary"
            size="sm"
            onPress={onClear}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  add: { gap: 8 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  addRowCompact: { minHeight: 48 },
  addButton: { alignSelf: 'center' },
  addInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontFamily: font.ui,
    fontSize: 16,
    color: color.ink,
  },
  aisleTag: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    cursor: 'pointer',
  },
  aislePick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aisleChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line2,
    backgroundColor: color.surface,
    cursor: 'pointer',
  },
  aisleChipOn: { backgroundColor: color.ink, borderColor: color.ink },
  group: { marginTop: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  itemLast: { borderBottomWidth: 0 },
  itemText: { flex: 1, minWidth: 0, paddingVertical: 6, cursor: 'pointer' },
  struck: { textDecorationLine: 'line-through', textDecorationColor: color.faint },
  clear: { marginTop: 16 },
});
