import { StyleSheet, Text, View, useColorScheme } from 'react-native';

// M0 placeholder. Sign-in arrives in M1 and Today in M2.
export default function Home() {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={[styles.screen, dark ? styles.screenDark : styles.screenLight]}>
      <Text style={[styles.title, dark ? styles.textDark : styles.textLight]}>FamilyOS</Text>
      <Text style={[styles.body, dark ? styles.mutedDark : styles.mutedLight]}>
        Repository foundation. Nothing here yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  screenLight: { backgroundColor: '#FAF8F5' },
  screenDark: { backgroundColor: '#1C1B19' },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, textAlign: 'center' },
  textLight: { color: '#1C1B19' },
  textDark: { color: '#F4F1EC' },
  mutedLight: { color: '#5C5850' },
  mutedDark: { color: '#B5AFA5' },
});
