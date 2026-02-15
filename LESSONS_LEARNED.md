# LESSONS LEARNED - PandaApp iOS Development

**Purpose:** Document critical architectural decisions, bug root causes, and key learnings from major debugging sessions to prevent future issues and preserve institutional knowledge.

**Date Range:** September 2025 - February 2026
**Project:** Win 10 Minutes (PandaApp) - iOS Focus/Productivity App

---

## Table of Contents

1. [Critical Architecture Decisions](#1-critical-architecture-decisions)
2. [Major Bug Root Causes](#2-major-bug-root-causes)
3. [SwiftUI & Concurrency Patterns](#3-swiftui--concurrency-patterns)
4. [Extension Development Constraints](#4-extension-development-constraints)
5. [State Management Patterns](#5-state-management-patterns)
6. [Key Takeaways](#6-key-takeaways)

---

## 1. Critical Architecture Decisions

### 1.1 Shield Management: Extension-Only Pattern

**Decision:** Only the DeviceActivity extension should manage ManagedSettings shields. Main app NEVER re-applies shields on foreground.

**Why This Matters:**
```
❌ WRONG (Causes re-locking bug):
Main App Foreground → Sync State → Re-apply Shields

✅ CORRECT:
Main App Foreground → Sync UI State Only → Extension Handles Shields
```

**Root Cause of Original Bug:**
When users took breaks in SFS or Block Schedules:
1. App correctly removed shields for break
2. User left app (shields still off - correct)
3. User returned to app → `syncSegmentStateOnForeground()` ran
4. Sync function re-applied shields during break (BUG!)
5. Apps locked while countdown still showed break time

**The Fix:**
- Main app sets state flags (isInBreak, isInManualBreak)
- Main app saves state to App Group storage
- Extension reads state and manages ALL shield transitions
- Main app NEVER touches shields after initial session start

**Files:** `SFSManager.swift` (lines 1342-1347 removed), `BlockScheduleManager.swift` (correct pattern)

---

### 1.2 Darwin Notifications + Polling Hybrid

**Decision:** Use Darwin notifications for instant updates with 30-second polling as fallback.

**Why Hybrid?**
- Darwin notifications: 99% success rate, <100ms latency
- iOS may drop Darwin notifications under load (system limitation)
- 30-second polling catches 100% of missed notifications
- Battery-efficient (66% reduction from 10s → 30s polling)

**Architecture:**
```
Extension Event (Schedule Start/Break End)
    ↓
Post Darwin Notification (instant, best-effort)
    ↓
Main App Receives Notification → Update UI immediately
    ↓
30s Polling Timer (fallback if notification missed)
```

**Implementation Pattern:**
```swift
// Extension (DeviceActivityMonitor):
CFNotificationCenterPostNotification(
    CFNotificationCenterGetDarwinNotifyCenter(),
    CFNotificationName("com.luiz.PandaApp.blockScheduleStarted" as CFString),
    nil, nil, true
)

// Main App (BlockScheduleManager):
NotificationCenter.default.addObserver(
    forName: .blockScheduleStarted,
    object: nil,
    queue: .main
) { [weak self] _ in
    self?.handleBlockScheduleStartedNotification()
}
```

**Files:** `DeviceActivityMonitor.swift`, `DarwinNotificationBridge.swift`, `BlockScheduleManager.swift`

---

### 1.3 @MainActor Isolation for Managers

**Decision:** All ObservableObject managers with @Published properties must be @MainActor.

**Why:**
SwiftUI requires UI state mutations on the main thread. Without @MainActor:
- Property changes may happen off main thread
- SwiftUI views don't update reliably
- Crashes with "UIKit must be used from main thread"

**Critical Pattern for Timers:**
```swift
@MainActor
class SFSManager: ObservableObject {
    @Published var isSessionActive: Bool = false

    // ❌ WRONG - Timer callback is nonisolated:
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
        self.checkSegmentCompletion()  // ERROR: nonisolated context
    }

    // ✅ CORRECT - Wrap in Task { @MainActor in }:
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        Task { @MainActor in
            self?.checkSegmentCompletion()
        }
    }
}
```

**Why Timer Callbacks Need Wrapping:**
- Timer.scheduledTimer closures are Sendable (nonisolated)
- Even in @MainActor class, timer callbacks don't inherit isolation
- Must explicitly transition to MainActor context with Task wrapper

**Files:** `TimerManager.swift`, `SFSManager.swift`, `BlockScheduleManager.swift`

---

## 2. Major Bug Root Causes

### 2.1 Break Freeze at 00:00 (Timer Callback Race)

**Bug:** When SFS/Block Schedule break countdown reached 00:00, timer froze at zero. Worked correctly when returning from background.

**Root Cause:**
```
Timer Callback Flow at Break End (00:00):
1. Timer fires at exact break-end time
2. checkSegmentCompletion() detects Date() >= breakEndTime
3. Calls handleBreakAutoResume()
4. Inside handler:
   - isInManualBreak = false (Published property changed)
   - manualBreakEndTime = nil (Published property changed)
   - Creates NEW segmentCheckTimer
5. Function returns, timer callback exits
6. SwiftUI tries to re-render
7. BUT: New timer hasn't fired yet (fires in 1 second)
8. Countdown bound to Date that just became nil
9. UI computes: max(0, nil.timeIntervalSinceNow) → undefined
10. Falls back to last value: 00:00
11. UI FROZEN at 00:00
```

**Why Foreground Sync Worked:**
- Never relied on timer callback at critical moment
- Recalculated everything fresh from elapsed time
- Created new timer with correct future end time
- Old timer already invalid (backgrounded, not firing)

**The Fix:**
1. Stop old timer BEFORE creating new one
2. Call `objectWillChange.send()` explicitly on MainThread
3. Don't use async Task in timer callback (delays execution)
4. Recalculate timing from scratch, not from stale state

**Files:** `SFSManager.swift` (lines 1145-1214), `BlockScheduleManager.swift` (lines 808-917)

---

### 2.2 Block Schedule UI Flickering

**Bug:** Countdown flickered/reset every 10 seconds during active Block Schedule.

**Root Cause Chain:**
```
1. Polling timer fires every 10s
2. updateActiveSchedule() called
3. Detects active schedule still running
4. Line 197: if !isInBreak { startScheduleCountdownTimer() }
5. ❌ NO NIL CHECK - timer restarts even if already running
6. Old timer invalidated, new timer created
7. Brief gap causes countdown to reset to start value
8. SwiftUI re-renders → user sees flicker
```

**The Fix (3-Part):**
```swift
// Fix 1: Add nil check to prevent unnecessary restarts
if !isInBreak && scheduleCountdownTimer == nil {
    startScheduleCountdownTimer()
}

// Fix 2: Darwin notifications for instant updates (don't wait for polling)
// Extension posts notification immediately when schedule starts

// Fix 3: Reduce polling from 10s → 30s (66% battery improvement)
// Polling is now just fallback, Darwin handles instant updates
```

**Performance Impact:**
- Before: 360 polling checks/hour (every 10s)
- After: 120 polling checks/hour (every 30s)
- Battery drain reduced by 66%

**Files:** `BlockScheduleManager.swift` (line 197, 172), `DeviceActivityMonitor.swift`

---

### 2.3 SFS Scheduled Session Disappears

**Bug:** User schedules SFS for 2:00 PM. At 2:00 PM, apps get blocked (correct) but session disappears from UI. Can't manage or stop the "ghost" session.

**Root Cause Chain:**
```
1. User schedules SFS at 1:00 PM
   → Saved to sfsScheduledSessions.json ✅
   → DeviceActivitySchedule created ✅

2. Extension fires at 2:00 PM (intervalDidStart)
   → Loads from sfsScheduledSessions.json ✅
   → Saves to sfsActiveSession.json (PROMOTION) ✅
   → Removes from sfsScheduledSessions.json ✅
   → Applies shields (BLOCKS APPS) ✅

3. User opens app at 2:05 PM
   → SFSManager loads activeSession from file ✅
   → Sets isSessionActive = true ✅
   → BUT: scheduledSessions property loaded ONCE at init
   → Published property has STALE data
   → Extension removed session from file, app doesn't know
   → ScheduledSFSListView shows nothing ❌
   → Apps ARE blocked but no UI to manage session ❌
```

**Why It Broke:**
```swift
// SFSManager.init() - loads ONCE
self.scheduledSessions = storage.loadScheduledSessions()

// Extension modifies file → @Published property never updates
// No foreground refresh to reload scheduled sessions
```

**The Fix:**
```swift
// Add to RomanTimerView scenePhase observer:
.onChange(of: scenePhase) { newPhase in
    if newPhase == .active {
        // Reload scheduled sessions from storage
        sfsManager.scheduledSessions = sfsManager.storage.loadScheduledSessions()
        // Refresh UI state
        sfsManager.syncSegmentStateOnForeground()
    }
}
```

**Files:** `SFSManager.swift` (init line 210), `ScheduledSFSListView.swift` (lines 48-72), `RomanTimerView.swift` (foreground observer)

---

### 2.4 Extension Memory Crash (12MB Limit)

**Bug:** Shield extension showed default iOS "Restricted" screen instead of custom Roman character.

**Root Cause:**
```
Original Image: RomanCharacter.png (1536×2752 pixels, 3MB file)
    ↓
Loaded into Memory: 1536 × 2752 × 4 bytes/pixel = 17MB
    ↓
Extension Hard Limit: 12MB
    ↓
iOS kills extension: memorystatus: exceeded mem limit: ActiveHard 12 MB (fatal)
    ↓
Result: Default "Restricted" screen shown
```

**The Fix:**
```
New Images:
- RomanCharacter@1x.png: 33×60 pixels (~5KB file, ~8KB memory)
- RomanCharacter@2x.png: 67×120 pixels (~16KB file, ~32KB memory)
- RomanCharacter@3x.png: 100×180 pixels (~32KB file, ~72KB memory)

Memory usage: 72KB << 12MB limit ✅
```

**Key Learning:** iOS extension memory limits are STRICT. Always calculate decompressed image size:
```
Memory Size = Width × Height × 4 bytes/pixel
```

**Files:** `PandaAppShield/Assets.xcassets/RomanCharacter.imageset/`

---

## 3. SwiftUI & Concurrency Patterns

### 3.1 Timer Callback Safety

**Pattern:** Always wrap timer callbacks in `Task { @MainActor in }` when accessing @MainActor properties/methods.

**Why Needed:**
```swift
@MainActor
class TimerManager: ObservableObject {
    @Published var timeRemaining: Int = 0

    // ❌ COMPILE ERROR:
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
        self.timeRemaining -= 1
        // ERROR: Main actor-isolated property 'timeRemaining'
        //        can not be mutated from a Sendable closure
    }

    // ✅ CORRECT:
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        Task { @MainActor in
            self?.timeRemaining -= 1
        }
    }
}
```

**Applied Everywhere:**
- `TimerManager.swift` (lines 157-159, 319-328, 617-629)
- `SFSManager.swift` (line 1247)
- `BlockScheduleManager.swift` (lines 800-840)

---

### 3.2 Avoid Timer Restarts

**Pattern:** Check if timer is nil before creating to prevent flicker.

```swift
// ❌ BAD - Restarts timer unnecessarily:
if !isInBreak {
    startScheduleCountdownTimer()  // Called every polling cycle
}

// ✅ GOOD - Only starts if not already running:
if !isInBreak && scheduleCountdownTimer == nil {
    startScheduleCountdownTimer()
}
```

**Why This Matters:**
- Timer restart causes brief gap in updates
- UI reads stale value during gap
- User sees flicker/jump in countdown
- Nil check prevents restart if already running

---

### 3.3 Published Property Doesn't Auto-Refresh from Files

**Critical Learning:** @Published properties load ONCE. If extension modifies backing file, main app Published property has STALE data.

**Solution:** Explicitly reload on app foreground:
```swift
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    sfsManager.scheduledSessions = sfsManager.storage.loadScheduledSessions()
    sfsManager.syncSegmentStateOnForeground()
}
```

**Affected Managers:**
- `SFSManager` (scheduledSessions property)
- `BlockScheduleManager` (activeScheduleId property)

---

## 4. Extension Development Constraints

### 4.1 Memory Limits

| Extension Type | Memory Limit |
|----------------|--------------|
| Shield Configuration | 12 MB (hard limit) |
| DeviceActivity Monitor | ~30 MB (soft limit) |
| Widget | ~16 MB (soft limit) |

**Always calculate image memory:**
```
Memory = Width × Height × 4 bytes/pixel
```

---

### 4.2 App Group Storage Patterns

**All session state must persist to App Group for extension access:**

```swift
// CORRECT pattern:
let containerURL = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.luiz.PandaApp"
)

let stateURL = containerURL.appendingPathComponent("sessionState.json")

// Use atomic writes to prevent partial reads:
try data.write(to: stateURL, options: .atomic)
```

**Critical Files:**
- `sfsActiveSession.json` - Current SFS
- `sfsScheduledSessions.json` - Future SFS
- `blockScheduleBreakState.json` - Block Schedule break
- `manualBreakEndTime.txt` - SFS break end time
- `shieldSessionState.json` - Extension session metadata

---

### 4.3 Darwin Notification Order

**CRITICAL:** Post Darwin notification AFTER state is saved, NOT before.

```swift
// ❌ WRONG - Main app reads before state written:
postDarwinNotification(.blockScheduleStarted)
try storage.saveActiveScheduleId(schedule.id)

// ✅ CORRECT - State saved before notification:
try storage.saveActiveScheduleId(schedule.id)  // Atomic write completes
postDarwinNotification(.blockScheduleStarted)  // Now safe to notify
```

**Why:** Main app handler immediately reads state file. If notification arrives before write completes, main app reads stale/missing data.

---

## 5. State Management Patterns

### 5.1 Foreground Sync Pattern

**Always sync critical state on app foreground:**

```swift
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    // 1. Reload session state from storage
    sfsManager.syncSegmentStateOnForeground()
    blockScheduleManager.syncActiveScheduleOnForeground()

    // 2. Reload scheduled sessions
    sfsManager.reloadSessionsFromStorage()

    // 3. Check for break state changes
    if sfsManager.isInManualBreak {
        sfsManager.checkBreakEnded()
    }
}
```

**Why Needed:**
- Extension may have modified state while app was backgrounded
- Published properties don't auto-refresh from files
- User expectations: app shows current state when opened

---

### 5.2 State File Atomic Writes

**Always use .atomic option for state files:**

```swift
// ✅ CORRECT:
try data.write(to: fileURL, options: .atomic)

// ❌ WRONG:
try data.write(to: fileURL)  // No atomic - partial reads possible
```

**Why Atomic:**
- Writes to temp file first, then atomic rename
- Prevents extension reading half-written JSON
- Guarantees data integrity across process boundaries

---

### 5.3 Break State Management

**Pattern:** App sets state, Extension manages shields.

```swift
// App (when break starts):
1. Set isInBreak = true
2. Calculate breakEndTime
3. Save state to App Group file
4. Schedule DeviceActivity resume interval
5. ❌ DO NOT remove shields from app

// Extension (receives break start event):
1. Read state from App Group file
2. Remove shields (extension-only operation)
3. Post Darwin notification to app

// App (when break ends - foreground):
1. Detect break ended
2. Update UI state
3. ❌ DO NOT re-apply shields from app

// Extension (receives break end event):
1. Re-apply shields (extension-only operation)
2. Post Darwin notification to app
```

**Critical Rule:** Shields managed ONLY by extension, never by main app after initial session start.

---

## 6. Key Takeaways

### 6.1 Architecture Principles

1. **Separation of Concerns:**
   - App: UI, user input, state flags, notifications
   - Extension: Shields, DeviceActivity, enforcement

2. **Single Source of Truth:**
   - Extension is ONLY shield manager
   - App Group files are truth for state
   - Published properties are cache, not source

3. **Defensive Sync:**
   - Always sync on foreground
   - Never assume in-memory state is current
   - Reload from storage when uncertain

4. **Fallback Patterns:**
   - Darwin notifications for instant (99%)
   - Polling for reliability (1% + fallback)
   - Hybrid provides best of both worlds

---

### 6.2 Common Pitfalls to Avoid

1. **Don't re-apply shields from main app on foreground**
   - Causes re-locking during breaks
   - Creates race conditions with extension

2. **Don't restart timers unnecessarily**
   - Always check nil before creating
   - Prevents UI flicker

3. **Don't forget @MainActor isolation**
   - Timer callbacks need Task wrapper
   - All managers with @Published must be @MainActor

4. **Don't trust Published properties after background**
   - Extension may have changed files
   - Always reload on foreground

5. **Don't ignore extension memory limits**
   - Calculate image decompressed size
   - 12MB is hard limit, not a suggestion

6. **Don't post Darwin notifications before state saves**
   - Main app reads immediately
   - Race condition if state not written

---

### 6.3 Testing Red Flags

**If these happen, something is architecturally wrong:**

1. ✅ Apps lock during break
2. ✅ UI countdown jumps/resets
3. ✅ Session "disappears" from UI while still blocking
4. ✅ Different behavior foreground vs. background
5. ✅ Extension memory crashes
6. ✅ Shield extension shows default iOS screen

**All of these indicate:**
- App/extension state desync
- Shield management in wrong place
- Memory/timing issues

---

### 6.4 Quick Reference: Where Things Belong

| Responsibility | Main App | Extension |
|----------------|----------|-----------|
| UI Display | ✅ | ❌ |
| User Input | ✅ | ❌ |
| State Flags (isInBreak, isActive) | ✅ | ❌ (reads only) |
| App Group File Writes | ✅ | ❌ |
| App Group File Reads | ✅ | ✅ |
| Shield Application | ❌ (only initial) | ✅ |
| Shield Removal | ❌ | ✅ |
| DeviceActivity Schedules | ✅ (creates) | ✅ (monitors) |
| Darwin Notifications | ✅ (receives) | ✅ (posts) |
| Countdown Timers (UI) | ✅ | ❌ |
| Break Auto-Resume | ❌ (detects) | ✅ (executes) |

---

## Revision History

- **v1.0** (Feb 15, 2026): Initial creation from consolidated bug analysis docs
- **Sources:**
  - BREAK_FREEZE_ROOT_CAUSE.md (Nov 24, 2025)
  - BLOCK_SCHEDULE_HYBRID_IMPLEMENTATION_GUIDE.md (Nov 24, 2025)
  - SFS_CRITICAL_ANALYSIS.md (Nov 22, 2025)
  - TIMER_MANAGER_MAINACTOR_ANALYSIS.md (Nov 24, 2025)
  - BREAK_ARCHITECTURE_VISUAL.md (Nov 11, 2025)

---

**END OF LESSONS LEARNED**
