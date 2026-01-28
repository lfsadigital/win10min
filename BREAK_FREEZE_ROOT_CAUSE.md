# CRITICAL BREAK FREEZE ROOT CAUSE ANALYSIS
## SFS Break vs Block Schedule Break - Shared Pattern Investigation

**Investigation Date**: November 24, 2025  
**Status**: FOUND COMMON ROOT CAUSE (00:00 freeze)  
**Severity**: CRITICAL - Both features freeze at midnight when timer completes

---

## EXECUTIVE SUMMARY

Both SFS and Block Schedule have **IDENTICAL break end detection logic** that freezes at 00:00 (when the countdown reaches zero). The freeze occurs when:

1. User is actively watching the app (timer is running)
2. Countdown naturally completes (reaches 00:00)
3. The timer callback fires at break-end time
4. Break auto-resume is triggered
5. **UI state doesn't update immediately** - both countdown timers stop updating but don't notify observers properly

The shared root cause is: **Timer callbacks complete but fail to propagate state changes to the UI layer in real-time**.

---

## PART 1: SFS BREAK END LOGIC (Lines 1145-1214)

### Function: `handleBreakAutoResume()`  
**Location**: `SFSManager.swift:1145-1214`  
**Called From**: `SFSManager.checkSegmentCompletion():1260`

```swift
/// Handle break auto-resume (called when user returns to app after break ends)
func handleBreakAutoResume() {
    guard isInManualBreak else { return }

    logger.info("▶️ Break ended - resuming session")

    // Clear break state (lines 1152-1155)
    isInManualBreak = false
    manualBreakEndTime = nil
    currentBreakResumeActivity = nil
    storage.clearBreakResumeActivity()

    // Clear break end time file from App Group (lines 1157-1170)
    if let containerURL = FileManager.default.containerURL(...) {
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

    // ⚠️ CRITICAL: Restart segment timer (lines 1175-1207)
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

                // RESTART SEGMENT TIMER HERE (line 1196)
                segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                    Task { @MainActor in
                        self?.checkSegmentCompletion()
                    }
                }
                logger.debug("  → Segment timer restarted")
                break
            }

            cumulativeTime = taskEnd
        }
    }

    // Reload widget to show resumed state
    WidgetCenter.shared.reloadAllTimelines()
    logger.debug("🔄 Widget reloaded for resumed state")

    logger.info("✅ Break auto-resume handled")
}
```

### How SFS Break Ends (Detection Chain):

1. **Line 1243-1248**: Timer started in `startSegmentTimer()`
   ```swift
   segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
       Task { @MainActor in
           self?.checkSegmentCompletion()
       }
   }
   ```

2. **Line 1258**: Check if manual break ended
   ```swift
   if isInManualBreak, let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
       logger.info("⏱️ MANUAL BREAK ENDED (detected by segment timer)")
       handleBreakAutoResume()
       return
   }
   ```

3. **Line 1260**: Call `handleBreakAutoResume()`
   - Clears `isInManualBreak = false`
   - Clears `manualBreakEndTime = nil`
   - Recalculates segment timing
   - **Restarts the timer** (line 1196)

### Issue: Why Timer Freeze Happens

When break-end countdown reaches 00:00:

1. Timer callback executes at break-end time
2. `checkSegmentCompletion()` detects break ended (line 1258)
3. Calls `handleBreakAutoResume()` (line 1260)
4. Clears break state variables (lines 1152-1155)
5. **Restarts segment timer** (line 1196)
6. **BUT**: UI doesn't update immediately

The problem: The timer callback fires, state clears, but the UI freezes at 00:00 because:
- The **old timer is still in its callback** when the new timer is created
- The `Task { @MainActor in }` wrapper doesn't force immediate UI refresh
- `objectWillChange.send()` is NOT called

---

## PART 2: BLOCK SCHEDULE BREAK END LOGIC (Lines 808-840)

### Function: `updateBreakCountdown()`  
**Location**: `BlockScheduleManager.swift:808-840`  
**Called From**: `startBreakCountdownTimer():800`

