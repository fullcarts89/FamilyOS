import SwiftUI
import UIKit

/// The app's Family Rhythm tokens (apps/mobile/design/tokens.ts), with warm dark variants.
/// Widgets use the system font; member colors mark ownership, one ink for everything else.
enum Theme {
  static let ground = Color.dynamic(light: 0xF7F5F0, dark: 0x1B201D)
  static let ink = Color.dynamic(light: 0x17201B, dark: 0xF2EFE8)
  static let muted = Color.dynamic(light: 0x676E68, dark: 0xA9AEA8)
  /// A neutral color for gallery sample rows.
  static let sample = Color(rgb: 0x5E8A4E)
}

extension Color {
  init(rgb: UInt32) {
    self.init(
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255)
  }

  /// "#RRGGBB" → Color; nil for anything else.
  init?(hex: String) {
    let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
    self.init(rgb: value)
  }

  static func dynamic(light: UInt32, dark: UInt32) -> Color {
    Color(
      uiColor: UIColor { traits in
        UIColor(Color(rgb: traits.userInterfaceStyle == .dark ? dark : light))
      })
  }
}
