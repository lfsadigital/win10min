# TimerManager MainActor Fix - Implementation Guide

## CHANGE 1: Add @MainActor to Class Declaration (Line 10)

### BEFORE:
```swift
class TimerManager: ObservableObject {
```

### AFTER:
```swift
@MainActor
class TimerManager: ObservableObject {
```

**Why**: Makes all methods and properties implicitly MainActor, eliminating isolation violations.

---

## CHANGE 2: Remove Redundant @MainActor from startTimerWithTask (Line 108)

### BEFORE:
```swift
    @MainActor
    func startTimerWithTask(_ taskName: String) {
```

### AFTER:
```swift
    func startTimerWithTask(_ taskName: String) {
```

**Why**: Now inherited from class-level @MainActor annotation.

---

## CHANGE 3: Remove Redundant @MainActor from startTimer (Line 122)

### BEFORE:
```swift
    @MainActor
    func startTimer() {
```

### AFTER:
```swift
    func startTimer() {
```

**Why**: Now inherited from class-level @MainActor annotation.

---

## CHANGE 4: Clean Up init() - Remove Unnecessary DispatchQueue.main (Line 73)

### BEFORE:
```swift
    init() {
        // Restore session state on next run loop (after managers are set in PandaAppApp.init)
        DispatchQueue.main.async { [weak self] in
            self?.restoreSessionState()
        }
    }
```

### AFTER:
```swift
    init() {
        // Restore session state on next run loop (after managers are set in PandaAppApp.init)
        // Now safe to call directly since entire class is @MainActor
        DispatchQueue.main.async { [weak self] in
            self?.restoreSessionState()
        }
    }
```

**Note**: Actually, we should KEEP this because init() might be called from a non-main thread context (like during object creation in background thread). The class-level @MainActor doesn't guarantee that init() is called on main thread. So leave this as-is but add comment explaining why.

---

## CHANGE 5: Simplify handleBreakEnd() - Remove Unnecessary DispatchQueue.main (Line 295)

### BEFORE:
```swift
        } else if wasShortBreak && autoContinueEnabled && !lastTaskName.isEmpty {
            debugLog.log("🔄 Short break ended - auto-continuing with task: \(lastTaskName)")
            // Auto-continue with the same task
            shouldAutoContinue = true
            currentTaskName = lastTaskName
            // Automatically start the next session after a brief delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self = self else { return }
                // Only auto-start if we're still in the right state
                if self.shouldAutoContinue && !self.isRunning {
                    self.startTimerWithTask(self.lastTaskName)
                }
            }
```

### AFTER:
```swift
        } else if wasShortBreak && autoContinueEnabled && !lastTaskName.isEmpty {
            debugLog.log("🔄 Short break ended - auto-continuing with task: \(lastTaskName)")
            // Auto-continue with the same task
            shouldAutoContinue = true
            currentTaskName = lastTaskName
            // Automatically start the next session after a brief delay
            Task {
                try? await Task.sleep(nanoseconds: 500_000_000)  // 0.5 seconds
                guard self.shouldAutoContinue && !self.isRunning else { return }
                self.startTimerWithTask(self.lastTaskName)
            }
```

**Why**: Now that class is @MainActor, we can use Task.sleep directly (it runs on main thread).
**Alternative**: Could also keep the DispatchQueue.main.asyncAfter - it still works, just more explicit.

---

## CHANGE 6: Simplify handleAppBecomeActive() - Remove Unnecessary DispatchQueue.main (Line 660)

### BEFORE:
```swift
        } else {
            debugLog.log("✅ User returned - no warning was active")
        }
    }
    
    
    // MARK: - Live Activity Management
```

**Wait, let me find the exact line...**

The DispatchQueue.main.asyncAfter is here:
```swift
            if isRunning && currentSessionType == .focus {
                debugLog.log("💬 Showing 'almost lost focus' warning")
                showReturnWarning = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    self.showReturnWarning = false
                }
            }
```

### AFTER:
```swift
            if isRunning && currentSessionType == .focus {
                debugLog.log("💬 Showing 'almost lost focus' warning")
                showReturnWarning = true
                
                Task {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)  // 3 seconds
                    self.showReturnWarning = false
                }
            }
```