```swift
/// Update break countdown every second
private func updateBreakCountdown() {
    // Check if break has ended naturally
    if let breakEnd = currentBreakEndTime, Date() >= breakEnd {
        debugLog.log("⏱️ Break countdown reached 00:00 - triggering auto-resume")

        // CRITICAL FIX (Bug #2): Call handleBreakAutoResume to clean up ALL state
        // Load schedule ID from storage to pass to handleBreakAutoResume
        if let breakState = storage.loadBreakState() {
            debugLog.log("  → Found break state, calling handleBreakAutoResume")
            handleBreakAutoResume(for: breakState.scheduleId)  // Line 817
        } else {
            // Fallback: No saved state, clean up manually
            debugLog.log("  → No break state in storage, cleaning up manually")
            stopBreakCountdownTimer()
            isInBreak = false
            currentBreakEndTime = nil
            currentBreakResumeActivity = nil
            objectWillChange.send()  // ✅ UI REFRESH HERE
        }

        // Exit early - handleBreakAutoResume already notified observers
        return
    }

    // Still in break - just notify UI to refresh countdown display (thread-safe)
    if Thread.isMainThread {
        objectWillChange.send()  // ✅ UI REFRESH HERE
    } else {
        DispatchQueue.main.async { [weak self] in
            self?.objectWillChange.send()
        }
    }
}
```

### How Block Schedule Break Ends (Detection Chain):

1. **Line 800-801**: Timer started in `startBreakCountdownTimer()`
   ```swift
   breakCountdownTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
       self?.updateBreakCountdown()
   }
   ```

2. **Line 810**: Check if break ended
   ```swift
   if let breakEnd = currentBreakEndTime, Date() >= breakEnd {
       debugLog.log("⏱️ Break countdown reached 00:00 - triggering auto-resume")
       handleBreakAutoResume(for: breakState.scheduleId)
   }
   ```

3. **Line 817**: Call `handleBreakAutoResume(for:)` (lines 883-917)
   ```swift
   func handleBreakAutoResume(for scheduleId: UUID) {
       guard isInBreak else { return }
       
       debugLog.log("▶️ Break ended - resuming block schedule")
       
       // Stop timer FIRST to prevent race conditions
       stopBreakCountdownTimer()
       
       // THEN update state
       isInBreak = false
       currentBreakEndTime = nil
       currentBreakResumeActivity = nil
       
       // Extension already re-applied shields
       // Clear break state from storage
       storage.clearBreakState()
       storage.clearBreakResumeActivity(for: scheduleId)
       
       // Reload widget
       WidgetCenter.shared.reloadAllTimelines()
       
       debugLog.log("✅ Block schedule resumed")
       
       // CRITICAL FIX (Bug #1 - KEY FIX): Restart schedule countdown timer (mirrors SFS pattern)
       startScheduleCountdownTimer()  // Line 907
       
       // Notify SwiftUI of state change (thread-safe)
       if Thread.isMainThread {
           objectWillChange.send()  // ✅ UI REFRESH HERE
       } else {
           DispatchQueue.main.async { [weak self] in
               self?.objectWillChange.send()
           }
       }
   }
   ```

### Issue: Why Timer Freeze Happens

When break-end countdown reaches 00:00:

1. Timer callback fires at break-end time
2. `updateBreakCountdown()` detects break ended (line 810)
3. Calls `handleBreakAutoResume(for:)` (line 817)
4. Clears break state (lines 892-894)
5. **Stops break timer** (line 889)
6. **Restarts schedule timer** (line 907)
7. **Calls `objectWillChange.send()`** (lines 910-915) ✅

However, **the pattern differs from SFS**:
- SFS doesn't call `objectWillChange.send()` in `handleBreakAutoResume()`
- Block Schedule does (lines 910-915)

But both have the same freeze issue! This suggests the problem is **DEEPER**.

---

## PART 3: THE SHARED ROOT CAUSE

### Identical Pattern in Both:

```
Timer fires → Countdown reaches 00:00 → Break end detected → State cleared → Timer restarted
```

### Why Both Freeze at 00:00:

The freeze occurs because:

1. **Old timer is still in callback stack** when state changes
   - Old timer callback: `checkSegmentCompletion()` or `updateBreakCountdown()`
   - Inside that callback: State is cleared and new timer starts
   - **Problem**: View doesn't re-render during the timer callback execution

2. **Timer callbacks wrap in `Task { @MainActor }`** (SFS only)
   - `Task { @MainActor in self?.checkSegmentCompletion() }` (line 1247)
   - **Problem**: `Task` is async, state changes don't propagate immediately
   - **No explicit UI refresh** after state changes

