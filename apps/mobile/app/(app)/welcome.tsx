import { Redirect, router } from 'expo-router';
import { ArrowRight, Plus } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Either } from '../../design/Avatar';
import { Button } from '../../design/Button';
import { LanesArt } from '../../design/EmptyState';
import { useLayout } from '../../design/layout';
import { FadeIn, useAcknowledgment } from '../../design/motion';
import { Text } from '../../design/Text';
import { color } from '../../design/tokens';
import { WELCOME_KEY } from '../../lib/acknowledgments';
import { useCapture } from '../../lib/capture';
import { useHousehold } from '../../lib/household';
import { usePeople } from '../../lib/people';

// One screen for an adult who just joined from an invite: what's theirs, what's shared and where
// capture lives. Shown once (a server-backed acknowledgment), in the setup's visual language.
export default function Welcome() {
  const { household } = useHousehold();
  const people = usePeople();
  const { phone } = useLayout();
  const { shortcuts } = useCapture();
  const insets = useSafeAreaInsets();
  const { seen, acknowledge } = useAcknowledgment(WELCOME_KEY);

  if (!household) return null;
  if (seen === true) return <Redirect href="/" />;
  const me = people.me;
  const owner = people.all.find((p) => p.role === 'owner' && !p.isMe);
  const partnerColors: [string, string] | undefined =
    me && owner ? [me.color, owner.color] : undefined;

  const done = async () => {
    await acknowledge();
    router.replace('/');
  };

  const points = [
    {
      key: 'yours',
      icon: me ? <Avatar person={me} size={26} /> : null,
      title: 'What’s yours',
      line: 'Things on your list wear your color. Today puts yours first: what’s late, then what’s due.',
    },
    {
      key: 'shared',
      icon: <Either size={26} colors={partnerColors} />,
      title: 'What’s shared',
      line: `Shared things are for either of you: take one with “I’ll take it”, or hand something to ${owner?.name ?? 'the other'} in one tap.`,
    },
    {
      key: 'capture',
      icon: (
        <View style={styles.plus}>
          <Plus size={16} color={color.onInk} strokeWidth={2.6} />
        </View>
      ),
      title: 'Where capture is',
      line: phone
        ? 'The + at the bottom right adds anything, from any screen.'
        : `Capture, at the top right, adds anything from any screen${shortcuts ? ' (or press N)' : ''}.`,
    },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + (phone ? 28 : 64), paddingBottom: insets.bottom + 40 },
      ]}
    >
      <FadeIn style={styles.column}>
        <View style={styles.head}>
          <Text variant="kicker" tone="muted">
            Welcome to FamilyOS
          </Text>
          <Text variant="hero">
            {`Hi ${me?.name.split(' ')[0] ?? 'there'}. You’re in ${household.name}.`}
          </Text>
          <Text variant="lead" tone="muted" style={styles.lead}>
            {owner
              ? `${owner.name} invited you. Here’s how the two of you share it.`
              : 'Here’s how you share it.'}
          </Text>
        </View>
        <LanesArt colors={[me?.color, owner?.color, '#D99A1C']} height={20} style={styles.art} />
        <View style={styles.points}>
          {points.map((p) => (
            <View key={p.key} style={styles.point}>
              <View style={styles.icon}>{p.icon}</View>
              <View style={styles.pointText}>
                <Text variant="title">{p.title}</Text>
                <Text variant="body" tone="muted">
                  {p.line}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Button
          title="Go to Today"
          icon={ArrowRight}
          iconRight
          size="lg"
          onPress={() => void done()}
          style={styles.go}
        />
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.ground },
  page: { paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 22 },
  head: { gap: 10 },
  lead: { maxWidth: 560 },
  art: { marginVertical: 2 },
  points: { gap: 18 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon: { width: 30, alignItems: 'center', paddingTop: 2 },
  pointText: { flex: 1, gap: 2 },
  plus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  go: { marginTop: 6 },
});
