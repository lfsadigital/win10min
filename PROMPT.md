# Task: Redesign the Empire Map

## Goal

Transform the Empire Map tab from a modern MapKit-based view into an **ancient Roman strategy-game style map** that feels like it's from 2,000 years ago.

The current map (`EmpireMapView.swift`, `RomanMapView.swift`) uses Apple MapKit with real coordinates. It looks like a modern navigation app. We want it to feel like a **Civilization or Total War campaign map** — something a Roman general might have used to plan conquests.

## The Vibe

- **Isometric or tilted perspective** — gives a 3D strategy-game feel
- **Parchment/aged paper aesthetic** — warm, ancient texture
- **Decorative elements**: compass rose, gold/bronze borders, historical Roman ships in the sea
- **Fog of war** — unconquered regions should feel mysterious/obscured
- **Latin region names** — ROMA, GALLIA, BRITANNIA, etc.
- **No fantasy elements** — ships and decorations should be historically plausible

## Hard Constraints (Do Not Break These)

### 1. Use the existing design system
All colors, fonts, and components must come from `RomanTheme.swift`:
- Primary: `romanGold` (#C9A44C), `darkStone` (#0D0D0D), `marbleBlack` (#1A1A1A)
- Accent: `parchment` (#F3E5C3), `bronzeLight`, `bronzeDark`
- Fonts: Baskerville for headers, Baskerville-Italic for inscriptions
- Reuse existing components like `RomanCard`, `RomanSectionHeader` where appropriate

### 2. Keep all 13 regions exactly as defined
The regions in `EmpireManager.swift` must not change:
- Roma, Italia, Gaul, Hispania, Britannia, Egypt, Germania, Greece, Mesopotamia, Dacia, Carthago, Syria, Persia
- Each region has: `.color`, `.mapPosition`, `.requiredCoins`, `.conquestBonus`, `.requiresPremium`
- Use these existing properties — don't hardcode new values

### 3. Preserve existing functionality
- Tapping a region should still show region info (conquest progress, coins needed, etc.)
- Conquered vs unconquered states must be visually distinct
- Premium regions (Greece, Mesopotamia, Dacia, Carthago, Syria, Persia) should indicate they require premium
- The `EmpireManager` class and its logic should not be modified

### 4. Files to modify
Focus changes on the view layer:
- `EmpireMapView.swift` — main container, can be heavily modified or replaced
- `RomanMapView.swift` — the MapKit view, can be replaced entirely
- Create new files if needed (e.g., `IsometricEmpireMapView.swift`)
- Do NOT modify: `EmpireManager.swift`, `CityManager.swift`, other managers

## Creative Freedom (Your Choice)

These are suggestions, not requirements. Use your judgment:

- **Interaction model**: Fixed camera vs. subtle pan/zoom? Tap to tilt? Your call.
- **3D approach**: SwiftUI transforms, layered parallax, or something else? Whatever works.
- **Decorative elements**: Compass rose placement, ship positions, border style — be creative.
- **Animation**: Subtle idle animations (flags, ships)? Conquest celebration effects? Optional.
- **Performance**: If isometric view is heavy, it's fine to start flat and transition on tap.
- **Asset creation**: You can use SF Symbols, create SwiftUI shapes, or suggest placeholder images.

## Suggestions to Consider

1. **Layered depth**: Background (sea/parchment) → Land masses → Region overlays → Labels → UI elements

2. **Region shapes**: Could be simple circles/ovals positioned on the map, or actual territory polygons. Simpler is fine if it looks good.

3. **Fog of war ideas**:
   - Blur/desaturate unconquered regions
   - Add a "cloud" or "mist" overlay
   - Show only silhouettes until conquered

4. **Next conquest highlight**: Make the next conquerable region glow or pulse subtly to guide the user.

5. **Latin names mapping**:
   - Roma → ROMA
   - Gaul → GALLIA
   - Hispania → HISPANIA
   - Britannia → BRITANNIA
   - Egypt → AEGYPTUS
   - Germania → GERMANIA
   - Greece → GRAECIA
   - Mesopotamia → MESOPOTAMIA
   - Dacia → DACIA
   - Carthago → CARTHAGO
   - Syria → SYRIA
   - Persia → PERSIA

6. **Sound/haptics**: Optional tap feedback when selecting regions.

## Definition of Done

The task is complete when:
- [ ] The map no longer uses MapKit
- [ ] The map has an ancient/strategy-game aesthetic (not modern)
- [ ] All 13 regions are visible and tappable
- [ ] Conquered regions look different from unconquered (fog of war)
- [ ] Region info is accessible (tap to see details)
- [ ] The design follows RomanTheme colors and fonts
- [ ] The app builds and runs without crashes

When all criteria are met, output:
<promise>COMPLETE</promise>

## Reference Files

Read these to understand the current implementation and design system:
- `PandaApp/PandaApp/PandaApp/RomanTheme.swift` — design system
- `PandaApp/PandaApp/PandaApp/Models/EmpireManager.swift` — region definitions
- `PandaApp/PandaApp/Views/EmpireMapView.swift` — current map container
- `PandaApp/PandaApp/Views/RomanMapView.swift` — current MapKit implementation
- `PandaApp/PandaApp/Views/CityView.swift` — parent tab container
