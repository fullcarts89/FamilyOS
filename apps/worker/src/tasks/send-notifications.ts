import {
  claimNotifications,
  loadNotificationData,
  recordDeliveries,
  withNotifierContext,
  type Database,
  type Recipient,
} from '@familyos/db';
import { planNotifications, type PlannedNotification } from '@familyos/domain';
import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';
import type { PushMessage, PushSender, PushTicket } from '../push';

interface Claimed {
  logId: string;
  recipient: Recipient;
  planned: PlannedNotification;
}

/**
 * Every 5 minutes: works out, per member with a registered iPhone, which notifications are due
 * in their household's timezone (packages/domain/src/notifications.ts), records each one in the
 * log before sending (so none is ever sent twice, even if two runs overlap), sends through Expo
 * with no transaction open, then records the outcome and forgets devices Expo says are gone.
 * As `familyos_notifier`, one household per transaction. Logs counts only, never text, titles
 * or tokens. Delivery is at most once: a failed send is recorded, not retried.
 */
export function sendNotifications(
  db: Kysely<Database>,
  options: {
    /** Null: sending is off. Nothing is planned or recorded, so nothing is lost. */
    sender: PushSender | null;
    now?: () => Date;
    households?: () => Promise<{ id: string }[]>;
  },
): Task {
  const now = options.now ?? (() => new Date());
  const listHouseholds =
    options.households ??
    (() =>
      withNotifierContext(db, null, (trx) =>
        trx.selectFrom('app.household').select('id').execute(),
      ));
  const sender = options.sender;
  return async (_payload, helpers) => {
    if (!sender) {
      helpers.logger.error(
        'notifications off: EXPO_ACCESS_TOKEN is not set (required in production); nothing sent',
      );
      return;
    }
    const households = await listHouseholds();
    const counts = { sent: 0, skipped: 0, failed: 0, tokensRemoved: 0, householdsFailed: 0 };
    for (const { id: householdId } of households) {
      try {
        const at = now();
        const claimed = await withNotifierContext(db, householdId, async (trx) => {
          const data = await loadNotificationData(trx, householdId, at);
          if (!data) return [];
          const plans = data.recipients.flatMap((recipient) =>
            planNotifications({
              memberId: recipient.memberId,
              now: at.toISOString(),
              timeZone: data.timeZone,
              settings: recipient.settings,
              members: data.members,
              occurrences: data.occurrences,
              tasks: data.tasks.filter((t) => t.ownerMemberId === recipient.memberId),
              dinner: data.dinner,
              committedWeeks: data.committedWeeks,
              audit: data.audit,
              partnerContext: data.partnerContext,
              log: data.logs.get(recipient.memberId) ?? [],
              lastSeenAt: recipient.lastSeenAt,
              coverRequests: data.coverRequests,
              handovers: data.handovers,
            }).map((planned) => ({ recipient, planned })),
          );
          const logged = await claimNotifications(
            trx,
            householdId,
            plans.map(({ recipient, planned }) => ({
              memberId: recipient.memberId,
              kind: planned.kind,
              dedupeKey: planned.dedupeKey,
              status: planned.send ? 'pending' : 'skipped',
            })),
            at,
          );
          const out: Claimed[] = [];
          for (const { recipient, planned } of plans) {
            const logId = logged.get(`${recipient.memberId}|${planned.dedupeKey}`);
            if (logId === undefined) continue;
            if (planned.send && planned.message) out.push({ logId, recipient, planned });
            else counts.skipped++;
          }
          return out;
        });
        if (claimed.length === 0) continue;

        const messages: (PushMessage & { logId: string; tokenId: string })[] = claimed.flatMap(
          ({ logId, recipient, planned }) =>
            recipient.tokens.map((token) => ({
              logId,
              tokenId: token.id,
              to: token.token,
              title: planned.message?.title ?? '',
              body: planned.message?.body ?? '',
              data: { kind: planned.kind, householdId },
              urgent: planned.urgent,
            })),
        );
        let tickets: PushTicket[];
        try {
          tickets = await sender.send(
            messages.map(({ to, title, body, data, urgent }) => ({
              to,
              title,
              body,
              data,
              urgent,
            })),
          );
        } catch (error) {
          helpers.logger.error('push request failed', {
            householdId,
            errorName: error instanceof Error ? error.name : 'unknown',
          });
          tickets = messages.map(() => ({ ok: false, error: 'unknown' }));
        }

        const delivered = new Set<string>();
        const used = new Set<string>();
        const unregistered = new Set<string>();
        messages.forEach((m, i) => {
          const ticket = tickets[i];
          if (ticket?.ok) {
            delivered.add(m.logId);
            used.add(m.tokenId);
          } else if (ticket?.error === 'DeviceNotRegistered') {
            unregistered.add(m.tokenId);
          }
        });
        const sent = claimed.filter((c) => delivered.has(c.logId)).map((c) => c.logId);
        const failed = claimed.filter((c) => !delivered.has(c.logId)).map((c) => c.logId);
        await withNotifierContext(db, householdId, (trx) =>
          recordDeliveries(
            trx,
            householdId,
            {
              sent,
              failed,
              usedTokenIds: [...used],
              unregisteredTokenIds: [...unregistered],
            },
            now(),
          ),
        );
        counts.sent += sent.length;
        counts.failed += failed.length;
        counts.tokensRemoved += unregistered.size;
      } catch (error) {
        counts.householdsFailed++;
        helpers.logger.error('notifications failed', {
          householdId,
          errorName: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
    helpers.logger.info('notifications', { households: households.length, ...counts });
  };
}
