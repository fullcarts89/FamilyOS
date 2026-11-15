import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLayout } from '../../design/layout';
import { Text } from '../../design/Text';
import { em, font } from '../../design/tokens';
import { color } from '../../design/tokens';

/** A Weekly Reset chapter's opening: "Chapter 2 · Loose ends", a Fraunces question, one line. */
export function ChapterHead({
  kicker,
  title,
  lead,
  large,
}: {
  kicker: string;
  title: string;
  lead?: ReactNode;
  /** The reflective chapters (look back, the opening) get A's larger, slower type. */
  large?: boolean;
}) {
  const { phone } = useLayout();
  return (
    <View style={styles.head}>
      <Text variant="kicker" tone="muted">
        {kicker}
      </Text>
      <Text
        accessibilityRole="header"
        style={[
          styles.title,
          large && styles.large,
          phone && styles.phone,
          phone && large && styles.phoneLarge,
        ]}
      >
        {title}
      </Text>
      {lead ? (
        typeof lead === 'string' ? (
          <Text variant="lead" tone="muted" style={styles.lead}>
            {lead}
          </Text>
        ) : (
          lead
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8 },
  title: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: em(30, -0.012),
    color: color.ink,
  },
  large: { fontSize: 44, lineHeight: 50, letterSpacing: em(44, -0.015) },
  phone: { fontSize: 25, lineHeight: 31 },
  phoneLarge: { fontSize: 31, lineHeight: 37 },
  lead: { maxWidth: 640 },
});
