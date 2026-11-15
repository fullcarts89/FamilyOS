import Foundation

/// The two FamilyOS API calls the widget makes, with the signed-in person's own token. Row-level
/// security on the server limits both to their household, exactly as in the app.
enum FamilyOSAPI {
  /// GET /households/:id/widget: the same snapshot the app writes. Until the API serves it
  /// (it answers 404), the widget keeps the app's cached snapshot.
  static func fetchSnapshot(config: WidgetConfig) async throws -> WidgetSnapshot {
    let (data, status) = try await send(
      config: config, method: "GET", path: "/households/\(config.householdId)/widget", body: nil)
    guard status == 200 else { throw WidgetFailure.http(status) }
    guard let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
      snapshot.householdId == config.householdId, snapshot.memberId == config.memberId
    else { throw WidgetFailure.http(status) }
    return snapshot
  }

  /// The same change as ticking the round check in the app: PATCH the item to
  /// verified_complete with the version the widget showed.
  static func complete(itemId: String, version: Int, config: WidgetConfig) async throws {
    let body: [String: Any] = [
      "expectedVersion": version,
      "status": "verified_complete",
      "confirmed": true,
    ]
    let (_, status) = try await send(
      config: config, method: "PATCH",
      path: "/households/\(config.householdId)/work-items/\(itemId)",
      body: try JSONSerialization.data(withJSONObject: body))
    switch status {
    case 200: return
    case 409: throw WidgetFailure.conflict
    case 401: throw WidgetFailure.signedOut
    default: throw WidgetFailure.http(status)
    }
  }

  /// Sends one request; on 401 refreshes the session once and tries again (an unauthenticated
  /// request changed nothing, so the retry is safe).
  private static func send(config: WidgetConfig, method: String, path: String, body: Data?)
    async throws -> (Data, Int)
  {
    guard let url = URL(string: config.apiUrl + path) else { throw WidgetFailure.notConfigured }

    func attempt(_ token: String) async throws -> (Data, Int) {
      var request = URLRequest(url: url, timeoutInterval: 15)
      request.httpMethod = method
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      if let body {
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
      }
      do {
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
      } catch {
        throw WidgetFailure.network
      }
    }

    let token = try await SessionManager.shared.accessToken(config: config)
    let first = try await attempt(token)
    guard first.1 == 401 else { return first }
    let renewed = try await SessionManager.shared.accessToken(config: config, forceRefresh: true)
    return try await attempt(renewed)
  }
}