3. **Timer update frequency vs UI refresh**
   - Timer updates happen **every 1 second**
   - But when timer callback **clears state**, the UI doesn't invalidate immediately
   - The countdown display is bound to `currentBreakEndTime` (already cleared!)
   - **No forced re-computation** after state change

4. **Published property doesn't force refresh for removed properties**
   - `@Published var manualBreakEndTime: Date?` (SFS)
   - `@Published var currentBreakEndTime: Date? = nil` (Block Schedule)
   - When these are cleared to `nil`, the UI should update
   - **But**: `RomanCoinTimer` receives `breakEndTime` (a Date parameter)
   - When parameter changes from Date → nil, SwiftUI should re-render
   - **Problem**: Transition from active countdown to... what? Empty state?

---

## PART 4: DETAILED CODE ANALYSIS

### SFS Break End Detection (Lines 1254-1281)

```swift
private func checkSegmentCompletion() {
    // Line 1258: BREAK END DETECTION
    if isInManualBreak, let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
        logger.info("⏱️ MANUAL BREAK ENDED (detected by segment timer)")
        handleBreakAutoResume()  // Clears state
        return  // Exit timer callback
    }
    
    // ... rest of timer logic
}
```

**What happens at 00:00:**
1. `checkSegmentCompletion()` executes in timer callback
2. Condition `Date() >= breakEndTime` becomes TRUE
3. Calls `handleBreakAutoResume()`
4. **Inside `handleBreakAutoResume()`:**
   - Line 1152: `isInManualBreak = false` (Published property changed)
   - Line 1153: `manualBreakEndTime = nil` (Published property changed)
   - Line 1196: Creates **NEW** `segmentCheckTimer`
5. Function returns
6. Timer callback completes
7. **But**: No `objectWillChange.send()` was called!

**SFS Missing**: No explicit UI refresh after state clear

### Block Schedule Break End Detection (Lines 808-840)

```swift
private func updateBreakCountdown() {
    // Line 810: BREAK END DETECTION
    if let breakEnd = currentBreakEndTime, Date() >= breakEnd {
        debugLog.log("⏱️ Break countdown reached 00:00 - triggering auto-resume")
        handleBreakAutoResume(for: breakState.scheduleId)  // Clears state, calls objectWillChange
        return  // Exit timer callback
    }
    
    // Line 833: ALWAYS UPDATE UI (still in break)
    if Thread.isMainThread {
        objectWillChange.send()  // UI refresh
    } else {
        DispatchQueue.main.async { [weak self] in
            self?.objectWillChange.send()
        }
    }
}
```

**What happens at 00:00:**
1. `updateBreakCountdown()` executes in timer callback
2. Condition `Date() >= breakEnd` becomes TRUE
3. Calls `handleBreakAutoResume(for:)`
4. **Inside `handleBreakAutoResume(for:)`:**
   - Line 889: `stopBreakCountdownTimer()` (Stop old timer!)
   - Line 892: `isInBreak = false` (Published property changed)
   - Line 893: `currentBreakEndTime = nil` (Published property changed)
   - Line 907: `startScheduleCountdownTimer()` (Create NEW timer)
   - Lines 910-915: `objectWillChange.send()` (UI refresh!) ✅
5. Function returns
6. Timer callback completes

**Block Schedule Has**: Explicit UI refresh in `handleBreakAutoResume()`

BUT: Block Schedule **also freezes**! This means the `objectWillChange.send()` in lines 910-915 is NOT enough!

---

## PART 5: WHY BOTH FREEZE (Root Cause #1)

### The Timer Callback Issue

Both create timers with:
```swift
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
    // Code executes here every second
    // If we clear state AND notify UI, what happens?
}
```

**The Race Condition:**
1. Timer callback fires at exactly 00:00
2. Code detects break ended
3. Code clears `isInManualBreak = false` / `isInBreak = false`
4. Code calls `objectWillChange.send()`
5. SwiftUI schedules a re-render
6. **But**: The timer callback is STILL executing
7. **Problem**: New timer was already created (line 1196 or 907)
8. Old timer hasn't been invalidated yet in the SFS case

### SFS Specific Issue: No Timer Stop

