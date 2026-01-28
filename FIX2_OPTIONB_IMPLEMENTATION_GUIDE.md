# Fix #2 Option B: SFS Break with Darwin Notifications
## Complete Implementation Guide

**Date**: November 24, 2025  
**Status**: Ready for Implementation  
**Complexity**: Medium (Reuses existing Darwin bridge from Fix #3)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [The Solution (Option B)](#2-the-solution-option-b)
3. [Step-by-Step Implementation](#3-step-by-step-implementation)
4. [Complete Code Changes](#4-complete-code-changes)
5. [Edge Case Handling](#5-edge-case-handling)
6. [Integration with Fix #3](#6-integration-with-fix-3)
7. [Testing Guide](#7-testing-guide)
8. [Verification Logs](#8-verification-logs)

---

## 1. Problem Statement

### What's Broken

When a manual break ends naturally (countdown reaches 00:00) while the user is actively watching the app:

**Current Behavior**:
- Timer freezes at 00:00
- UI stops updating
- Break state clears correctly
- Apps re-block correctly (extension works)
- BUT: Main app shows frozen timer

**When It Works**:
- If user leaves app during break and returns after it ends: Works perfectly
- If user is in another app when break ends: Works perfectly
- ONLY breaks when user is actively watching the countdown reach 00:00

### Why Timer Stops During Break

The timer display freezes because of a race condition in the timer callback:

```swift
// SFSManager.swift:1254-1270
private func checkSegmentCompletion() {
    // Check if manual break ended
    if isInManualBreak, let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
        logger.info("⏱️ MANUAL BREAK ENDED (detected by segment timer)")
        handleBreakAutoResume()  // Clears state, restarts timer
        return
    }
    // ... rest of logic
}
```

**The Race Condition**:
1. Timer callback fires at exactly 00:00
2. Detects `Date() >= breakEndTime` is TRUE
3. Calls `handleBreakAutoResume()` which:
   - Sets `isInManualBreak = false`
   - Sets `manualBreakEndTime = nil`
   - Restarts segment timer
4. **BUT**: No explicit UI refresh happens
5. **OLD timer callback still on stack** when new timer starts
6. SwiftUI doesn't immediately re-render
7. Result: Frozen 00:00 display

### Why Our Previous Fix Didn't Work

**Previous Attempt**: Added `objectWillChange.send()` in `handleBreakAutoResume()`

**Why It Failed**:
- `objectWillChange.send()` queues a UI update
- But timer callback is still executing when it's called
- SwiftUI doesn't guarantee immediate refresh during timer callback
- The countdown UI is bound to `manualBreakEndTime` which was just set to `nil`
- With `nil`, `RomanCoinTimer` can't compute remaining time
- Falls back to last value: 0 (frozen)

**Root Cause**: App-level timer callbacks can't reliably trigger UI updates at the exact moment of state transition.

---

## 2. The Solution (Option B)

### Complete Architecture Explanation

Instead of relying on app-level timer callbacks to detect break end, we use the **existing extension auto-resume mechanism** to notify the main app:

```
Break Ends → Extension intervalDidStart() → Post Darwin Notification → Main App Receives → Restart Timer
```

**Key Insight**: The extension ALREADY runs code when break ends (to re-apply shields). We just need to add a Darwin notification to that existing code.

### Darwin Notification Pattern

Darwin notifications are system-level notifications that work even when:
- App is killed
- App is backgrounded
- App is in foreground but not the active window

**Existing Implementation** (from Fix #3):
- `DarwinNotificationBridge.swift` already exists and works
- Registered for `com.luiz.PandaApp.sfsSessionPromoted`
- Bridges Darwin → NotificationCenter for SwiftUI consumption

**Our Addition**:
- Add new notification: `com.luiz.PandaApp.sfsBreakEnded`
- Extension posts when break resume interval fires
- Main app receives and restarts timer

### Timer Restart Mechanism

When main app receives Darwin notification:

1. **Reload Session**: Get latest session data from storage (has extended start time from break)
2. **Clear Break State**: Set `isInManualBreak = false`, `manualBreakEndTime = nil`
3. **Recalculate Segment**: Determine which task we're in based on elapsed time
4. **Restart Timer**: Create fresh `segmentCheckTimer` with correct end time
5. **Force UI Refresh**: Call `objectWillChange.send()` to update SwiftUI

**Why This Works**:
- Extension code runs in separate process context (no race conditions)
- Darwin notification arrives asynchronously (safe timing)
- Main app handles notification in clean context (not during timer callback)
- UI refresh guaranteed because it's triggered outside timer callback

### Fallback Strategy

The app still keeps the in-app detection as fallback:

```swift
// Keep existing detection in checkSegmentCompletion()
if isInManualBreak, let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
    handleBreakAutoResume()
    return
}
```

**Why Keep It**:
- If extension notification is delayed/missed, app still detects break end
- Provides redundancy (defense in depth)
- Already exists and doesn't hurt

**Primary Path**: Extension Darwin notification (more reliable)  
**Fallback Path**: In-app timer detection (existing code)

---

## 3. Step-by-Step Implementation

### Part A: Extension Posts Darwin Notification

**File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaAppMonitor/DeviceActivityMonitor.swift`

**Location**: Inside `handleManualBreakResume()` method (lines 220-276)

**What to Add**: Post Darwin notification AFTER clearing break state files, BEFORE stopping interval

**Why This Order**:
1. Re-apply shields (line 227) - Apps get blocked
2. Clear break state files (lines 238-258) - Storage cleaned
3. **POST DARWIN NOTIFICATION** - Tell main app
4. Stop interval (line 268) - Cleanup
5. Reload widget (line 272) - UI update

**Code to Add**:

```swift
// After line 258 (after clearing manualBreakEndTime.txt)
// Before line 260 (before writing break ended marker)

// CRITICAL FIX (Bug #2 - Option B): Send Darwin notification to main app
// This wakes the app and tells it break ended so it can restart its timer
let notificationName = "com.luiz.PandaApp.sfsBreakEnded" as CFString
CFNotificationCenterPostNotification(
    CFNotificationCenterGetDarwinNotifyCenter(),
    CFNotificationName(notificationName),
    nil,
    nil,
    true  // deliverImmediately
)
logger.log("📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app")
```

**Expected Log Output**:
```
▶️ MANUAL BREAK RESUME: Break ended - resuming session
🚫 Shields re-applied - apps blocked again
🧹 Cleared breakResumeActivityName.txt
🧹 Cleared manualBreakEndTime.txt
📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app  ← NEW
💾 Break ended marker saved to App Group
🛑 Break resume interval stopped (cleanup)
```

---

### Part B: DarwinNotificationBridge Receives It

**File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/Helpers/DarwinNotificationBridge.swift`

**Location**: Two places to modify

#### B1: Register Observer for New Notification

**Current Code** (lines 21-46): Only registers for `sfsSessionPromoted`

**What to Add**: Register for `sfsBreakEnded` as well

**How to Implement**:

**Option 1: Multiple Observers (Recommended)**
```swift
private func registerDarwinObserver() {
    let observer = Unmanaged.passUnretained(self).toOpaque()
    
    // C callback - must be static/global, cannot capture self
    let callback: CFNotificationCallback = { _, observer, name, _, _ in
        guard let observer = observer else { return }
        let bridge = Unmanaged<DarwinNotificationBridge>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
            bridge.handleDarwinNotification(name: name)
        }
    }
    
    // Register for SFS session promoted (already exists)
    let sessionPromotedName = "com.luiz.PandaApp.sfsSessionPromoted" as CFString
    CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        observer,
        callback,
        sessionPromotedName,
        nil,
        .deliverImmediately
    )
    print("🌉 DARWIN BRIDGE: Registered observer for sfsSessionPromoted")
    
    // NEW: Register for SFS break ended
    let breakEndedName = "com.luiz.PandaApp.sfsBreakEnded" as CFString
    CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        observer,
        callback,
        breakEndedName,
        nil,
        .deliverImmediately
    )
    print("🌉 DARWIN BRIDGE: Registered observer for sfsBreakEnded")
}
```

**Option 2: Wildcard Observer (Alternative)**
```swift
// Register for ALL notifications with our prefix (less code, more flexible)
// Pass nil as notification name to receive ALL Darwin notifications
CFNotificationCenterAddObserver(
    CFNotificationCenterGetDarwinNotifyCenter(),
    observer,
    callback,
    nil,  // Receive all notifications
    nil,
    .deliverImmediately
)
print("🌉 DARWIN BRIDGE: Registered for all Darwin notifications")
```

**Recommended**: Option 1 (explicit registration per notification)

#### B2: Handle New Notification

**Current Code** (lines 48-58): Only forwards `sfsSessionPromoted`

**What to Add**: Forward `sfsBreakEnded` as well

```swift
private func handleDarwinNotification(name: CFNotificationName?) {
    guard let name = name else { return }
    
    let nameString = name.rawValue as String
    print("📡 DARWIN BRIDGE: Received \(nameString)")
    
    // Forward to NotificationCenter for SwiftUI consumption
    if nameString == "com.luiz.PandaApp.sfsSessionPromoted" {
        NotificationCenter.default.post(name: .sfsSessionPromoted, object: nil)
    }
    // NEW: Forward SFS break ended notification
    else if nameString == "com.luiz.PandaApp.sfsBreakEnded" {
        NotificationCenter.default.post(name: .sfsBreakEnded, object: nil)
    }
}
```

#### B3: Add Notification.Name Extension

**Current Code** (lines 74-76): Only defines `sfsSessionPromoted`

**What to Add**: Define `sfsBreakEnded`

```swift
// Extend Notification.Name
extension Notification.Name {
    static let sfsSessionPromoted = Notification.Name("SFSSessionPromoted")
    static let sfsBreakEnded = Notification.Name("SFSBreakEnded")  // NEW
}
```

---

### Part C: Main App Handles Notification

**File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/Models/SFSManager.swift`

**Location**: Add new method to handle break end notification

#### C1: Add Method to SFSManager

**Where**: After `handleBreakAutoResume()` method (after line 1220)

**What**: New method specifically for Darwin notification handling

```swift
/// Handle break end notification from extension (via Darwin notification)
/// Called when DeviceActivityMonitor extension posts break ended notification
/// This is the PRIMARY way break-end is detected (timer-based detection is fallback)
@MainActor
func handleBreakEndedFromExtension() {
    guard isInManualBreak else {
        logger.debug("  → Not in manual break - ignoring notification")
        return
    }
    
    logger.info("🔔 DARWIN: Received break ended notification from extension")
    
    // Extension already re-applied shields, we just need to update app state
    
    // 1. Clear break state
    isInManualBreak = false
    manualBreakEndTime = nil
    currentBreakResumeActivity = nil
    storage.clearBreakResumeActivity()
    logger.debug("  → Cleared break state flags")
    
    // 2. Clear break end time file from App Group (redundant but safe)
    if let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: "group.com.luiz.PandaApp"
    ) {
        let breakEndTimeURL = containerURL.appendingPathComponent("manualBreakEndTime.txt")
        do {
            if FileManager.default.fileExists(atPath: breakEndTimeURL.path) {
                try FileManager.default.removeItem(at: breakEndTimeURL)
                logger.debug("🧹 Cleared break end time file from App Group")
            }
        } catch {
            logger.error("❌ Failed to clear break end time file: \(error)")
        }
    }
    
    // 3. Reload session from storage (gets extended start time from break)
    if let savedSession = storage.loadActiveSession() {
        self.activeSession = savedSession
        logger.debug("  → Reloaded session from storage")
    }
    
    // 4. CRITICAL: Restart segment timer to resume countdown
    if let session = activeSession {
        guard let startTime = session.scheduledStartTime else {
            logger.error("❌ Cannot restart timer - no start time")
            return
        }
        
        // Calculate remaining time in current task
        let now = Date()
        let elapsed = now.timeIntervalSince(startTime)
        var cumulativeTime: TimeInterval = 0
        
        for (taskIdx, task) in session.tasks.enumerated() {
            let taskEnd = cumulativeTime + task.duration
            
            if taskIdx == currentTaskIndex && elapsed < taskEnd {
                // We're in this task - calculate when it ends
                currentSegmentEndTime = startTime.addingTimeInterval(taskEnd)
                logger.debug("  → Current task ends at: \(self.currentSegmentEndTime!)")
                
                // CRITICAL: Stop old timer before creating new one
                stopSegmentTimer()
                
                // Restart timer
                segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                    DispatchQueue.main.async {
                        self?.checkSegmentCompletion()
                    }
                }
                logger.debug("  → Segment timer restarted")
                break
            }
            
            cumulativeTime = taskEnd
        }
    }
    
    // 5. Force UI refresh (CRITICAL for frozen timer fix)
    objectWillChange.send()
    
    // 6. Reload widget to show resumed state
    WidgetCenter.shared.reloadAllTimelines()
    logger.debug("🔄 Widget reloaded for resumed state")
    
    logger.info("✅ Break end handled via Darwin notification")
}
```

**Key Points**:
- Method is `@MainActor` (safe for UI updates)
- Checks `isInManualBreak` guard (ignore if not in break)
- Stops old timer BEFORE creating new one (prevents double timers)
- Calls `objectWillChange.send()` to force UI refresh
- Reloads session from storage (gets extended start time)

#### C2: Register for Notification in RomanTimerView

**File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/Views/RomanTimerView.swift`

**Location**: Add to existing notification listeners (around line 753-757)

**Current Code**:
```swift
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    sfsManager.syncSegmentStateOnForeground()
    blockScheduleManager.forceStateRefresh()
}
```

**Add Below It**:
```swift
.onReceive(NotificationCenter.default.publisher(for: .sfsBreakEnded)) { _ in
    // CRITICAL FIX (Bug #2 - Option B): Handle break end notification from extension
    // This fires when DeviceActivityMonitor extension posts Darwin notification
    // after break resume interval starts (extension re-applied shields)
    Task { @MainActor in
        sfsManager.handleBreakEndedFromExtension()
    }
}
```

**Expected Flow**:
1. User is watching break countdown
2. Countdown reaches 00:00
3. Extension `intervalDidStart()` fires (break resume activity)
4. Extension posts Darwin notification
5. Darwin bridge receives it
6. NotificationCenter posts `.sfsBreakEnded`
7. RomanTimerView receives notification
8. Calls `sfsManager.handleBreakEndedFromExtension()`
9. Timer restarts with correct end time
10. UI displays correct countdown

---

### Part D: Timer Restarts Correctly

**Verification Steps** (after implementation):

#### D1: Timer State Before Break End

```
User watching: 00:03... 00:02... 00:01... 00:00
State:
- isInManualBreak = true
- manualBreakEndTime = Date(now + 0 seconds)
- segmentCheckTimer = active (firing every 1 second)
- UI: Shows break countdown
```

#### D2: Extension Fires (Break End)

```
Extension: handleManualBreakResume() executes
1. Re-applies shields (apps blocked)
2. Clears break state files
3. Posts Darwin notification "com.luiz.PandaApp.sfsBreakEnded"
4. Stops break resume interval
5. Reloads widget
```

#### D3: Main App Receives Notification

```
Main App: .onReceive(NotificationCenter.default.publisher(for: .sfsBreakEnded))
1. Calls sfsManager.handleBreakEndedFromExtension()
2. Clears: isInManualBreak = false, manualBreakEndTime = nil
3. Stops old segmentCheckTimer
4. Reloads session from storage (gets extended start time)
5. Recalculates currentSegmentEndTime
6. Creates NEW segmentCheckTimer
7. Calls objectWillChange.send() → UI refreshes
8. Widget reloaded
```

#### D4: Timer State After Break End

```
User sees: Countdown resumes from correct time (e.g., 27:45 remaining)
State:
- isInManualBreak = false
- manualBreakEndTime = nil
- segmentCheckTimer = NEW instance (firing every 1 second)
- currentSegmentEndTime = correct Date for task end
- UI: Shows task countdown (updated)
```

**Success Criteria**:
- No frozen 00:00 display
- Timer shows correct remaining time
- Countdown continues updating every second
- User doesn't notice any gap/freeze

---

## 4. Complete Code Changes

### File 1: DeviceActivityMonitor.swift

**Path**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaAppMonitor/DeviceActivityMonitor.swift`

**Line Numbers**: After line 258, before line 260

**Change Type**: ADD 9 lines

```swift
// Line 258: try FileManager.default.removeItem(at: breakEndTimeURL)
// Line 259: logger.log("🧹 Cleared manualBreakEndTime.txt")

// ADD THESE LINES:
// CRITICAL FIX (Bug #2 - Option B): Send Darwin notification to main app
// This wakes the app and tells it break ended so it can restart its timer
let notificationName = "com.luiz.PandaApp.sfsBreakEnded" as CFString
CFNotificationCenterPostNotification(
    CFNotificationCenterGetDarwinNotifyCenter(),
    CFNotificationName(notificationName),
    nil,
    nil,
    true  // deliverImmediately
)
logger.log("📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app")

// Line 260: // Write break ended marker to App Group
```

---

### File 2: DarwinNotificationBridge.swift

**Path**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/Helpers/DarwinNotificationBridge.swift`

**Change Type**: MODIFY and ADD

#### Change 2A: Register Observer

**Lines**: 21-46 (replace `registerDarwinObserver()` method)

**Before**:
```swift
private func registerDarwinObserver() {
    let notificationName = "com.luiz.PandaApp.sfsSessionPromoted" as CFString
    let observer = Unmanaged.passUnretained(self).toOpaque()
    
    let callback: CFNotificationCallback = { _, observer, name, _, _ in
        guard let observer = observer else { return }
        let bridge = Unmanaged<DarwinNotificationBridge>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
            bridge.handleDarwinNotification(name: name)
        }
    }
    
    CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        observer,
        callback,
        notificationName,
        nil,
        .deliverImmediately
    )
    
    print("🌉 DARWIN BRIDGE: Registered observer for sfsSessionPromoted")
}
```

**After**:
```swift
private func registerDarwinObserver() {
    let observer = Unmanaged.passUnretained(self).toOpaque()
    
    let callback: CFNotificationCallback = { _, observer, name, _, _ in
        guard let observer = observer else { return }
        let bridge = Unmanaged<DarwinNotificationBridge>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
            bridge.handleDarwinNotification(name: name)
        }
    }
    
    // Register for SFS session promoted (Fix #3)
    let sessionPromotedName = "com.luiz.PandaApp.sfsSessionPromoted" as CFString
    CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        observer,
        callback,
        sessionPromotedName,
        nil,
        .deliverImmediately
    )
    print("🌉 DARWIN BRIDGE: Registered observer for sfsSessionPromoted")
    
    // Register for SFS break ended (Fix #2 Option B)
    let breakEndedName = "com.luiz.PandaApp.sfsBreakEnded" as CFString
    CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        observer,
        callback,
        breakEndedName,
        nil,
        .deliverImmediately
    )
    print("🌉 DARWIN BRIDGE: Registered observer for sfsBreakEnded")
}
```

#### Change 2B: Handle Notification

**Lines**: 48-58 (replace `handleDarwinNotification()` method)

**Before**:
```swift
private func handleDarwinNotification(name: CFNotificationName?) {
    guard let name = name else { return }
    
    let nameString = name.rawValue as String
    print("📡 DARWIN BRIDGE: Received \(nameString)")
    
    // Forward to NotificationCenter for SwiftUI consumption
    if nameString == "com.luiz.PandaApp.sfsSessionPromoted" {
        NotificationCenter.default.post(name: .sfsSessionPromoted, object: nil)
    }
}
```

**After**:
```swift
private func handleDarwinNotification(name: CFNotificationName?) {
    guard let name = name else { return }
    
    let nameString = name.rawValue as String
    print("📡 DARWIN BRIDGE: Received \(nameString)")
    
    // Forward to NotificationCenter for SwiftUI consumption
    if nameString == "com.luiz.PandaApp.sfsSessionPromoted" {
        NotificationCenter.default.post(name: .sfsSessionPromoted, object: nil)
    } else if nameString == "com.luiz.PandaApp.sfsBreakEnded" {
        NotificationCenter.default.post(name: .sfsBreakEnded, object: nil)
    }
}
```

#### Change 2C: Add Notification Name

**Lines**: 74-76 (add to extension)

**Before**:
```swift
extension Notification.Name {
    static let sfsSessionPromoted = Notification.Name("SFSSessionPromoted")
}
```

**After**:
```swift
extension Notification.Name {
    static let sfsSessionPromoted = Notification.Name("SFSSessionPromoted")
    static let sfsBreakEnded = Notification.Name("SFSBreakEnded")
}
```

---

### File 3: SFSManager.swift

**Path**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/Models/SFSManager.swift`

**Change Type**: ADD new method

**Line Number**: After line 1220 (after `handleBreakAutoResume()` method)

**Add This Complete Method** (91 lines):

```swift
/// Handle break end notification from extension (via Darwin notification)
/// Called when DeviceActivityMonitor extension posts break ended notification
/// This is the PRIMARY way break-end is detected (timer-based detection is fallback)
@MainActor
func handleBreakEndedFromExtension() {
    guard isInManualBreak else {
        logger.debug("  → Not in manual break - ignoring notification")
        return
    }
    
    logger.info("🔔 DARWIN: Received break ended notification from extension")
    
    // Extension already re-applied shields, we just need to update app state
    
    // 1. Clear break state
    isInManualBreak = false
    manualBreakEndTime = nil
    currentBreakResumeActivity = nil
    storage.clearBreakResumeActivity()
    logger.debug("  → Cleared break state flags")
    
    // 2. Clear break end time file from App Group (redundant but safe)
    if let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: "group.com.luiz.PandaApp"
    ) {
        let breakEndTimeURL = containerURL.appendingPathComponent("manualBreakEndTime.txt")
        do {
            if FileManager.default.fileExists(atPath: breakEndTimeURL.path) {
                try FileManager.default.removeItem(at: breakEndTimeURL)
                logger.debug("🧹 Cleared break end time file from App Group")
            }
        } catch {
            logger.error("❌ Failed to clear break end time file: \(error)")
        }
    }
    
    // 3. Reload session from storage (gets extended start time from break)
    if let savedSession = storage.loadActiveSession() {
        self.activeSession = savedSession
        logger.debug("  → Reloaded session from storage")
    }
    
    // 4. CRITICAL: Restart segment timer to resume countdown
    if let session = activeSession {
        guard let startTime = session.scheduledStartTime else {
            logger.error("❌ Cannot restart timer - no start time")
            return
        }
        
        // Calculate remaining time in current task
        let now = Date()
        let elapsed = now.timeIntervalSince(startTime)
        var cumulativeTime: TimeInterval = 0
        
        for (taskIdx, task) in session.tasks.enumerated() {
            let taskEnd = cumulativeTime + task.duration
            
            if taskIdx == currentTaskIndex && elapsed < taskEnd {
                // We're in this task - calculate when it ends
                currentSegmentEndTime = startTime.addingTimeInterval(taskEnd)
                logger.debug("  → Current task ends at: \(self.currentSegmentEndTime!)")
                
                // CRITICAL: Stop old timer before creating new one
                stopSegmentTimer()
                
                // Restart timer
                segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                    DispatchQueue.main.async {
                        self?.checkSegmentCompletion()
                    }
                }
                logger.debug("  → Segment timer restarted")
                break
            }
            
            cumulativeTime = taskEnd
        }
    }
    
    // 5. Force UI refresh (CRITICAL for frozen timer fix)
    objectWillChange.send()
    
    // 6. Reload widget to show resumed state
    WidgetCenter.shared.reloadAllTimelines()
    logger.debug("🔄 Widget reloaded for resumed state")
    
    logger.info("✅ Break end handled via Darwin notification")
}
```

---

### File 4: RomanTimerView.swift

**Path**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/Views/RomanTimerView.swift`

**Change Type**: ADD notification listener

**Line Number**: After line 757 (after existing foreground notification listener)

**Before**:
```swift
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    sfsManager.syncSegmentStateOnForeground()
    blockScheduleManager.forceStateRefresh()
}
```

**Add Below**:
```swift
.onReceive(NotificationCenter.default.publisher(for: .sfsBreakEnded)) { _ in
    // CRITICAL FIX (Bug #2 - Option B): Handle break end notification from extension
    // This fires when DeviceActivityMonitor extension posts Darwin notification
    // after break resume interval starts (extension re-applied shields)
    Task { @MainActor in
        sfsManager.handleBreakEndedFromExtension()
    }
}
```

---

## 5. Edge Case Handling

### Edge Case 1: Timer Already Running

**Scenario**: Darwin notification arrives but timer is already running (shouldn't happen, but defensive)

**Protection**:
```swift
// In handleBreakEndedFromExtension()
guard isInManualBreak else {
    logger.debug("  → Not in manual break - ignoring notification")
    return
}
```

**Result**: Notification ignored if not in break state

---

### Edge Case 2: Duplicate Notifications

**Scenario**: Extension posts notification twice OR app receives it multiple times

**Protection 1**: Guard check (already covered above)

**Protection 2**: Stop old timer before creating new one
```swift
// In handleBreakEndedFromExtension()
stopSegmentTimer()  // Invalidates old timer
// Then create new timer
segmentCheckTimer = Timer.scheduledTimer(...)
```

**Result**: Only one timer running, no double updates

---

### Edge Case 3: App Killed During Break

**Scenario**: User force-quits app during manual break

**What Happens**:
1. Extension still runs (separate process)
2. Extension auto-resume interval fires at break end
3. Extension re-applies shields
4. Extension posts Darwin notification
5. App is dead, doesn't receive notification
6. User re-opens app AFTER break ended

**Fallback**: `SFSManager.init()` (lines 177-200)
```swift
// Load manual break state from storage
if FileManager.default.fileExists(atPath: breakEndTimeURL.path) {
    let endTimeString = try String(contentsOf: breakEndTimeURL, encoding: .utf8)
    if let endTimeInterval = TimeInterval(endTimeString) {
        self.manualBreakEndTime = Date(timeIntervalSince1970: endTimeInterval)
        self.isInManualBreak = true  // Restored
    }
}
```

**Then**: `syncSegmentStateOnForeground()` (lines 1349-1354)
```swift
if isInManualBreak {
    if let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
        logger.info("  → ⏱️ MANUAL BREAK ENDED - auto-resuming")
        handleBreakAutoResume()  // Cleans up
        return
    }
}
```

**Result**: App detects break already ended, cleans up, continues session normally

---

### Edge Case 4: Manual Break Cancellation

**Scenario**: User clicks "End Break Early" button (if we add this feature)

**Current Code**: No early cancellation exists

**If Added in Future**:
```swift
func cancelManualBreak() {
    guard isInManualBreak else { return }
    
    // Stop break resume DeviceActivity interval
    if let activityName = currentBreakResumeActivity {
        DeviceActivityCenter().stopMonitoring([activityName])
    }
    
    // Call same handler (reuses logic)
    handleBreakAutoResume()
    
    logger.info("⏭️ Manual break cancelled by user")
}
```

**Result**: Reuses existing `handleBreakAutoResume()` logic, no special handling needed

---

### Edge Case 5: Timer Callback Fires at Same Time as Darwin Notification

**Scenario**: In-app timer detects break end at EXACTLY same moment Darwin notification arrives

**Protection**: Guard check runs in both paths
```swift
// Timer callback path:
if isInManualBreak, let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
    handleBreakAutoResume()  // Sets isInManualBreak = false
    return
}

// Darwin notification path:
func handleBreakEndedFromExtension() {
    guard isInManualBreak else { return }  // Already false, exits early
    // ...
}
```

**Result**: First handler wins (sets `isInManualBreak = false`), second handler sees guard and exits immediately

---

### Edge Case 6: Extension Notification Delayed

**Scenario**: Darwin notification takes 2-3 seconds to arrive due to system load

**Fallback**: In-app timer detection (existing code)
```swift
// Timer still running every 1 second
private func checkSegmentCompletion() {
    if isInManualBreak, let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
        logger.info("⏱️ MANUAL BREAK ENDED (detected by segment timer)")
        handleBreakAutoResume()  // Handles it
        return
    }
}
```

**Result**: App handles break end itself within 1 second of actual end time, Darwin notification arrives later but does nothing (guard check)

---

## 6. Integration with Fix #3

### Reuse DarwinNotificationBridge

**What's Shared**:
- Same `DarwinNotificationBridge.swift` class
- Same observer callback mechanism
- Same Darwin → NotificationCenter forwarding pattern

**What's Different**:
- Fix #3: `com.luiz.PandaApp.sfsSessionPromoted` (session activation)
- Fix #2: `com.luiz.PandaApp.sfsBreakEnded` (break end)

**Integration Points**:

#### Point 1: Single Bridge Instance

```swift
// In PandaApp.swift (or wherever bridge is initialized)
@MainActor
class PandaAppApp: App {
    init() {
        // Initialize Darwin bridge ONCE
        _ = DarwinNotificationBridge.shared
        // Now handles BOTH notifications
    }
}
```

#### Point 2: Multiple Notification Names

**Before** (Fix #3 only):
```swift
extension Notification.Name {
    static let sfsSessionPromoted = Notification.Name("SFSSessionPromoted")
}
```

**After** (Fix #3 + Fix #2):
```swift
extension Notification.Name {
    static let sfsSessionPromoted = Notification.Name("SFSSessionPromoted")
    static let sfsBreakEnded = Notification.Name("SFSBreakEnded")
}
```

#### Point 3: Extension Posts Two Types

**Fix #3 Post** (DeviceActivityMonitor.swift:560-568):
```swift
// Promote scheduled SFS to active
let notificationName = "com.luiz.PandaApp.sfsSessionPromoted" as CFString
CFNotificationCenterPostNotification(
    CFNotificationCenterGetDarwinNotifyCenter(),
    CFNotificationName(notificationName),
    nil, nil, true
)
```

**Fix #2 Post** (DeviceActivityMonitor.swift:260-268, NEW):
```swift
// Break ended, tell main app
let notificationName = "com.luiz.PandaApp.sfsBreakEnded" as CFString
CFNotificationCenterPostNotification(
    CFNotificationCenterGetDarwinNotifyCenter(),
    CFNotificationName(notificationName),
    nil, nil, true
)
```

### Follow Same Pattern

**Fix #3 Pattern**:
1. Extension detects event (scheduled session starts)
2. Extension posts Darwin notification
3. Bridge receives and forwards to NotificationCenter
4. Main app listens for NotificationCenter notification
5. Main app updates state

**Fix #2 Pattern** (IDENTICAL):
1. Extension detects event (break ended)
2. Extension posts Darwin notification
3. Bridge receives and forwards to NotificationCenter
4. Main app listens for NotificationCenter notification
5. Main app updates state

**Consistency**: Both fixes use exact same architecture, just different notification names

---

## 7. Testing Guide

### Test 1: Timer Stops During Break (The Bug)

**Setup**:
1. Create SFS with 10-minute task
2. Start SFS
3. Wait 2 minutes
4. Start manual break (1 minute duration)
5. **Keep app open and visible**
6. Watch countdown

**Expected Before Fix**:
- Countdown: 00:59... 00:58... 00:03... 00:02... 00:01... 00:00
- **FREEZE at 00:00**
- Apps re-block correctly (extension works)
- But UI frozen

**Expected After Fix**:
- Countdown: 00:59... 00:58... 00:03... 00:02... 00:01... 00:00
- **Immediately shows task countdown** (e.g., 08:00)
- No freeze
- UI updates continuously

**Logs to Check**:
```
Extension:
▶️ MANUAL BREAK RESUME: Break ended - resuming session
🚫 Shields re-applied - apps blocked again
🧹 Cleared breakResumeActivityName.txt
🧹 Cleared manualBreakEndTime.txt
📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app

Main App:
📡 DARWIN BRIDGE: Received com.luiz.PandaApp.sfsBreakEnded
🔔 DARWIN: Received break ended notification from extension
  → Cleared break state flags
  → Reloaded session from storage
  → Current task ends at: [Date]
  → Segment timer restarted
🔄 Widget reloaded for resumed state
✅ Break end handled via Darwin notification
```

---

### Test 2: Darwin Notification Fires

**Setup**:
1. Start SFS with manual break
2. Start manual break (1 minute)
3. Keep app open
4. Monitor Console.app logs

**Console.app Filter**: `com.luiz.PandaApp`

**Expected Logs**:

**Extension Process**:
```
[PandaApp] 📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app
```

**Main App Process**:
```
[PandaApp] 🌉 DARWIN BRIDGE: Registered observer for sfsBreakEnded
[PandaApp] 📡 DARWIN BRIDGE: Received com.luiz.PandaApp.sfsBreakEnded
[PandaApp] 🔔 DARWIN: Received break ended notification from extension
```

**Success**: Main app logs appear within 1 second of extension log

---

### Test 3: Timer Restarts

**Setup**:
1. Start SFS with 30-minute task
2. Wait 5 minutes (25 minutes remaining)
3. Start manual break (1 minute)
4. Watch timer during break
5. Wait for break to end

**Expected**:
- Before break: Timer shows 25:00 remaining
- During break: Timer shows break countdown (01:00 → 00:00)
- **After break**: Timer shows 25:00 remaining (same as before break)
- Timer continues counting down: 24:59, 24:58, 24:57...

**Why Same Time**: TIME EXTENSION mechanism (from manual break implementation)
- Session `scheduledStartTime` extended by 1 minute
- So 25:00 remaining before break = 25:00 remaining after break
- Break doesn't "eat" session time

**Logs to Check**:
```
Main App (after break):
  → Reloaded session from storage  ← Loads extended start time
  → Current task ends at: [Date 25 minutes from now]
  → Segment timer restarted
```

---

### Test 4: With App Backgrounded

**Setup**:
1. Start SFS
2. Start manual break (2 minutes)
3. **Immediately press Home button** (background app)
4. Wait 2 minutes (break ends in background)
5. Re-open app

**Expected**:
- App opens, shows task countdown (not break countdown)
- Timer shows correct remaining time
- No freeze

**Why It Works**:
- Extension posts Darwin notification even if app backgrounded
- `syncSegmentStateOnForeground()` also handles it as fallback
- Either path restores timer correctly

**Logs to Check**:
```
Main App (on foreground):
🔄 Syncing SFS state on foreground
  → Reloaded session from storage
  → ⏱️ MANUAL BREAK ENDED - auto-resuming  ← Fallback detected it
  → Segment timer restarted
```

---

### Test 5: With App Killed

**Setup**:
1. Start SFS
2. Start manual break (2 minutes)
3. **Force quit app** (swipe up in app switcher)
4. Wait 2 minutes (break ends while app dead)
5. Re-open app

**Expected**:
- App opens, initializes
- Detects break already ended (from storage)
- Shows task countdown
- Timer updates correctly

**Why It Works**:
- `SFSManager.init()` loads break state from storage (lines 177-200)
- Detects `manualBreakEndTime.txt` exists
- Then `syncSegmentStateOnForeground()` detects break ended
- Calls `handleBreakAutoResume()` to clean up

**Logs to Check**:
```
Main App (init):
🔄 Restored manual break state from storage
  → Break ends at: [Date in past]

Main App (foreground sync):
🔄 Syncing SFS state on foreground
  → ⏱️ MANUAL BREAK ENDED - auto-resuming
  → Cleared break state flags
  → Segment timer restarted
```

---

### Test 6: Duplicate Notification Protection

**Setup**:
1. Modify extension to post Darwin notification TWICE (simulating bug)
2. Start SFS, manual break
3. Wait for break to end
4. Check logs for duplicate handling

**Expected**:
- First notification: Handled, timer restarted
- Second notification: Ignored (guard check)

**Logs**:
```
First notification:
🔔 DARWIN: Received break ended notification from extension
✅ Break end handled via Darwin notification

Second notification:
📡 DARWIN BRIDGE: Received com.luiz.PandaApp.sfsBreakEnded
  → Not in manual break - ignoring notification  ← Guard check worked
```

---

### Test 7: Extension Notification Delay

**Setup**:
1. Start SFS, manual break (1 minute)
2. Simulate heavy system load (open many apps, start large file copy)
3. Wait for break to end
4. Check which handler fires first

**Expected**:
- In-app timer detects break end within 1 second
- Darwin notification arrives 2-5 seconds later
- Both attempts to handle, but guard check prevents duplicate

**Logs**:
```
In-app timer (1 second after break end):
⏱️ MANUAL BREAK ENDED (detected by segment timer)
▶️ Break ended - resuming session
✅ Break auto-resume handled

Darwin notification (5 seconds later):
📡 DARWIN BRIDGE: Received com.luiz.PandaApp.sfsBreakEnded
  → Not in manual break - ignoring notification  ← Already handled
```

**Success**: Fallback works, Darwin notification harmlessly ignored

---

## 8. Verification Logs

### What Logs to Look For

#### A. Extension Posts Notification

**File**: DeviceActivityMonitor extension logs

**Trigger**: Break resume interval fires (break ends)

**Expected Log Sequence**:
```
▶️ MANUAL BREAK RESUME: Break ended - resuming session
  → Activity: break_resume_[UUID]
  → Current time: [Date]
🚫 Shields re-applied - apps blocked again
🧹 Cleared breakResumeActivityName.txt
🧹 Cleared manualBreakEndTime.txt
📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app  ← KEY LOG
💾 Break ended marker saved to App Group
🛑 Break resume interval stopped (cleanup)
🔄 Widget reloaded for resumed state
✅ Manual break resume handled successfully
```

**Key Log**: `📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app`

---

#### B. Darwin Bridge Receives

**File**: Main app logs (DarwinNotificationBridge)

**Trigger**: Immediately after extension posts

**Expected Log**:
```
📡 DARWIN BRIDGE: Received com.luiz.PandaApp.sfsBreakEnded
```

**Timing**: Should appear within 100-500ms of extension log

---

#### C. Main App Handles Notification

**File**: Main app logs (SFSManager)

**Trigger**: NotificationCenter fires

**Expected Log Sequence**:
```
🔔 DARWIN: Received break ended notification from extension
  → Cleared break state flags
  → Reloaded session from storage
  → Current task ends at: 2025-11-24 20:35:00 +0000
  → Segment timer restarted
🔄 Widget reloaded for resumed state
✅ Break end handled via Darwin notification
```

**Key Logs**:
- `🔔 DARWIN: Received break ended notification from extension` (entry point)
- `→ Segment timer restarted` (timer created)
- `✅ Break end handled via Darwin notification` (success)

---

#### D. Timer Updates

**File**: Main app logs (checkSegmentCompletion)

**Trigger**: Timer fires every 1 second after restart

**Expected Log** (should NOT appear):
```
⏱️ MANUAL BREAK ENDED (detected by segment timer)  ← Should NOT see this
```

**Why**: Darwin notification handled it first, so timer-based detection doesn't fire

**Expected Log** (should see these):
```
📍 SFS: Task 1/1, elapsed=300s/1800s, remaining=1500s, progress=16%
📍 SFS: Task 1/1, elapsed=301s/1800s, remaining=1499s, progress=16%
📍 SFS: Task 1/1, elapsed=302s/1800s, remaining=1498s, progress=16%
```

**Success**: Timer updates continuously, no freeze

---

### Proof It's Working

#### Proof 1: Darwin Bridge Registration

**When**: App launch

**Expected**:
```
🌉 DARWIN BRIDGE: Registered observer for sfsSessionPromoted
🌉 DARWIN BRIDGE: Registered observer for sfsBreakEnded  ← NEW
```

**Proof**: Bridge listening for new notification

---

#### Proof 2: Extension Posts Notification

**When**: Break ends

**Expected**:
```
[Extension] 📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app
[Main App] 📡 DARWIN BRIDGE: Received com.luiz.PandaApp.sfsBreakEnded
```

**Proof**: Notification traveling from extension to app

---

#### Proof 3: Main App Handles Notification

**When**: Immediately after Darwin bridge receives

**Expected**:
```
🔔 DARWIN: Received break ended notification from extension
  → Segment timer restarted
✅ Break end handled via Darwin notification
```

**Proof**: Handler executed successfully

---

#### Proof 4: Timer No Longer Freezes

**When**: User watches break countdown reach 00:00

**Before Fix**:
```
00:03... 00:02... 00:01... 00:00 [FREEZE - no more updates]
```

**After Fix**:
```
00:03... 00:02... 00:01... 00:00 → [Immediately shows] 27:45... 27:44... 27:43...
```

**Proof**: No frozen timer display

---

#### Proof 5: Widget Updates

**When**: Break ends

**Expected**:
```
[Extension] 🔄 Widget reloaded for resumed state
[Main App] 🔄 Widget reloaded for resumed state
```

**Proof**: Both extension and app reload widget, ensuring it shows correct state

---

### Complete Test Run Log Example

**Scenario**: 30-minute task, 1-minute manual break, user watches countdown

```
=== App Launch ===
🌉 DARWIN BRIDGE: Registered observer for sfsSessionPromoted
🌉 DARWIN BRIDGE: Registered observer for sfsBreakEnded

=== Start SFS ===
🚀 Activating SFS immediately
✅ SFS activated successfully - monitoring started

=== 2 minutes into task ===
⏸️ Starting manual break for task 0
  → Break ends at: 2025-11-24 20:30:00 +0000
✅ Manual break started - apps unblocked for 60s

=== User watches countdown ===
[Timer updates every second]

=== Break countdown reaches 00:00 ===
[Extension Process]
▶️ MANUAL BREAK RESUME: Break ended - resuming session
🚫 Shields re-applied - apps blocked again
🧹 Cleared breakResumeActivityName.txt
🧹 Cleared manualBreakEndTime.txt
📡 DARWIN NOTIFICATION: Sent sfsBreakEnded to main app  ← Extension posts
💾 Break ended marker saved to App Group
🛑 Break resume interval stopped (cleanup)
✅ Manual break resume handled successfully

[Main App Process - 200ms later]
📡 DARWIN BRIDGE: Received com.luiz.PandaApp.sfsBreakEnded  ← Bridge receives
🔔 DARWIN: Received break ended notification from extension  ← Handler starts
  → Cleared break state flags
  → Reloaded session from storage
  → Current task ends at: 2025-11-24 20:58:00 +0000
  → Segment timer restarted  ← Timer recreated
🔄 Widget reloaded for resumed state
✅ Break end handled via Darwin notification

[Timer resumes - no freeze]
📍 SFS: Task 1/1, elapsed=180s/1800s, remaining=1620s, progress=10%
📍 SFS: Task 1/1, elapsed=181s/1800s, remaining=1619s, progress=10%
📍 SFS: Task 1/1, elapsed=182s/1800s, remaining=1618s, progress=10%
...
```

**Success**: Timer never freezes, updates continue smoothly after break

---

## Summary

### What We Built

1. **Extension Enhancement**: Posts Darwin notification when break ends
2. **Bridge Enhancement**: Registers and forwards new notification type
3. **Main App Handler**: Restarts timer when notification received
4. **UI Listener**: Connects notification to handler

### Why It Works

- **Separate Process Context**: Extension runs independently, no race conditions
- **Asynchronous Delivery**: Darwin notification arrives outside timer callback
- **Clean State Transition**: Handler runs in fresh context, not nested in timer
- **Explicit UI Refresh**: `objectWillChange.send()` guaranteed to fire
- **Fallback Protection**: In-app timer detection still exists

### Key Benefits

- **Reuses Existing Infrastructure**: DarwinNotificationBridge from Fix #3
- **Minimal Code Changes**: ~120 lines total across 4 files
- **Defensive Programming**: Guards against duplicates, handles edge cases
- **Maintains Fallbacks**: In-app detection still works if notification delayed
- **Production-Tested Pattern**: Same architecture as Fix #3 (already working)

### Integration Points

- **Fix #3 Dependency**: Requires DarwinNotificationBridge to exist
- **Shared Bridge**: One bridge instance handles both notification types
- **Consistent Pattern**: Follow exact same architecture as Fix #3
- **No Conflicts**: Notifications are distinct, handlers are separate

---

**END OF IMPLEMENTATION GUIDE**

Ready for copy-paste implementation by another agent or developer.
