import Foundation
import Security

enum WidgetFailure: Error {
  /// The app hasn't shared its configuration yet (never opened, or signed out).
  case notConfigured
  /// No session in the shared keychain, or Supabase refused the refresh token.
  case signedOut
  /// The item changed since the snapshot (expectedVersion mismatch).
  case conflict
  case http(Int)
  case network
  case keychain(OSStatus)
}

/// The one keychain item the app and the widget share: the Supabase session JSON that
/// supabase-js saves through apps/mobile/lib/session-storage.ts. The query mirrors
/// expo-secure-store's (service, account and generic attribute; the key is stored as Data).
enum SharedKeychain {
  private static var query: [String: Any] {
    let key = Data(Shared.sessionKey.utf8)
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Shared.keychainService,
      kSecAttrGeneric as String: key,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: Shared.appGroup,
    ]
  }

  static func read() throws -> Data? {
    var search = query
    search[kSecMatchLimit as String] = kSecMatchLimitOne
    search[kSecReturnData as String] = true
    var item: CFTypeRef?
    let status = SecItemCopyMatching(search as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw WidgetFailure.keychain(status) }
    return item as? Data
  }

  /// False only when the item is certainly gone (signed out); nil when the keychain can't say,
  /// e.g. before the first unlock after a restart.
  static func hasSession() -> Bool? {
    do {
      return try read() != nil
    } catch {
      return nil
    }
  }

  /// Replaces the session in place, keeping the item's accessibility. Never creates the item:
  /// if the app signed out in the meantime, the widget must not bring the session back.
  @discardableResult
  static func update(_ data: Data) throws -> Bool {
    let status = SecItemUpdate(
      query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound { return false }
    guard status == errSecSuccess else { throw WidgetFailure.keychain(status) }
    return true
  }
}

/// The parts of a stored Supabase session the widget needs. `raw` keeps every other field
/// (the user object and so on) so a refreshed session is written back in the shape supabase-js
/// expects.
struct StoredSession {
  let raw: [String: Any]
  let accessToken: String
  let refreshToken: String
  /// Seconds since 1970.
  let expiresAt: Double

  init?(raw: [String: Any]) {
    guard let access = raw["access_token"] as? String,
      let refresh = raw["refresh_token"] as? String,
      let expires = (raw["expires_at"] as? NSNumber)?.doubleValue
    else { return nil }
    self.raw = raw
    accessToken = access
    refreshToken = refresh
    expiresAt = expires
  }

  /// Usable for a request that starts now (90 s margin, like supabase-js).
  var isFresh: Bool { expiresAt - Date().timeIntervalSince1970 > 90 }

  static func load() throws -> StoredSession? {
    guard let data = try SharedKeychain.read(),
      let object = try? JSONSerialization.jsonObject(with: data),
      let raw = object as? [String: Any]
    else { return nil }
    return StoredSession(raw: raw)
  }
}

/// Hands out a valid access token, refreshing through Supabase Auth when needed. Supabase
/// rotates refresh tokens, so the refreshed session is written back to the shared item the app
/// reads. One refresh at a time inside the widget process.
actor SessionManager {
  static let shared = SessionManager()

  private var refreshing: Task<String, Error>?

  func accessToken(config: WidgetConfig, forceRefresh: Bool = false) async throws -> String {
    if let refreshing { return try await refreshing.value }
    guard let session = try StoredSession.load() else { throw WidgetFailure.signedOut }
    if !forceRefresh && session.isFresh { return session.accessToken }

    let refreshToken = session.refreshToken
    let task = Task { try await Self.refresh(refreshToken, config: config) }
    refreshing = task
    defer { refreshing = nil }
    return try await task.value
  }

  private static func refresh(_ refreshToken: String, config: WidgetConfig) async throws
    -> String
  {
    guard let url = URL(string: "\(config.supabaseUrl)/auth/v1/token?grant_type=refresh_token")
    else { throw WidgetFailure.notConfigured }
    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(config.supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "refresh_token": refreshToken
    ])

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw WidgetFailure.network
    }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0

    guard status == 200,
      let object = try? JSONSerialization.jsonObject(with: data),
      var fresh = object as? [String: Any],
      let access = fresh["access_token"] as? String,
      fresh["refresh_token"] is String
    else {
      // The app may have rotated the session while this request was out; its copy wins.
      if let stored = try StoredSession.load(),
        stored.refreshToken != refreshToken, stored.isFresh
      {
        return stored.accessToken
      }
      throw (status == 400 || status == 401) ? WidgetFailure.signedOut : WidgetFailure.http(status)
    }
    if fresh["expires_at"] == nil, let expiresIn = (fresh["expires_in"] as? NSNumber)?.doubleValue
    {
      fresh["expires_at"] = Int(Date().timeIntervalSince1970 + expiresIn)
    }

    // Commit guard, as in supabase-js: write back only if the stored session is still the one we
    // refreshed. If the app signed out or rotated meanwhile, leave storage alone and use the
    // new access token for this one request.
    guard let current = try StoredSession.load(), current.refreshToken == refreshToken
    else { return access }
    try SharedKeychain.update(JSONSerialization.data(withJSONObject: fresh))
    return access
  }
}
