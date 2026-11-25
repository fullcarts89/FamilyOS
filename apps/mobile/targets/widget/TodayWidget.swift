import AppIntents
import SwiftUI
import WidgetKit

@main
struct FamilyOSWidgetBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
  }
}

/// "Today": what's mine today and the next handoff, on the Home Screen and the Lock Screen.
/// It shows what's relevant and lets things be ticked off; it never scores or nudges.
struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Shared.widgetKind, provider: TodayProvider()) { entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("What’s yours today and the next handoff. Tick things off without opening the app.")
    .supportedFamilies([
      .systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline,
    ])
  }
}

enum DeepLink {
  static let home = URL(string: "familyos://")!
  static let signIn = URL(string: "familyos://sign-in")!
  static func item(_ id: String) -> URL { URL(string: "familyos://item/\(id)") ?? home }
}

struct TodayWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TodayEntry

  var body: some View {
    content
      .containerBackground(for: .widget) { background }
      .widgetURL(isSignedOut ? DeepLink.signIn : DeepLink.home)
  }

  private var isSignedOut: Bool {
    if case .signedOut = entry.content { return true }
    return false
  }

  private var isAccessory: Bool {
    family == .accessoryRectangular || family == .accessoryInline
      || family == .accessoryCircular
  }

  @ViewBuilder private var background: some View {
    if isAccessory { Color.clear } else { Theme.ground }
  }

  @ViewBuilder private var content: some View {
    switch entry.content {
    case .signedOut:
      MessageView(title: "FamilyOS", text: "Open FamilyOS to sign in.", family: family)
    case .outdated:
      MessageView(title: "Today", text: "Open FamilyOS to see today.", family: family)
    case .ready(let model):
      switch family {
      case .systemMedium:
        ListView(model: model, limit: model.notice == nil ? 3 : 2, showsHandoffBlock: false)
      case .systemLarge:
        ListView(model: model, limit: 7, showsHandoffBlock: true)
      case .accessoryRectangular:
        RectangularView(model: model)
      case .accessoryInline:
        InlineView(model: model)
      default:
        SmallView(model: model)
      }
    }
  }
}

func countLine(_ count: Int) -> String {
  switch count {
  case 0: return "Nothing due for you today"
  case 1: return "1 thing for you today"
  default: return "\(count) things for you today"
  }
}

// MARK: - Home Screen

struct SmallView: View {
  let model: TodayModel

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 5) {
        FamilyOSBrandMark(size: 14)
        Text("Today")
          .font(.caption.weight(.semibold))
          .foregroundStyle(Theme.muted)
      }
      if model.dueTodayCount > 0 {
        Text("\(model.dueTodayCount)")
          .font(.system(size: 38, weight: .bold, design: .rounded))
          .foregroundStyle(Theme.ink)
          .contentTransition(.numericText())
          .invalidatableContent()
        Text(model.dueTodayCount == 1 ? "thing for you" : "things for you")
          .font(.caption)
          .foregroundStyle(Theme.muted)
      } else {
        Text("Nothing due for you today")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(Theme.ink)
          .padding(.top, 2)
      }
      Spacer(minLength: 6)
      if let handoff = model.nextHandoff {
        HandoffBlock(handoff: handoff)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct HandoffBlock: View {
  let handoff: HandoffLine

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text("Next handoff · \(handoff.time)")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(Theme.muted)
      Text(handoff.what)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(Theme.ink)
        .lineLimit(1)
      Text(handoff.place.map { "\(handoff.who) · \($0)" } ?? handoff.who)
        .font(.caption)
        .foregroundStyle(Theme.muted)
        .lineLimit(1)
    }
  }
}

struct ListView: View {
  let model: TodayModel
  let limit: Int
  let showsHandoffBlock: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        HStack(spacing: 6) {
          FamilyOSBrandMark(size: 18)
          Text("Today")
            .font(.headline)
            .foregroundStyle(Theme.ink)
        }
        Text(countLine(model.dueTodayCount))
          .font(.caption)
          .foregroundStyle(Theme.muted)
          .lineLimit(1)
          .invalidatableContent()
        Spacer(minLength: 4)
        if !showsHandoffBlock, let handoff = model.nextHandoff {
          Text("\(handoff.time) · \(handoff.what)")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.ink)
            .lineLimit(1)
        }
      }
      if showsHandoffBlock, let handoff = model.nextHandoff {
        HandoffBlock(handoff: handoff)
          .padding(.bottom, 2)
      }
      ForEach(model.items.prefix(limit)) { item in
        ItemRow(item: item)
      }
      Spacer(minLength: 0)
      if let notice = model.notice {
        Text(notice)
          .font(.caption)
          .foregroundStyle(Theme.muted)
          .lineLimit(1)
      } else if remaining > 0 {
        Text("\(remaining) more in FamilyOS")
          .font(.caption)
          .foregroundStyle(Theme.muted)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  /// Open items due today that aren't listed (the snapshot lists at most 8).
  private var remaining: Int {
    let shownOpen = model.items.prefix(limit).filter { !$0.pending }.count
    return max(0, model.dueTodayCount - shownOpen)
  }
}

