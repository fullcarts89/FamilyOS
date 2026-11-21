# iPhone app and widget

**Status:** the app and the widget are configured and the config plugin generates the Xcode project cleanly (`expo prebuild`, checked on Linux). The widget's Swift has **not been compiled yet**: that happens in the first `eas build` (step 4). Nothing has been sent to Apple or Expo.

The iPhone app is the same Expo app as the web app. It adds one widget, **Today**, for the Home Screen and the Lock Screen. It shows what's yours today and the next handoff, and lets you tick things off without opening the app. It doesn't score, count streaks or nudge.

| Piece | Where |
|---|---|
| Widget (SwiftUI, WidgetKit, App Intents) | `apps/mobile/targets/widget`, built by `@bacons/apple-targets` 5.0.0 (MIT) |
| App ↔ widget glue (TypeScript) | `apps/mobile/native` |
| Shared session | `apps/mobile/lib/session-storage.ts`, `lib/supabase.ts` (iOS only) |
| Build and submit | `apps/mobile/eas.json` (`production` profile), `apps/mobile/app.json` |

Bundle IDs: app `app.familyos.household`, widget `app.familyos.household.widget`. App Group `group.app.familyos.household`. iOS 17 or later.

## What the widget shows

- **Small:** how many of your items are due today and the next handoff ("Next handoff · 3:15 PM, Pick up June, You · School").
- **Medium:** your first three items due today, each with a round check in your color, and the next handoff.
- **Large:** up to seven items, the next handoff with its place.
- **Lock Screen** (rectangular and inline): the next handoff or your next item, and a count. Text is minimal and marked privacy-sensitive. With **Show on Lock Screen** off, only the count shows.
- Tapping a check marks the item done the same way the app does (`PATCH …/work-items/:id` to `verified_complete`, with the version the widget showed). The check fills at once; the item leaves only once the server confirms. If the request fails, the item comes back unticked with a short line ("Couldn’t confirm that. Open FamilyOS to check."), and nothing claims it was done.
- Tapping a title opens the item in the app; tapping anywhere else opens Home.
- A snapshot from another day is never shown as today's: the widget says "Open FamilyOS to see today" until the app (or, later, the widget API below) refreshes it.

## How it works

1. After sign-in, whenever the app comes to the front or goes to the background, and when a screen calls `requestWidgetRefresh()`, `native/WidgetSync.tsx` fetches `GET /households/:id/rhythm`, builds a compact snapshot (`native/widget-snapshot.ts`, tested in `test/mobile-widget-snapshot.test.ts`) and writes it to the App Group, then asks WidgetKit to reload.
2. The widget draws from that snapshot. Every 30 minutes, and after each tap, it also tries `GET /households/:id/widget` (proposed below); until that exists it gets a 404 and keeps the snapshot.
3. To call the API the widget needs a token. It reads the Supabase session from the one keychain item the app saves it in (`familyos.session`, service `familyos`, access group `group.app.familyos.household`). If the access token is within 90 seconds of expiring it refreshes it at Supabase Auth and writes the new session back to the same item. Supabase rotates refresh tokens, so writing back matters: the app reads that item before every refresh of its own, and finds the new token. Both sides keep the copy that's already in storage if the other one refreshed first.

**Still to wire up (screens builder):** mount `<WidgetSync />` once in `app/(app)/_layout.tsx` (inside `CaptureProvider` is fine), call `requestWidgetRefresh()` after completing, moving or rescheduling an item, and add a **Show on Lock Screen** switch in Household settings using `widgetLockScreenVisible()` / `setWidgetLockScreenVisible()` from `native/widget.ts`.

## Threat model, briefly

- **Tokens never leave the phone's keychain group.** Only the FamilyOS app and its widget (same Apple team, same App Group) can read the session item. It is stored "after first unlock, this device only": not in iCloud Keychain, not restored to another phone from a backup. The widget sends the refresh token only to Supabase Auth over HTTPS and the access token only to the FamilyOS API.
- **The App Group holds no secrets:** the API address, the Supabase address and publishable key (both already inside the app), the household and member IDs, and the snapshot.
- **The snapshot is household content** (titles, names, times). It sits in the app's own container, readable after first unlock. Lock Screen widgets show as little as possible, mark it privacy-sensitive (iOS can hide it while the phone is locked), and show only a count when "Show on Lock Screen" is off.
- **Signing out** deletes the keychain item and clears the snapshot; the widget then asks you to sign in. The widget never re-creates a deleted session.
- **Server checks are unchanged:** the widget uses the same endpoints and row-level security as the app, as the signed-in person.

