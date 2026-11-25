import SwiftUI

/// Exact 26 x 26 FamilyOS household mark from apps/mobile/design/Mark.tsx.
/// Fixed brand colors here; member-specific colors remain reserved for task ownership.
struct FamilyOSBrandMark: View {
  var size: CGFloat = 20

  private let coral = Color(red: 210/255, green: 85/255, blue: 63/255)
  private let marigold = Color(red: 217/255, green: 154/255, blue: 28/255)
  private let blue = Color(red: 47/255, green: 111/255, blue: 179/255)

  var body: some View {
    GeometryReader { proxy in
      let scale = min(proxy.size.width, proxy.size.height) / 26
      ZStack(alignment: .topLeading) {
        Capsule().fill(coral)
          .frame(width: 15*scale, height: 4.5*scale)
          .offset(x: 2*scale, y: 4*scale)
        Capsule().fill(marigold)
          .frame(width: 18*scale, height: 4.5*scale)
          .offset(x: 6*scale, y: 10.75*scale)
        Capsule().fill(blue)
          .frame(width: 12*scale, height: 4.5*scale)
          .offset(x: 2*scale, y: 17.5*scale)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}
