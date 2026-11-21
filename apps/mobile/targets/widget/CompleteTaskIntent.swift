import AppIntents
import WidgetKit

/// Runs when the round check next to an item is tapped (Button(intent:), iOS 17). It runs in the
/// widget extension; the app doesn't open. When perform() returns, WidgetKit reloads the
/// timeline, which reads the snapshot updated here.
struct CompleteTaskIntent: AppIntent {
  static var title: LocalizedStringResource { "Mark done" }
  static var description: IntentDescription { "Marks a FamilyOS item done." }
  /// Only for the widget's buttons; not offered in Shortcuts or Siri.
  static var isDiscoverable: Bool { false }

  @Parameter(title: "Item")
  var itemId: String

  @Parameter(title: "Version")
  var version: Int

  init() {}

  init(itemId: String, version: Int) {
    self.itemId = itemId
    self.version = version
  }

  func perform() async throws -> some IntentResult {
    await Completion.complete(itemId: itemId, version: version)
    return .result()
  }
}

enum Completion {
  /// Shows the item ticked at once, asks the API, then keeps the result honest: the item leaves
  /// only after the server confirms; otherwise it comes back unticked with a short line saying so.
  static func complete(itemId: String, version: Int) async {
    WidgetStore.markPending(itemId)
    WidgetCenter.shared.reloadTimelines(ofKind: Shared.widgetKind)
    defer { WidgetStore.clearPending(itemId) }

    guard let config = WidgetStore.config() else {
      WidgetStore.setNotice("Open FamilyOS to sign in.")
      return
    }
    do {
      try await FamilyOSAPI.complete(itemId: itemId, version: version, config: config)
      WidgetStore.removeItem(itemId)
      WidgetStore.clearNotice()
    } catch WidgetFailure.conflict {
      // Someone changed it since this snapshot, perhaps already finished it. Show what's true.
      WidgetStore.setNotice("That changed in FamilyOS. Open it to see.")
      await Refresh.snapshotIfPossible()
    } catch WidgetFailure.signedOut {
      WidgetStore.setNotice("Open FamilyOS to sign in again.")
    } catch {
      // The request may or may not have reached the server, so claim neither.
      WidgetStore.setNotice("Couldn’t confirm that. Open FamilyOS to check.")
    }
  }
}

enum Refresh {
  /// Replaces the cached snapshot with the API's, when the API can give one. Any failure keeps
  /// the cached snapshot, which the app refreshes whenever it runs.
  static func snapshotIfPossible() async {
    guard let config = WidgetStore.config() else { return }
    if let fresh = try? await FamilyOSAPI.fetchSnapshot(config: config) {
      WidgetStore.save(fresh)
    }
  }
}