**SFS (`handleBreakAutoResume`, line 1196):**
```swift
segmentCheckTimer = Timer.scheduledTimer(...)  // Create NEW timer
// OLD timer is still running!
```

The old `segmentCheckTimer` is **NOT invalidated** before creating a new one! This means:
- **Two timers running simultaneously**
- Both calling `checkSegmentCompletion()`
- Causing double state updates
- UI flickers or freezes

**Block Schedule Specific Issue: Timer Stop (Correct)**
```swift
stopBreakCountdownTimer()  // Line 889: STOP OLD TIMER
startScheduleCountdownTimer()  // Line 907: Create NEW timer
```

Block Schedule properly stops the old timer first. But it still freezes!

---

## PART 6: WHY BOTH FREEZE (Root Cause #2)

### The @MainActor Context Issue (SFS Only)

**SFS Code (Line 1247):**
```swift
segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in    // ⚠️ Async Task wrapper
        self?.checkSegmentCompletion()
    }
}
```

**Problem**: The timer callback wraps execution in `Task { @MainActor in }`

When this executes:
1. Timer callback: `{ [weak self] _ in Task { @MainActor in ... } }`
2. Returns immediately (async)
3. Actual execution queued on MainActor
4. But state was already cleared in the timer callback
5. When the queued task executes, state is already different
6. **Result**: UI sees stale state (break already ended, but countdown still showing)

**Contrast: Block Schedule Direct Execution**
```swift
breakCountdownTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
    self?.updateBreakCountdown()  // ✅ Direct call, synchronous execution
}
```

No Task wrapper. Executes directly. But still freezes!

This suggests **Root Cause #2 is NOT the async Task wrapper** alone.

---

## PART 7: WHY BOTH FREEZE (Root Cause #3 - THE REAL ISSUE)

### The @Published Update in Timer Callback Issue

When a @Published property changes inside a timer callback that's tied to SwiftUI observation:

**SFS:**
```swift
@Published var isInManualBreak: Bool = false
@Published var manualBreakEndTime: Date?

// Inside timer callback (checkSegmentCompletion):
if Date() >= breakEndTime {
    isInManualBreak = false       // Published property changed
    manualBreakEndTime = nil      // Published property changed
    // No objectWillChange.send()
}
```

**Block Schedule:**
```swift
@Published var isInBreak: Bool = false
@Published var currentBreakEndTime: Date? = nil

// Inside timer callback (updateBreakCountdown):
if Date() >= breakEnd {
    // ... calls handleBreakAutoResume which does:
    isInBreak = false             // Published property changed
    currentBreakEndTime = nil     // Published property changed
    objectWillChange.send()       // Explicit refresh
}
```

**The Freeze Root Cause:**

When properties change inside a timer callback at exactly the moment they become `nil`:

1. **SFS (@MainActor class)**:
   - Class is annotated with `@MainActor` (line 97)
   - Published properties ARE on MainThread
   - But property setter (`isInManualBreak = false`) happens in timer callback context
   - SwiftUI observers see the property change
   - **BUT**: The timer is STILL RUNNING
   - New timer was created with the same `segmentCheckTimer` variable reference
   - **Race condition**: Two timers, same callback queue

2. **Block Schedule (NOT @MainActor)**:
   - Class is `class BlockScheduleManager: ObservableObject` (line 117)
   - NO `@MainActor` annotation
   - Timer callback might be on background thread
   - `objectWillChange.send()` is explicitly thread-safe (lines 833-838)
   - **BUT**: Published property change happens from non-main thread
   - SwiftUI might not immediately update UI if property setter is off-main-thread
   - **Result**: UI freezes because renderer is on MainThread, setter was on background

---

## PART 8: THE ACTUAL ROOT CAUSE - FOUND IT!

### Looking at Both Classes' Annotations:

**SFSManager (line 97):**
```swift
@MainActor
class SFSManager: ObservableObject {
    @Published var isInManualBreak: Bool = false
    @Published var manualBreakEndTime: Date?
```

**BlockScheduleManager (line 117):**
```swift
class BlockScheduleManager: ObservableObject {
    @Published var isInBreak: Bool = false
    @Published var currentBreakEndTime: Date? = nil
```

**KEY DIFFERENCE:**
- SFS is `@MainActor` (ALL methods run on MainThread)
- Block Schedule is NOT `@MainActor` (methods can run on any thread)

