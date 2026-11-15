import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { LanesArt } from '../design/EmptyState';
import { useLayout } from '../design/layout';
import { Mark } from '../design/Mark';
import { FadeIn } from '../design/motion';
import { Text } from '../design/Text';
import { color, radius, shadow } from '../design/tokens';

/**
 * The screens before you're in: a warm welcome on one side (the household's lanes, a Fraunces
 * line), the form on the other. Stacked on phones.
 */
export function AuthLayout({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  const { kind, phone } = useLayout();
  const split = kind === 'desktop';
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.fill}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.scroll, split && styles.scrollSplit]}
        keyboardShouldPersistTaps="handled"
      >
        {split ? (
          <View style={styles.welcome}>
            <View style={styles.brand}>
              <Mark size={30} />
              <Text variant="h3" style={styles.brandText}>
                FamilyOS
              </Text>
            </View>
            <View style={styles.welcomeBody}>
              <Text variant="greeting" style={styles.welcomeTitle}>
                Your household, in one shared rhythm.
              </Text>
              <Text variant="lead" tone="muted" style={styles.welcomeLead}>
                Who has what, who has the kids, and what’s coming up, so you both can see it without
                asking.
              </Text>
              <LanesArt height={30} style={styles.art} />
            </View>
            <Text variant="small" tone="faint">
              Private to your household. No ads, no tracking.
            </Text>
          </View>
        ) : null}
        <View style={[styles.formSide, split && styles.formSideSplit]}>
          <FadeIn style={[styles.card, phone && styles.cardPhone]}>
            {!split ? (
              <View style={[styles.brand, styles.brandSmall]}>
                <Mark size={26} />
                <Text variant="h3" style={styles.brandText}>
                  FamilyOS
                </Text>
              </View>
            ) : null}
            <Text variant="chapter" style={styles.title}>
              {title}
            </Text>
            {lead ? (
              <Text variant="body" tone="muted">
                {lead}
              </Text>
            ) : null}
            <View style={styles.form}>{children}</View>
          </FadeIn>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.ground },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  scrollSplit: { flexDirection: 'row', padding: 0, alignItems: 'stretch' },
  welcome: {
    flex: 1.1,
    padding: 56,
    justifyContent: 'space-between',
    borderRightWidth: 1,
    borderRightColor: color.hairline,
  },
  welcomeBody: { gap: 16, maxWidth: 560 },
  welcomeTitle: { fontSize: 52, lineHeight: 58 },
  welcomeLead: { maxWidth: 480 },
  art: { marginTop: 28, maxWidth: 480 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandSmall: { marginBottom: 18 },
  brandText: { fontSize: 21 },
  formSide: { alignItems: 'center' },
  formSideSplit: { flex: 1, justifyContent: 'center', padding: 40 },
  card: {
    width: '100%',
    maxWidth: 440,
    padding: 32,
    gap: 8,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    boxShadow: shadow.card,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  cardPhone: { padding: 22, borderRadius: radius.lg },
  title: { fontSize: 28, lineHeight: 34 },
  form: { gap: 16, marginTop: 16 },
});