struct ItemRow: View {
  let item: TodayItem

  var body: some View {
    HStack(spacing: 8) {
      Bead(item: item)
      Link(destination: DeepLink.item(item.id)) {
        Text(item.title)
          .font(.subheadline)
          .strikethrough(item.pending, color: Theme.muted)
          .foregroundStyle(item.pending ? Theme.muted : Theme.ink)
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if let time = item.time {
        Text(time)
          .font(.caption)
          .foregroundStyle(Theme.muted)
      }
    }
    .invalidatableContent()
  }
}

/// The app's round check: hollow in the owner's color, filled while being marked done, dashed
/// for things that can't be ticked off yet.
struct Bead: View {
  let item: TodayItem

  var body: some View {
    if item.canComplete && !item.pending {
      Button(intent: CompleteTaskIntent(itemId: item.id, version: item.version)) {
        BeadShape(color: item.color, filled: false, dashed: false)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("Mark \(item.title) done"))
    } else {
      BeadShape(color: item.color, filled: item.pending, dashed: !item.canComplete)
        .accessibilityLabel(Text(waitingLabel))
    }
  }
}

extension Bead {
  private var waitingLabel: String {
    item.pending ? "Marking \(item.title) done" : "\(item.title) can’t be ticked off yet"
  }
}

struct BeadShape: View {
  let color: Color
  let filled: Bool
  let dashed: Bool

  var body: some View {
    ZStack {
      if filled {
        Circle().fill(color)
        Image(systemName: "checkmark")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(.white)
      } else {
        Circle().strokeBorder(color, style: StrokeStyle(lineWidth: 2, dash: dashed ? [3, 3] : []))
      }
    }
    .frame(width: 22, height: 22)
    // A comfortable target around the 22 pt bead.
    .frame(width: 30, height: 30)
    .contentShape(Rectangle())
  }
}

// MARK: - Lock Screen

/// Minimal text; household content only when the "show on Lock Screen" setting allows it, and
/// marked privacy-sensitive so the system can redact it while the phone is locked.
struct RectangularView: View {
  let model: TodayModel

  private var nextItem: TodayItem? { model.items.first { !$0.pending } }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !model.showOnLockScreen {
        Text("FamilyOS")
          .font(.headline)
          .widgetAccentable()
        Text(countLine(model.dueTodayCount))
          .font(.caption)
      } else if let handoff = model.nextHandoff {
        Text("\(handoff.time) · \(handoff.what)")
          .font(.headline)
          .widgetAccentable()
          .lineLimit(1)
        Text(handoff.who)
          .font(.caption)
          .lineLimit(1)
        if let item = nextItem {
          Text("Next: \(item.title)")
            .font(.caption)
            .lineLimit(1)
        }
      } else if let item = nextItem {
        Text("Next for you")
          .font(.caption)
          .widgetAccentable()
        Text(item.title)
          .font(.headline)
          .lineLimit(2)
      } else {
        Text("Today")
          .font(.headline)
          .widgetAccentable()
        Text(countLine(model.dueTodayCount))
          .font(.caption)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .privacySensitive()
  }
}

struct InlineView: View {
  let model: TodayModel

  var body: some View {
    Text(line).privacySensitive()
  }

  private var line: String {
    guard model.showOnLockScreen else { return countLine(model.dueTodayCount) }
    if let handoff = model.nextHandoff { return "\(handoff.time) \(handoff.what)" }
    if let item = model.items.first(where: { !$0.pending }) { return "Next: \(item.title)" }
    return countLine(model.dueTodayCount)
  }
}

struct MessageView: View {
  let title: String
  let text: String
  let family: WidgetFamily

  var body: some View {
    if family == .accessoryInline {
      Text(text)
    } else if family == .accessoryRectangular || family == .accessoryCircular {
      VStack(alignment: .leading, spacing: 0) {
        Text(title).font(.headline).widgetAccentable()
        Text(text).font(.caption).lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          FamilyOSBrandMark(size: family == .systemSmall ? 16 : 18)
          Text(title)
            .font(.headline)
            .foregroundStyle(Theme.ink)
        }
        Text(text)
          .font(.subheadline)
          .foregroundStyle(Theme.muted)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}