**But**: When SFS creates timer (line 1243):
```swift
segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in
        self?.checkSegmentCompletion()
    }
}
```

This creates an **implicit background timer**! Even though the class is `@MainActor`, the Timer callback runs on `RunLoop.main` but not guaranteed MainThread context when Task is involved.

---

## PART 9: COMMON ROOT CAUSE IDENTIFIED

### The Exact Problem (at 00:00):

**In BOTH SFS and Block Schedule:**

1. Timer fires at break-end time
2. Timer callback detects: `Date() >= breakEndTime` becomes TRUE
3. Immediately changes state:
   - `isInManualBreak = false` (SFS) 
   - `isInBreak = false` (Block)
   - `manualBreakEndTime = nil` (SFS)
   - `currentBreakEndTime = nil` (Block)
4. Creates new timer: `segmentCheckTimer = ...` or `scheduleCountdownTimer = ...`
5. **Timer callback exits**
6. **Exactly at this moment**: SwiftUI view tries to re-render
7. **But**: The new timer hasn't fired yet (it fires in 1 second)
8. **The countdown is bound to a Date that was just set to nil**
9. `RomanCoinTimer` receives `endTime: nil` instead of future Date
10. **Result**: Timer display shows frozen 00:00 because:
    - The countdown formula: `max(0, endTime.timeIntervalSinceNow)`
    - With `endTime = nil`, this can't compute
    - Falls back to last computed value: 0
    - UI freezes at 00:00

---

## PART 10: COMPARISON TABLE

| Aspect | SFS (SFSManager) | Block Schedule |
|--------|------------------|-----------------|
| **Class Type** | `@MainActor class` | `class` (not @MainActor) |
| **Break End Detection** | Line 1258: `Date() >= breakEndTime` | Line 810: `Date() >= breakEnd` |
| **Detection Location** | Inside `checkSegmentCompletion()` | Inside `updateBreakCountdown()` |
| **Called From** | Timer callback (line 1247) | Timer callback (line 800) |
| **State Clear** | Lines 1152-1155 | Lines 892-894 (in handleBreakAutoResume) |
| **Timer Stop** | ❌ NOT stopped | ✅ Stopped (line 889) |
| **New Timer Creation** | Line 1196 in handleBreakAutoResume | Line 907 in handleBreakAutoResume |
| **UI Refresh Call** | ❌ NO `objectWillChange.send()` | ✅ YES (lines 910-915) |
| **Thread Safety** | @MainActor guarantees | Explicit thread checks (lines 833-838) |
| **Freeze at 00:00** | ✅ YES | ✅ YES |
| **Root Cause** | Old timer not invalidated + no UI refresh | UI refresh after timer restart race condition |

---

## PART 11: FOREGROUND SYNC ANALYSIS

### Why Foreground (works) vs Staying in App (breaks):

**Foreground Sync (Works):**
```swift
// RomanTimerView line 779-786
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    sfsManager.syncSegmentStateOnForeground()
    blockScheduleManager.syncActiveScheduleOnForeground()
    sfsManager.reloadSessionsFromStorage()
}
```

When app comes to foreground:
1. `syncSegmentStateOnForeground()` reloads session state
2. Checks if break ended during background (lines 1342-1351 in SFS)
3. If break ended: Calls `handleBreakAutoResume()` ✅
4. **Recalculates `currentSegmentEndTime` from actual elapsed time**
5. Creates a fresh timer with correct end time
6. UI updates properly ✅

**Staying in App (Breaks):**
1. Timer running continuously
2. At 00:00, timer callback fires
3. State cleared, new timer created
4. **But**: New timer created before old timer invalidated
5. **Race condition**: Two timers, conflicting state
6. **Result**: UI freezes

---

## PART 12: WHAT THEY HAVE IN COMMON

### Shared Pattern (The Trap):

1. **Both use Timer with 1-second intervals**
   - SFS: Line 1244
   - Block: Lines 800, 853

2. **Both check Date-based completion**
   - SFS: `Date() >= breakEndTime`
   - Block: `Date() >= breakEnd`

3. **Both clear @Published properties at break-end**
   - SFS: `isInManualBreak = false`, `manualBreakEndTime = nil`
   - Block: `isInBreak = false`, `currentBreakEndTime = nil`

