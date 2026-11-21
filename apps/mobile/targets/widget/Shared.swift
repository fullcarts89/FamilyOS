import Foundation

/// Names the app and the widget agree on. The JavaScript side is apps/mobile/native/shared.ts;
/// change both together.
enum Shared {
  /// The App Group: a shared UserDefaults suite, and (on iOS) also a keychain access group.
  static let appGroup = "group.app.familyos.household"
  static let widgetKind = "FamilyOSToday"

  // UserDefaults keys in the App Group suite.
  static let configKey = "familyos.widget.config"
  static let snapshotKey = "familyos.widget.snapshot"
  static let lockScreenKey = "familyos.widget.lockScreen"
  static let pendingKey = "familyos.widget.pending"
  static let noticeKey = "familyos.widget.notice"

  // The Supabase session, written by expo-secure-store with
  // { keychainService: "familyos", accessGroup: appGroup }. expo-secure-store appends ":no-auth"
  // to the service for items saved without biometric protection.
  static let keychainService = "familyos:no-auth"
  static let sessionKey = "familyos.session"
}

/// Written by the app (apps/mobile/native/widget.ts) whenever the signed-in household is known.
/// Nothing in here is secret: the publishable key ships inside the app anyway.
struct WidgetConfig: Codable {
  let apiUrl: String
  let supabaseUrl: String
  let supabasePublishableKey: String
  let householdId: String
  let memberId: String
}

/// The compact snapshot the widget shows. Same shape as GET /households/:id/widget.
struct WidgetSnapshot: Codable {
  let householdId: String
  let memberId: String
  /// The household's local date the snapshot is for (YYYY-MM-DD).
  let date: String
  /// IANA time zone of the household.
  let timezone: String
  let generatedAt: String
  /// My open items due today, including any beyond the ones listed.
  var dueTodayCount: Int
  /// Up to 8 of them, timed ones first.
  var items: [WidgetItem]
  /// Today's handoffs from now on, earliest first (at most 4).
  let handoffs: [WidgetHandoff]
  let members: [WidgetMember]
}

struct WidgetItem: Codable, Identifiable {
  let id: String
  let title: String
  let version: Int
  let dueAt: String?
  let dueOn: String?
  let ownerMemberId: String?
  /// False for things that can't be ticked off yet (waiting on someone, booked, stuck).
  let canComplete: Bool
}

struct WidgetHandoff: Codable {
  let time: String
  /// "drop_off" or "pick_up".
  let action: String
  let careMemberId: String
  let byMemberIds: [String]
  let place: String?
}

struct WidgetMember: Codable {
  let id: String
  let name: String
  /// #RRGGBB
  let color: String
}

/// A short line shown after a tap that didn't go through. It never claims success.
struct WidgetNotice {
  let text: String
  let at: Date
}

/// The App Group's UserDefaults. Values are JSON strings so the app's ExtensionStorage can read
/// and write the same keys.
enum WidgetStore {
  private static var defaults: UserDefaults? { UserDefaults(suiteName: Shared.appGroup) }

  private static func decode<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
    guard let text = defaults?.string(forKey: key), let data = text.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(type, from: data)
  }

  static func config() -> WidgetConfig? { decode(WidgetConfig.self, Shared.configKey) }

  static func snapshot() -> WidgetSnapshot? { decode(WidgetSnapshot.self, Shared.snapshotKey) }

  static func save(_ snapshot: WidgetSnapshot) {
    guard let data = try? JSONEncoder().encode(snapshot),
      let text = String(data: data, encoding: .utf8)
    else { return }
    defaults?.set(text, forKey: Shared.snapshotKey)
  }

  /// The person can hide household content from the Lock Screen in the app. On unless turned off.
  static func showsOnLockScreen() -> Bool {
    defaults?.string(forKey: Shared.lockScreenKey) != "off"
  }

  /// Takes a finished item out of the cached snapshot. Re-reads first so a snapshot the app
  /// wrote in the meantime isn't lost.
  static func removeItem(_ itemId: String) {
    guard var current = snapshot(), current.items.contains(where: { $0.id == itemId }) else {
      return
    }
    current.items.removeAll { $0.id == itemId }
    current.dueTodayCount = max(0, current.dueTodayCount - 1)
    save(current)
  }

  // Items being marked done right now: shown ticked until the API answers. Entries older than a
  // minute are ignored, so an interrupted request can't leave something looking done.
  private static let pendingLifetime: TimeInterval = 60

  static func pendingIds(now: Date = Date()) -> Set<String> {
    let all = defaults?.dictionary(forKey: Shared.pendingKey) as? [String: Double] ?? [:]
    let fresh = all.filter { now.timeIntervalSince1970 - $0.value < pendingLifetime }
    return Set(fresh.keys)
  }

  static func markPending(_ itemId: String) {
    var all = defaults?.dictionary(forKey: Shared.pendingKey) as? [String: Double] ?? [:]
    all[itemId] = Date().timeIntervalSince1970
    defaults?.set(all, forKey: Shared.pendingKey)
  }

  static func clearPending(_ itemId: String) {
    var all = defaults?.dictionary(forKey: Shared.pendingKey) as? [String: Double] ?? [:]
    all.removeValue(forKey: itemId)
    defaults?.set(all, forKey: Shared.pendingKey)
  }

  private static let noticeLifetime: TimeInterval = 15 * 60

  static func notice(now: Date = Date()) -> WidgetNotice? {
    guard let raw = defaults?.dictionary(forKey: Shared.noticeKey),
      let text = raw["text"] as? String,
      let at = raw["at"] as? Double
    else { return nil }
    let date = Date(timeIntervalSince1970: at)
    return now.timeIntervalSince(date) < noticeLifetime ? WidgetNotice(text: text, at: date) : nil
  }

  static func setNotice(_ text: String) {
    defaults?.set(["text": text, "at": Date().timeIntervalSince1970], forKey: Shared.noticeKey)
  }

  static func clearNotice() {
    defaults?.removeObject(forKey: Shared.noticeKey)
  }
}

enum ISODate {
  // Made per call: cheap at widget scale, and nothing shared between threads.
  private static func formatter(fractional: Bool) -> ISO8601DateFormatter {
    let f = ISO8601DateFormatter()
    f.formatOptions =
      fractional ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
    return f
  }

  static func parse(_ text: String) -> Date? {
    formatter(fractional: true).date(from: text) ?? formatter(fractional: false).date(from: text)
  }

  /// The local calendar date (YYYY-MM-DD) of an instant in a time zone.
  static func localDay(_ date: Date, in timeZone: TimeZone) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04ld-%02ld-%02ld", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  /// The next local midnight after an instant.
  static func nextMidnight(after date: Date, in timeZone: TimeZone) -> Date? {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    return calendar.nextDate(
      after: date, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime)
  }
}
