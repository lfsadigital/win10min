# TimerManager Main Actor Isolation Errors - Comprehensive Analysis

## File Location
`/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/TimerManager.swift`

## Summary
**Is TimerManager marked @MainActor?** YES (line 10)

The class is correctly marked with `@MainActor`, but Timer.scheduledTimer closures are Sendable by default (nonisolated context), creating isolation conflicts when they try to access main actor-isolated properties and methods.

---

## Error Location 1: Line 158 - updateTimerBasedOnElapsedTime() Call

**Code:**
```swift
// Line 157-159
timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    self.updateTimerBasedOnElapsedTime()
}
```

**Error:**
```
Call to main actor-isolated instance method 'updateTimerBasedOnElapsedTime()' 
in a synchronous nonisolated context
```

**Root Cause:**
- Timer.scheduledTimer closure is Sendable (nonisolated)
- Calling a @MainActor method (`updateTimerBasedOnElapsedTime()`) from nonisolated context
- `self` is captured in the closure but the closure doesn't have @MainActor isolation

---

## Error Locations 2-4: Lines 320, 323, 326 - Break Confirmation Timer

**Code:**
```swift
// Lines 319-328
breakConfirmationTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    self.breakConfirmationTimeRemaining -= 1  // Line 320 ERROR
    
    if self.breakConfirmationTimeRemaining <= 0 {
        self.breakConfirmationTimer?.invalidate()      // Line 323 ERROR
        self.breakConfirmationTimer = nil
        self.confirmBreak()                            // Line 326 ERROR
    }
}
```

**Errors:**
```
Line 320: Main actor-isolated property 'breakConfirmationTimeRemaining' 
          can not be mutated from a Sendable closure

Line 323: Main actor-isolated property 'breakConfirmationTimer' 
          can not be referenced from a Sendable closure

Line 326: Call to main actor-isolated instance method 'confirmBreak()' 
          in a synchronous nonisolated context
```

**Root Cause:**
- Same Sendable closure isolation issue
- Cannot mutate @Published properties directly from Sendable context
- Cannot call main actor methods from Sendable context

---

## Error Locations 3-4: Lines 625, 627 - Warning Timer

**Code:**
```swift
// Lines 617-630
warningTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    warningCountdown -= 1
    self?.debugLog.log("⏱️ Warning countdown: \(warningCountdown) seconds remaining")
    
    if warningCountdown <= 0 {
        self?.debugLog.log("💥 Warning countdown expired - failing session!")
        self?.warningTimer?.invalidate()
        self?.warningTimer = nil              // Line 625 ERROR
        self?.isWarningCountdownActive = false
        self?.failSession()                   // Line 627 ERROR
    }
}
```

**Errors:**
```
Line 625: Main actor-isolated property 'warningTimer' 
          can not be mutated from a Sendable closure

Line 627: Call to main actor-isolated instance method 'failSession()' 
          in a synchronous nonisolated context
```

**Root Cause:**
- Same Sendable closure issue with [weak self] capture
- Cannot mutate warningTimer property from nonisolated context
- Cannot call failSession() from nonisolated context

---

## Successful Pattern Found in Same File

**Location:** Lines 170-175 (startSession method - WORKING)

```swift
Task { @MainActor in
    debugLog.log("📱 Starting Live Activity for focus session")
    startLiveActivity()
    saveWidgetData()
}
```

**Why It Works:**
- Uses `Task { @MainActor in }` to explicitly transition into MainActor context
- All main actor operations happen inside the MainActor-isolated closure
- No isolation conflicts

**Another Successful Pattern:** Lines 482-489 (scheduleCompletionNotification - WORKING)

```swift
Task { @MainActor in
    do {
        try await UNUserNotificationCenter.current().add(request)
        debugLog.log("✅ Scheduled completion notification...")
    } catch {
        debugLog.log("❌ Failed to schedule notification: \(error)")
    }
}
```

**Why It Works:**
- Uses `Task { @MainActor in }` for async operations
- Can handle async/await while maintaining MainActor isolation
- Properly transitions from nonisolated context to MainActor context

---

## Problem Pattern Comparison

### WRONG (Current - Causes Errors):
```swift
timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    self.updateTimerBasedOnElapsedTime()  // ERROR: nonisolated context
    self.breakConfirmationTimeRemaining -= 1  // ERROR: mutation in nonisolated
}
```

### CORRECT (Recommended):
```swift
timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in
        self?.updateTimerBasedOnElapsedTime()
    }
}
```

Or better yet, use the existing "successful async pattern" already in the file:

```swift
Task { @MainActor in
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        Task { @MainActor in
            self?.updateTimerBasedOnElapsedTime()
        }
    }
}
```

---

## Three Timer Issues That Need Fixing

### 1. Main Timer (Line 157-159)
**Current Code:**
```swift
timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    self.updateTimerBasedOnElapsedTime()
}
```

**Issue:** Calling MainActor method from nonisolated Timer closure

**Fix Pattern:**
```swift
timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in
        self?.updateTimerBasedOnElapsedTime()
    }
}
```

### 2. Break Confirmation Timer (Line 319-328)
**Current Code:**
```swift
breakConfirmationTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    self.breakConfirmationTimeRemaining -= 1
    if self.breakConfirmationTimeRemaining <= 0 {
        self.breakConfirmationTimer?.invalidate()
        self.breakConfirmationTimer = nil
        self.confirmBreak()
    }
}
```

**Issue:** Property mutation and method calls from nonisolated closure

**Fix Pattern:**
```swift
breakConfirmationTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in
        self?.breakConfirmationTimeRemaining -= 1
        if self?.breakConfirmationTimeRemaining ?? 0 <= 0 {
            self?.breakConfirmationTimer?.invalidate()
            self?.breakConfirmationTimer = nil
            self?.confirmBreak()
        }
    }
}
```

### 3. Warning Timer (Line 617-629)
**Current Code:**
```swift
warningTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    warningCountdown -= 1
    if warningCountdown <= 0 {
        self?.warningTimer?.invalidate()
        self?.warningTimer = nil
        self?.failSession()
    }
}
```

**Issue:** Property mutation and method call from nonisolated closure

**Fix Pattern:**
```swift
warningTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in
        warningCountdown -= 1
        if warningCountdown <= 0 {
            self?.warningTimer?.invalidate()
            self?.warningTimer = nil
            self?.failSession()
        }
    }
}
```

---

## Recommended Fix Pattern

The file already uses `Task { @MainActor in }` successfully in multiple places. The solution is to wrap all Timer closure operations that access MainActor-isolated properties/methods:

```swift
// PATTERN: Wrap Timer closure content in Task { @MainActor in }
timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
    Task { @MainActor in
        // All MainActor operations here
        self?.updateTimerBasedOnElapsedTime()
    }
}
```

**Key Points:**
1. Use `[weak self]` in the Timer closure to avoid retain cycles
2. Wrap the closure body in `Task { @MainActor in }` to transition context
3. Use optional chaining (`self?.`) since self is weak and might be nil
4. This pattern is already proven working in lines 170-175, 482-489, 496-505, 521-530, 550-580, 731-740, 988-1000

---

## Files to Modify

1. **TimerManager.swift**
   - Line 157-159: Main timer closure
   - Line 319-328: Break confirmation timer closure
   - Line 617-629: Warning timer closure

## Implementation Note

All three timers follow the same pattern: they're creating Timer.scheduledTimer closures that need to access MainActor-isolated properties and methods. The fix for all three is consistent: wrap the Timer closure content in `Task { @MainActor in }`.

The file already contains successful examples of this pattern, so this is a straightforward refactoring to apply the proven pattern to the remaining cases.