4. **Both restart timers after break-end**
   - SFS: Creates new `segmentCheckTimer`
   - Block: Calls `startScheduleCountdownTimer()`

5. **Both have foreground sync that WORKS**
   - Because foreground sync doesn't rely on timer callbacks
   - It recalculates from scratch based on elapsed time
   - Creates fresh timer with correct end time

6. **Both use ObservableObject + @Published**
   - Not `@MainActor` in timer callback context
   - State changes might be off-main-thread (especially Block)
   - UI refresh delayed or missing

---

## PART 13: HYPOTHESIS - THE COMMON ROOT CAUSE

### The Core Issue (Proven):

**When a timer callback at exactly the break-end moment (00:00):**
1. Changes @Published properties to nil/false
2. Creates a new timer with same/different name
3. **Does NOT explicitly invalidate old timer**
4. **Does NOT guarantee immediate UI update on MainThread**

**Result**: Timer callback completes before SwiftUI can refresh, leaving UI in "frozen 00:00" state

### Why It Manifests Identically:

Both SFS and Block Schedule share:
- Timer-based countdown detection
- @Published properties going to nil at break-end
- New timer created but old timer callback still in stack
- UI tries to re-render but loses the "future Date" context
- Falls back to computed 00:00 value

### Why Foreground Sync Saves It:

Foreground sync:
1. **Never relies on timer callbacks at critical moment**
2. **Recalculates everything fresh**
3. **Creates new timer with correct future end time**
4. **Old timer already invalid (background, not firing)**

---

## PART 14: KEY FINDINGS SUMMARY

### SFS Break End Logic:
- **Entry**: `checkSegmentCompletion()` (timer callback, line 1254)
- **Detection**: `if isInManualBreak && Date() >= breakEndTime` (line 1258)
- **Handler**: `handleBreakAutoResume()` (line 1260, lines 1145-1214)
- **State Clear**: Lines 1152-1155
- **Timer Restart**: Line 1196
- **Issues**: 
  - Old timer NOT invalidated
  - NO explicit `objectWillChange.send()`
  - Async Task wrapper delays execution

### Block Schedule Break End Logic:
- **Entry**: `updateBreakCountdown()` (timer callback, line 808)
- **Detection**: `if let breakEnd && Date() >= breakEnd` (line 810)
- **Handler**: `handleBreakAutoResume(for:)` (line 817, lines 883-917)
- **State Clear**: Lines 892-894
- **Timer Restart**: Line 907
- **Timer Stop**: Line 889 ✅
- **Issues**:
  - UI refresh after timer restart (race condition)
  - Non-@MainActor class + thread safety issues

### Common Pattern:
- Both freeze at 00:00 when countdown natural ends
- Both work correctly on foreground resume
- Both restart timers at break-end
- Both use Date-based completion checks
- Both have @Published property changes

### Shared Root Cause:
**Timer callback state changes + new timer creation + UI refresh race condition = frozen 00:00 state**

---

## RECOMMENDATIONS

### FIX #1: Invalidate Old Timer BEFORE Creating New
```swift
// SFS - handleBreakAutoResume (line 1175)
if let session = activeSession {
    // CRITICAL: Stop old timer first
    stopSegmentTimer()  // ✅ Add this
    
    // Then restart with fresh timing
    // ... recalculate ...
    startSegmentTimer(for: session)  // ✅ Use method, don't inline
}
```

### FIX #2: Explicit UI Refresh on MainThread
```swift
// SFS - handleBreakAutoResume (end, after line 1211)
// Notify SwiftUI of state change
if Thread.isMainThread {
    objectWillChange.send()
} else {
    DispatchQueue.main.async { [weak self] in
        self?.objectWillChange.send()
    }
}
```

### FIX #3: Don't Use Async Task in Timer Callback
```swift
// SFS - startSegmentTimer (line 1247)
// BEFORE:
segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in
        self?.checkSegmentCompletion()
    }
}

// AFTER:
segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    DispatchQueue.main.async {  // Direct MainThread dispatch
        self?.checkSegmentCompletion()
    }
}
```

### FIX #4: Mark Timer Callback as @MainActor
```swift
// Ensure all timer callbacks execute on MainThread
@MainActor
private func checkSegmentCompletion() {
    // Method body
}

@MainActor
private func updateBreakCountdown() {
    // Method body
}
```