**Why**: Now that class is @MainActor, we can use Task.sleep directly.
**Alternative**: Could keep the DispatchQueue.main.asyncAfter - it still works.

---

## IMPORTANT: Methods to KEEP UNCHANGED

### DO NOT MODIFY: Task.detached blocks (Lines 179, 939)

These are specifically designed to run background work OFF the main thread. Keep them exactly as-is:

```swift
// Line 179: Blocking manager on background thread
Task.detached { [weak self] in
    guard let self = self else { return }
    
    self.debugLog.log("🚫 Starting app blocking")
    let authorized = await self.blockingManager.requestAuthorizationIfNeeded()
    
    await MainActor.run {  // ✅ KEEP: Explicitly return to main thread
        if authorized {
            self.debugLog.log("✅ Authorization confirmed - blocking apps")
            let isPremium = self.premiumManager?.isPremium ?? false
            self.blockingManager.startBlocking(isPremium: isPremium)
        }
    }
}
```

```swift
// Line 939: Track focus minutes on background thread
Task.detached { [weak self] in
    guard let self = self else { return }
    // ... background database operations ...
    
    Task { @MainActor in  // ✅ KEEP: Return to main thread for UI
        EmpireGrowthManager.shared.saveDailySnapshot()
    }
}
```

### DO NOT MODIFY: MainActor.run blocks (6 locations)

These are still needed for returning from background threads to main thread:

```swift
// Line 185: In Task.detached for app blocking
await MainActor.run {
    if authorized {
        // ... update UI ...
    }
}

// Line 211: In Task for city construction
await MainActor.run {
    cityManager.constructBuilding(...)
}

// Line 732: In updateLiveActivity()
Task { @MainActor in
    if #available(iOS 16.2, *) {
        // ... update live activity ...
    }
}
```

Keep all of these - they're still necessary.

### DO NOT MODIFY: Existing @Published properties

All 20+ @Published properties remain unchanged.

### DO NOT MODIFY: Timer creation (Lines 158, 320, 618)

The Timer.scheduledTimer calls remain unchanged. They run on main thread by default, which is fine.

---

## TESTING STRATEGY

After making the changes, test these flows:

1. **Start a focus session** → Verify timer starts and counts down
2. **Complete a focus session** → Verify task completion view shows
3. **Confirm break** → Verify break starts and counts down
4. **Skip break** → Verify back to focus session
5. **Auto-continue** → Verify short break auto-continues next focus
6. **Pause/Stop session** → Verify state updates correctly
7. **Block schedules** → Verify apps block correctly in background
8. **Background test** → Switch to another app during session, return, verify countdown continues
9. **Build in Xcode** → Should have NO warnings about MainActor isolation

---

## SUMMARY OF CHANGES

| Line | Change | Type | Impact |
|------|--------|------|--------|
| 10 | Add @MainActor to class | Critical | Fixes all isolation violations |
| 73 | Keep DispatchQueue.main.async | N/A | Already correct (init might not be on main) |
| 108 | Remove @MainActor from startTimerWithTask | Minor | Redundant with class-level annotation |
| 122 | Remove @MainActor from startTimer | Minor | Redundant with class-level annotation |
| 295 | Optional: Task.sleep instead of DispatchQueue.main | Minor | Cleaner, but either works |
| 660 | Optional: Task.sleep instead of DispatchQueue.main | Minor | Cleaner, but either works |
| 179 | Keep Task.detached + MainActor.run | N/A | Still needed for background work |
| 939 | Keep Task.detached + MainActor.run | N/A | Still needed for background work |
| All | Keep all existing MainActor.run blocks | N/A | Still needed for returning from background |

---

## COMMIT MESSAGE

```
Fix MainActor isolation violations in TimerManager

- Add @MainActor to class declaration to eliminate isolation warnings
- Removes need for individual @MainActor annotations on methods
- Fixes cascading error where skipBreak() and confirmBreak() call @MainActor startTimer()
- Maintains all existing functionality and performance
- Keeps Task.detached for background work (app blocking, database operations)
- Keeps MainActor.run for returning from background threads

This resolves the critical issue where non-MainActor methods were calling
@MainActor methods, which would cause Swift 6.0 strict concurrency errors.

The entire TimerManager class is UI-bound and runs on the main thread,
so class-level @MainActor annotation is the correct approach.
```