## One-time setup

Steps marked **You** need your own accounts or your face on a phone. Everything else Claude can do in the repository.

**1. Expo account (You).** Create a free account at expo.dev if you don't have one. Then, in `apps/mobile`:
```bash
npx eas-cli login
```
```bash
npx eas-cli init
```
The second command writes the EAS project ID into `app.json` (`extra.eas.projectId`, and `owner`). Commit that change, or tell Claude and it will.

**2. Apple Team ID (You, 1 minute).** On developer.apple.com → Account → Membership details, copy the **Team ID** (10 characters; not secret). Claude adds it to `app.json` as `ios.appleTeamId`, so the widget target is signed by the same team as the app.

**3. EAS environment variables (You, or Claude with your values).** On expo.dev → the project → Environment variables → `production`, add:

| Name | Value | Visibility |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Plain text |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key | Plain text |
| `EXPO_PUBLIC_API_URL` | `https://<app address>/api` (a full URL; the app refuses a relative one) | Plain text |

These are public by design: `EXPO_PUBLIC_*` values are compiled into the app. Never put the Supabase secret key or a database password here. The widget gets the same three values from the app at runtime, so it needs nothing of its own.

**4. First build (You, about 20 minutes, mostly waiting).** In `apps/mobile`:
```bash
npx eas-cli build -p ios --profile production
```
When it asks, sign in with your Apple ID (two-factor code on your phone) and let EAS manage credentials. Say **yes** to each of these:
- Generate a distribution certificate.
- Register the bundle IDs `app.familyos.household` and `app.familyos.household.widget`, with the App Groups capability for `group.app.familyos.household`.
- Create provisioning profiles for both targets.
- Set up Push Notifications (an APNs key). The app asks for permission and registers its token (below); the worker sends through Expo with this key.

The build runs on Expo's Macs. This is the first time the widget's Swift is compiled; if it fails, send Claude the "Run fastlane" or "Xcode build" log from the build page.

