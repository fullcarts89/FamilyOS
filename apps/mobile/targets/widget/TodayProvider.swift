import SwiftUI
import WidgetKit

/// What one widget render shows, derived from the cached snapshot at the entry's date.
enum TodayContent {
  /// No configuration or session: the app hasn't been signed in on this phone.
  case signedOut
  /// The snapshot is from another day; showing it as today's would be false.
  case outdated
  case ready(TodayModel)
}

struct TodayModel {
  let items: [TodayItem]
  /// My open items due today, not counting ones being marked done.
  let dueTodayCount: Int
  let nextHandoff: HandoffLine?
  let showOnLockScreen: Bool
  let notice: String?
}

struct TodayItem: Identifiable {
  let id: String
  let title: String
  let version: Int
  let color: Color
  /// "3:15 PM" for timed items; nil for all-day ones.
  let time: String?
  let canComplete: Bool
  /// Being marked done right now.
  let pending: Bool
}

struct HandoffLine {
  let time: String
  /// "Pick up June" / "Drop off Biscuit".
  let what: String
  /// "You", "Theo", "You & Theo" or "Nobody yet".
  let who: String
  let place: String?
  let at: Date
}

struct TodayEntry: TimelineEntry {
  let date: Date
  let content: TodayContent
}

extension TodayEntry {
  /// The entry for `date` from what's cached in the App Group.
  static func current(at date: Date) -> TodayEntry {
    guard WidgetStore.config() != nil, SharedKeychain.hasSession() != false,
      let snapshot = WidgetStore.snapshot()
    else {
      return TodayEntry(date: date, content: .signedOut)
    }
    return TodayEntry(date: date, content: content(snapshot, at: date))
  }

  static func content(_ snapshot: WidgetSnapshot, at date: Date) -> TodayContent {
    let zone = TimeZone(identifier: snapshot.timezone) ?? .current
    guard ISODate.localDay(date, in: zone) == snapshot.date else { return .outdated }

    let clock = DateFormatter()
    clock.timeZone = zone
    clock.locale = .current
    clock.setLocalizedDateFormatFromTemplate("jmm")

    let pending = WidgetStore.pendingIds(now: date)
    let colors = Dictionary(
      snapshot.members.map { ($0.id, Color(hex: $0.color) ?? Theme.ink) },
      uniquingKeysWith: { first, _ in first })
    let names = Dictionary(
      snapshot.members.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })

    let items = snapshot.items.map { item -> TodayItem in
      TodayItem(
        id: item.id,
        title: item.title,
        version: item.version,
        color: item.ownerMemberId.flatMap { colors[$0] } ?? Theme.ink,
        time: item.dueAt.flatMap(ISODate.parse).map { clock.string(from: $0) },
        canComplete: item.canComplete,
        pending: pending.contains(item.id))
    }
    let pendingShown = items.filter(\.pending).count

    let next = snapshot.handoffs
      .compactMap { h -> (WidgetHandoff, Date)? in ISODate.parse(h.time).map { (h, $0) } }
      .filter { $0.1 >= date }
      .min { $0.1 < $1.1 }
    let handoff = next.map { pair -> HandoffLine in
      let (h, at) = pair
      let child = names[h.careMemberId] ?? "someone"
      let what = h.action == "pick_up" ? "Pick up \(child)" : "Drop off \(child)"
      let who: String
      if h.byMemberIds.isEmpty {
        who = "Nobody yet"
      } else {
        let mine = h.byMemberIds.contains(snapshot.memberId)
        let others = h.byMemberIds.filter { $0 != snapshot.memberId }.compactMap { names[$0] }
        who = ((mine ? ["You"] : []) + others).joined(separator: " & ")
      }
      return HandoffLine(
        time: clock.string(from: at), what: what, who: who.isEmpty ? "Someone" : who,
        place: h.place, at: at)
    }

    return .ready(
      TodayModel(
        items: items,
        dueTodayCount: max(0, snapshot.dueTodayCount - pendingShown),
        nextHandoff: handoff,
        showOnLockScreen: WidgetStore.showsOnLockScreen(),
        notice: WidgetStore.notice(now: date)?.text))
  }

  /// Entries for the rest of today: now, just after each upcoming handoff (so "next" moves on),
  /// and midnight (so yesterday's list never shows as today's).
  static func timeline(from now: Date) -> Timeline<TodayEntry> {
    var dates = [now]
    if let snapshot = WidgetStore.snapshot() {
      let zone = TimeZone(identifier: snapshot.timezone) ?? .current
      let handoffTimes = snapshot.handoffs.compactMap { ISODate.parse($0.time) }
        .map { $0.addingTimeInterval(60) }
        .filter { $0 > now }
      dates += handoffTimes.sorted().prefix(4)
      if let midnight = ISODate.nextMidnight(after: now, in: zone) { dates.append(midnight) }
    }
    let entries = dates.sorted().map { current(at: $0) }
    // Ask again in 30 minutes; the app also reloads the widget whenever its data changes.
    return Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60)))
  }

  /// For the widget gallery and placeholders when nothing is cached: clearly sample content.
  static let sample = TodayEntry(
    date: Date(),
    content: .ready(
      TodayModel(
        items: [
          TodayItem(
            id: "sample-1", title: "Renew car registration", version: 1, color: Theme.sample,
            time: nil, canComplete: true, pending: false),
          TodayItem(
            id: "sample-2", title: "Flea meds for Biscuit", version: 1, color: Theme.sample,
            time: "6:00 PM", canComplete: true, pending: false),
        ],
        dueTodayCount: 2,
        nextHandoff: HandoffLine(
          time: "3:15 PM", what: "Pick up June", who: "You", place: "School", at: Date()),
        showOnLockScreen: true,
        notice: nil)))
}

struct TodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry.sample
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    let entry = TodayEntry.current(at: Date())
    if context.isPreview, case .ready = entry.content {
      completion(entry)
    } else if context.isPreview {
      completion(TodayEntry.sample)
    } else {
      completion(entry)
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    Task {
      // While a tap is being confirmed, show the cache only, so a fetch that started before the
      // change can't briefly undo it.
      if WidgetStore.pendingIds().isEmpty {
        await Refresh.snapshotIfPossible()
      }
      completion(TodayEntry.timeline(from: Date()))
    }
  }
}
