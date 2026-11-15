import type { Database } from '@familyos/db';
import type { TaskList } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { heartbeat } from './heartbeat';
import { expoPushSender, type PushSender } from '../push';
import { materializeRoutines } from './materialize-routines';
import { sendNotifications } from './send-notifications';
import { syncCalendars } from './sync-calendars';

export function createTaskList(
  db: Kysely<Database>,
  options: { calendarKey?: Buffer; pushSender?: PushSender } = {},
): TaskList {
  return {
    heartbeat: heartbeat(db),
    materialize_routines: materializeRoutines(db),
    sync_calendars: syncCalendars(db, options.calendarKey ? { key: options.calendarKey } : {}),
    send_notifications: sendNotifications(db, {
      sender: options.pushSender ?? expoPushSender(),
    }),
  };
}

/**
 * Heartbeat every 10 minutes, so readiness notices a stopped worker within half an hour.
 * Routines hourly, so each household's midnight is picked up within the hour whatever its
 * timezone. Calendar subscriptions every 15 minutes; each is refreshed about every 30.
 * Notifications every 5 minutes, so a reminder is at most 5 minutes late.
 */
export const CRONTAB = [
  '*/10 * * * * heartbeat',
  '7 * * * * materialize_routines',
  '*/15 * * * * sync_calendars',
  '*/5 * * * * send_notifications',
].join('\n');