**5. App Store Connect record (You, once).** Easiest: let the next step create it (EAS asks for the app name and language). Or by hand: appstoreconnect.apple.com → Apps → + → New App → iOS, name **FamilyOS** (if taken, any name, e.g. "FamilyOS Household"; it's never public), primary language, bundle ID `app.familyos.household`, SKU `familyos`, Full Access.

**6. Submit to TestFlight (You).**
```bash
npx eas-cli submit -p ios --profile production --latest
```
Export compliance is already answered in `app.json` (no non-exempt encryption), so the build goes straight to processing (10–30 minutes, then an email).

**7. Internal testers (You).** In App Store Connect:
1. Users and Access → + → add the other adult with their Apple ID email (role "Developer" or "Marketing" is enough). They accept the email invite.
2. TestFlight → Internal Testing → + → group "Family", add both of you, turn on automatic distribution.
3. Each of you installs **TestFlight** from the App Store and accepts the FamilyOS invite there.

Internal testing needs no Beta App Review. Builds expire after 90 days; a new build replaces the old one automatically.

**Later builds:** `npx eas-cli build -p ios --profile production --auto-submit`. The build number increases on its own (`autoIncrement`, remote version source).

### What Claude can and can't do

| Claude can | Needs you |
|---|---|
| Edit the app, the widget, `app.json`, `eas.json`; add your Team ID and EAS project ID | Expo login, `eas init` |
| Run `expo prebuild` locally and inspect the generated Xcode project (no Mac needed) | Apple ID sign-in and two-factor during `eas build` |
| Typecheck, lint, test; read build logs you paste and fix the code | App Store Connect record, testers, installing TestFlight |
| Implement the widget API endpoint below | Adding the widget on your phone and checking it |

Claude has no Expo or Apple credentials and never asks for them. If you later want builds from CI, create an Expo access token yourself and store it as a GitHub secret.

## Checking the widget on a phone

1. Install from TestFlight, open FamilyOS, sign in. Visit Home once.
2. Long-press the Home Screen → Edit → Add Widget → **FamilyOS** → **Today**. Add a small and a medium one.
3. **Matches the app:** the count equals your open items due today in Tasks; the next handoff matches Today.
4. **Tick from the widget:** tap a round check. It fills at once, then the item disappears. Open the app: it's done, and your partner sees it done.
5. **Failure is honest:** turn on Airplane Mode, tap a check. The item comes back unticked with "Couldn’t confirm that. Open FamilyOS to check." Turn Airplane Mode off; the item is still open in the app.
6. **Someone else changed it:** change an item's title on the web, then (before reopening the app) tap its check in the widget. You see "That changed in FamilyOS. Open it to see." and nothing is marked done.
7. **Lock Screen:** long-press the Lock Screen → Customize → Lock Screen → add FamilyOS (rectangular, and inline above the clock). Lock the phone: depending on iOS settings the text is hidden until Face ID. Turn **Show on Lock Screen** off in the app (once the switch exists): only the count shows.
8. **Token refresh:** leave the app closed for more than an hour, then tick something from the widget. It works, and when you open the app you're still signed in (the widget wrote the rotated refresh token back).
9. **Sign out** in the app: the widget shows "Open FamilyOS to sign in."
10. **Next morning,** before opening the app: the widget says "Open FamilyOS to see today" (until the widget API exists, then it refreshes itself).

## Proposed API: `GET /households/:householdId/widget`

Not implemented yet; the widget already calls it and falls back to the app's snapshot while it answers 404.

- **Auth:** the caller's Supabase access token, like every route; `work_item.read` and `event.read`; household-scoped by row-level security. Answers for the calling member only.
- **Response 200** (`Cache-Control: no-store`), the same shape as `WidgetSnapshot` in `apps/mobile/native/widget-snapshot.ts`:

```json
{
  "householdId": "uuid",
  "memberId": "uuid (the caller)",
  "date": "2026-11-15 (household-local today)",
  "timezone": "America/Los_Angeles",
  "generatedAt": "2026-11-15T18:00:00.000Z",
  "dueTodayCount": 3,
  "items": [
    {
      "id": "uuid",
      "title": "Renew car registration",
      "version": 4,
      "dueAt": "2026-11-15T17:00:00.000Z or null",
      "dueOn": "2026-11-15 or null",
      "ownerMemberId": "uuid",
      "canComplete": true
    }
  ],
  "handoffs": [
    {
      "time": "2026-11-15T23:15:00Z",
      "action": "pick_up",
      "careMemberId": "uuid",
      "byMemberIds": ["uuid"],
      "place": "School"
    }
  ],
  "members": [{ "id": "uuid", "name": "Theo", "color": "#2F6FB3" }]
}
```

- **Rules:** `items` are the caller's open tasks and issues (not new, cancelled or done) due today in the household's time zone, timed first by `dueAt`, then all-day by title, at most 8; `dueTodayCount` counts all of them. `canComplete` is `workItemMachine.canTransition(status, 'verified_complete')`. `handoffs` are today's care handoffs from now on, at most 4. `members` are active members with their stored color, or the app's palette color by position. Simplest implementation: build the rhythm as `/rhythm` does and pass it to `buildWidgetSnapshot` (move that function into `packages/domain` so the API and app share it).
- **Tests:** another household's ID gets 404; a member sees only their own items; private items follow the existing visibility rules; the response contains no other fields.
- **Completion** needs nothing new: `PATCH /households/:id/work-items/:itemId` with `{ "expectedVersion": n, "status": "verified_complete", "confirmed": true }` → 200 `{ item }`, 409 on a stale version.

## Push notifications

`expo-notifications` 58.1.6 is installed and configured (`aps-environment: production`); step 4 creates the APNs key.

**In the app** (`apps/mobile/native/push.ios.ts`, `components/push/`):

- **When it asks:** once per iPhone, after the first sign-in, on Today after a couple of seconds (never at launch): a short sheet says what would be sent (handoff reminders, the morning check-in, the Weekly Reset) and that quiet hours hold. "Turn on notifications" shows iOS's prompt; "Not now" is also final for that sheet. Household → Your settings shows the state ("On for this iPhone", "Off for this iPhone" with **Open Settings**, "Not on yet" with **Turn on**).
- **Token:** `getExpoPushTokenAsync` needs the EAS project ID (`extra.eas.projectId`, written by `eas init`, step 1). Without it the app says notifications are allowed but will start once the build is set up for push, and registers nothing.
- **Registering:** whenever the app starts or comes to the front with permission granted it registers the token (`POST …/me/push-tokens`, idempotent); if permission was turned off in iOS Settings it unregisters (`DELETE`). The token and household are kept in the app's own keychain item (`familyos.push.registration`) so that **signing out** removes the token first (at most 4 seconds, then signs out regardless).
- **Tapping a notification** opens Today, or the Weekly Reset for its reminder. In the foreground a notification shows as a banner; only handoff reminders play a sound.
- **Web:** nothing to turn on; the settings say notifications arrive in the iPhone app and the switches apply there.

**API (the app's side):**

- `POST /households/:id/me/push-tokens` `{ "token": "ExponentPushToken[…]", "platform": "ios" }` → 201 (added) or 200 (already this member's) `{ pushToken: { id, platform, createdAt, lastUsedAt } }`. The token is never echoed, logged or audited. A token is one device, so it belongs to one member at a time: registering one another member of the household had moves it; one held in another household is refused with 409 `token_in_use`. Five devices per member are kept.
- `DELETE /households/:id/me/push-tokens` `{ "token": "…" }` (in the body, never the URL) → 204, on sign-out or when iOS permission is turned off.
- `GET/PATCH /households/:id/me/state` carries the switches (`notifications.morningCheckin`, `handoffReminders`, `partnerChanges`, `weeklyResetReminder`), `quietHours`, `morningTime` (default `07:30`), `weeklyReset` `{ weekday: 1–7 (ISO, 7 = Sunday), time }` (default Sunday 19:00) and `hideDetails` (default off). Partner changes are off unless the member turns them on.

**What is sent** (worker task `send_notifications`, every 5 minutes, household timezone; rules in `packages/domain/src/notifications.ts`). None exists to drive engagement; each is about something real for that member:

| Kind | When | Text (with details) |
| --- | --- | --- |
| Morning check-in | the member's morning time; skipped when nothing concerns them (dinner alone doesn't, unless they cook) | "Today: drop-off 8:15 AM (you), 2 things due, dinner: salmon (Theo)" |
| Handoff reminder | 30 minutes before a care handoff they cover (covers and skips applied) | "June's drop-off at 8:15 AM" / "In 30 minutes, at Little Oaks." |
| Partner changes | at most hourly: took something off your plate, completed something of yours, covered your handoff, settled a decision you voted on | "From Theo" / "Took “Car registration” off your plate." |
| Weekly Reset reminder | the chosen weekday and time, only while that week's plan isn't committed (adults) | "The week of Mon, Nov 23 doesn't have a plan yet. Ready when you are." |

- **Quiet hours** are always respected. The check-in, the Weekly Reset reminder and partner changes wait until quiet hours end (the check-in only the same day). A handoff reminder is never deferred, because after the handoff it is useless: it goes only while the member is outside quiet hours and the handoff is still ahead (quiet hours ending 07:00 before a 07:15 drop-off still give a reminder at 07:00).
- **Hide details on lock screen** is on by default (push text passes through Expo and Apple) and sends generic text ("Your morning check-in is ready", "You have a handoff in 30 minutes", "There are changes that affect you").
- A private item's title is never sent to someone who can't see it.
- **Never twice:** each notification has a key in `notification_log`, written before sending. Delivery is at most once: a failed send is recorded, not retried. One due more than two hours ago (the worker was down) is dropped. Push receipts aren't checked yet; a `DeviceNotRegistered` ticket deletes the token.
- **Least privilege:** the worker sends as `familyos_notifier`, one household per transaction, with only tokens, preferences, the log, care events (no titles, notes or other events), task fields, tonight's dinner, settled decisions and votes, whether the week is planned, and audit IDs.

**Worker configuration:** `EXPO_ACCESS_TOKEN`, required in production (turn on push security in the Expo project). Without it the production worker sends no notifications and logs an error each run. It is a secret (worker environment only, never `EXPO_PUBLIC_*`).

## Risks and known gaps

- **Untested Swift.** It follows Apple's documented APIs (WidgetKit `TimelineProvider`, `AppIntent`, `Button(intent:)`, `containerBackground`, `invalidatableContent`) and passes a syntax parse, but it's first type-checked in the EAS build. Expect possibly one round of small fixes.
- **`@bacons/apple-targets` 5.0.0** declares SDK 55's prebuild config; `pnpm-workspace.yaml` overrides it to SDK 58's (same API, checked). It is a community plugin by an Expo team member, the usual choice for widgets in Expo projects.
- **Extension build number:** the plugin sets the widget's build number from `ios.buildNumber` (1 when unset), while EAS increments the app's remotely. If App Store Connect warns that they differ (ITMS-90473, a warning, not a rejection), Claude can make the two match.
- **App version** is `0.0.0` in `app.json`. If App Store Connect refuses it, set `version` to `1.0.0`.
- **Sign-in once more on iPhone:** the iOS session moved to a new shared keychain item. No iPhone build existed before, so nobody is affected.
- **Data freshness:** until `GET …/widget` exists, the widget only learns about changes made elsewhere (your partner, the web) when the app runs on your phone.
