import { AlertCircle, CloudOff } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { FAILURE_WORDS, failureKind, lastFailureKind } from '../lib/api';
import { Button } from './Button';
import { Text } from './Text';
import { color, radius } from './tokens';

/** Screens that still word every failure as "Check your connection." get the real reason. */
const LEGACY_SUFFIX = ' Check your connection.';

/**
 * A problem the person can act on: what happened, and a way to try again. With `error`, the
 * reason is worded from what actually failed (offline, too slow, on our side, signed out), never
 * "check your connection" for a server problem.
 */
export function ErrorNotice({
  message,
  onRetry,
  error,
}: {
  message: string;
  onRetry?: () => void;
  error?: unknown;
}) {
  let text = message;
  const kind = error !== undefined ? failureKind(error) : null;
  if (kind && kind !== 'request') text = `${message} ${FAILURE_WORDS[kind]}`;
  else if (kind === null && message.endsWith(LEGACY_SUFFIX)) {
    const last = lastFailureKind();
    if (last && last !== 'request' && last !== 'conflict')
      text = `${message.slice(0, -LEGACY_SUFFIX.length)} ${FAILURE_WORDS[last]}`;
  }
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <AlertCircle size={18} color={color.danger} strokeWidth={2.2} />
      <Text variant="meta" color={color.danger} style={styles.text}>
        {text}
      </Text>
      {onRetry ? <Button title="Try again" size="sm" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** A quiet, neutral note (not an error): "Theo already did this", "Please sign in again". */
export function Notice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <View style={[styles.notice, styles.quiet]} role="status">
      <Text variant="meta" style={styles.text}>
        {message}
      </Text>
      {action}
    </View>
  );
}

/**
 * A screen's load failed. With what it loaded before still showing, an offline failure needs no
 * words here (the app's offline note says it); anything else says what and offers a retry.
 */
export function LoadNotice({
  error,
  what,
  hasData,
  onRetry,
}: {
  error: unknown;
  /** "today", "your tasks". */
  what: string;
  hasData: boolean;
  onRetry: () => void;
}) {
  if (!error) return null;
  const kind = failureKind(error);
  if (hasData && kind === 'offline') return null;
  if (kind === 'offline') {
    return (
      <View style={[styles.notice, styles.quiet]} role="status">
        <CloudOff size={18} color={color.ink} strokeWidth={2.2} />
        <Text variant="meta" style={styles.text}>
          {`You’re offline, so ${what} can’t load yet. It will as soon as you’re back online.`}
        </Text>
        <Button title="Try again" size="sm" variant="secondary" onPress={onRetry} />
      </View>
    );
  }
  return (
    <ErrorNotice
      message={hasData ? `Couldn’t refresh ${what}.` : `Couldn’t load ${what}.`}
      error={error}
      onRetry={onRetry}
    />
  );
}

/** Shown by the app shell while there's no connection: what you see is what was last loaded. */
export function OfflineNote() {
  return (
    <View style={styles.offline} role="status">
      <CloudOff size={15} color={color.ink} strokeWidth={2.2} />
      <Text variant="small" style={styles.offlineText}>
        You’re offline. Showing what was last loaded; it updates when you’re back.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: color.dangerTint,
  },
  quiet: { backgroundColor: color.lane },
  text: { flex: 1, minWidth: 180, fontSize: 14 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
    backgroundColor: color.lane,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  offlineText: { flexShrink: 1 },
});
