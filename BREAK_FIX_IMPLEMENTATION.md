# Break System Fix Implementation Guide

**Created**: November 10, 2025  
**Status**: Ready for implementation  
**Estimated Time**: 3-4 hours total

---

## QUICK SUMMARY

**SFS Problem**: Apps re-lock when app foregrounded during break  
**Block Schedule Problem**: No countdown visible during break  
**Solution**: Apply working patterns from each to the other

---

## FIX 1: SFS Re-Locking Bug (CRITICAL - 2 hours)

### File: `SFSManager.swift`

**Location**: `syncSegmentStateOnForeground()` method (lines 1269-1366)

**Changes Required**:

#### Step 1: Add State Loading Helper (NEW METHOD)

```swift
// Add this method after line 1366
/// Load break state from App Group storage
private func loadBreakStateFromStorage() {
    guard let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: "group.com.luiz.PandaApp"
    ) else {
        debugLog.log("⚠️ Cannot access App Group for break state")
        return
    }
    
    let breakEndTimeURL = containerURL.appendingPathComponent("manualBreakEndTime.txt")
    
    if FileManager.default.fileExists(atPath: breakEndTimeURL.path) {
        do {
            let timeString = try String(contentsOf: breakEndTimeURL, encoding: .utf8)
            if let timeInterval = TimeInterval(timeString) {
                let endTime = Date(timeIntervalSince1970: timeInterval)
                
                // Only set if break hasn't ended yet
                if endTime > Date() {
                    self.manualBreakEndTime = endTime
                    self.isInManualBreak = true
                    debugLog.log("✅ Break state loaded from storage")
                    debugLog.log("  → Break ends at: \(endTime)")
                } else {
                    debugLog.log("⏱️ Break already ended - clearing stale state")
                    // Break ended while app was closed - clean up
                    try? FileManager.default.removeItem(at: breakEndTimeURL)
                    self.isInManualBreak = false
                    self.manualBreakEndTime = nil
                }
            }
        } catch {
            debugLog.log("❌ Failed to load break state: \(error)")
        }
    } else if isInManualBreak {
        // File doesn't exist but flag is set - clear stale state
        debugLog.log("🧹 Clearing stale break flag (no file found)")
        self.isInManualBreak = false
        self.manualBreakEndTime = nil
    }
}
```

---

#### Step 2: Update `syncSegmentStateOnForeground()` (MODIFY EXISTING)

**Replace lines 1269-1366 with**:

```swift
/// Sync segment state when app comes to foreground
/// Recalculates which segment we're in based on Date comparison
func syncSegmentStateOnForeground() {
    debugLog.log("🔄 Syncing SFS state on foreground")
    
    // 🆕 CRITICAL FIX: Load break state FIRST
    loadBreakStateFromStorage()
    
    // CRITICAL FIX: Reload session from storage to get latest state
    // This is essential for manual breaks which extend the session start time
    if let savedSession = storage.loadActiveSession() {
        self.activeSession = savedSession
        debugLog.log("  → Reloaded session from storage (may have extended start time)")
    }
    
    // CRITICAL FIX: Check if manual break ended while app was backgrounded
    if isInManualBreak {
        if let breakEndTime = manualBreakEndTime, Date() >= breakEndTime {
            debugLog.log("  → ⏱️ MANUAL BREAK RESUME DETECTED - break ended during background")
            handleBreakAutoResume()
            return  // CRITICAL: Don't continue to shield sync - break just ended
        } else {
            debugLog.log("  → In manual break - still active")
            debugLog.log("  → Break ends in: \(Int(manualBreakEndTime?.timeIntervalSinceNow ?? 0))s")
        }
    }
    
    // 🆕 CRITICAL FIX: NEVER re-apply shields in the app during foreground sync
    // Let the extension handle ALL shield management via DeviceActivity intervals
    guard !isInManualBreak else {
        debugLog.log("  → In manual break - skipping ALL shield/segment sync")
        debugLog.log("  → Extension will handle shield restoration when break ends")
        return
    }
    
    guard let session = activeSession,
          let startTime = session.scheduledStartTime,
          isSessionActive else {
        debugLog.log("  → No active session for segment sync")
        return
    }
    
    let now = Date()
    let elapsed = now.timeIntervalSince(startTime)
    
    debugLog.log("🔄 Syncing segment state on foreground")
    debugLog.log("  → Elapsed since session start: \(Int(elapsed))s")
    
    // Session hasn't started yet
    guard elapsed >= 0 else {
        debugLog.log("  → Session hasn't started yet")
        return
    }
    
    // Build timeline to find current segment (tasks only, no automatic breaks)
    var timeline: [(duration: TimeInterval, isTask: Bool)] = []
    for (index, task) in session.tasks.enumerated() {
        timeline.append((task.duration, true))
        // No automatic breaks between tasks
    }
    
    // Find which segment we're in
    var cumulativeTime: TimeInterval = 0
    var taskIndex = 0
    
    for (segmentIdx, segment) in timeline.enumerated() {
        let segmentEnd = cumulativeTime + segment.duration
        
        if elapsed >= cumulativeTime && elapsed < segmentEnd {
            // We're in this segment!
            let segmentType = segment.isTask ? "task" : "break"
            taskIndex = segmentIdx / 2
            
            debugLog.log("  → Currently in \(segmentType) \(taskIndex + 1)")
            debugLog.log("  → Segment ends in \(Int(segmentEnd - elapsed))s")
            
            // Update state
            currentTaskIndex = taskIndex
            isInBreak = !segment.isTask
            currentSegmentEndTime = startTime.addingTimeInterval(segmentEnd)
            
            // 🆕 CRITICAL CHANGE: DO NOT re-apply shields here
            // Extension handles ALL shield state transitions
            // App only updates UI state for countdown purposes
            debugLog.log("  → Updated UI state (extension handles shields)")
            
            // Restart timer if not running (for UI countdown updates)
            if segmentCheckTimer == nil {
                segmentCheckTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                    self?.checkSegmentCompletion()
                }
                debugLog.log("  → Restarted segment timer for UI countdown")
            }
            
            return
        }
        
        cumulativeTime = segmentEnd
    }
    
    // Session completed
    debugLog.log("  → Session completed while backgrounded")
    stopSegmentTimer()
}
```

**Key Changes**:
1. ✅ Load break state from file FIRST
2. ✅ Check if break ended during background
3. ✅ Early return if still in break
4. ❌ **REMOVED**: All `AppBlockingManager.startBlocking()` calls
5. ❌ **REMOVED**: All `AppBlockingManager.pauseBlockingForBreak()` calls
6. ✅ Only update UI state (countdown timers)

---

#### Step 3: Test Plan

**Test 1: Break → Leave → Return**
```
1. Start SFS session
2. Start manual break
3. Verify: Apps unlocked ✅
4. Verify: Countdown showing ✅
5. Press home button (leave app)
6. Wait 5 seconds
7. Return to app
8. **EXPECTED**: Apps still unlocked ✅
9. **EXPECTED**: Countdown still showing ✅
```

**Test 2: Break → Leave → Break Ends → Return**
```
1. Start SFS session
2. Start manual break (2 min)
3. Leave app
4. Wait 3 minutes (break ends)
5. Return to app
6. **EXPECTED**: Apps re-locked (break ended) ✅
7. **EXPECTED**: Session countdown resumed ✅
```

**Test 3: Force Quit → Relaunch**
```
1. Start SFS session
2. Start manual break
3. Force quit app (swipe up in app switcher)
4. Relaunch app
5. **EXPECTED**: Break state restored ✅
6. **EXPECTED**: Apps unlocked ✅
7. **EXPECTED**: Countdown showing ✅
```

---

## FIX 2: Block Schedule Countdown (HIGH - 1-2 hours)

### File 1: `BlockScheduleManager.swift`

**Location**: `startBreak(for:)` method (lines 671-725)

**Changes Required**:

#### Step 1: Save Break End Time to App Group

**Add after line 713** (after `currentBreakEndTime = breakEndTime`):

```swift
// NEW: Save break end time to App Group for widget countdown
if let containerURL = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.luiz.PandaApp"
) {
    let breakEndTimeURL = containerURL.appendingPathComponent("blockScheduleBreakEndTime.txt")
    let timeIntervalString = "\(breakEndTime.timeIntervalSince1970)"
    do {
        try timeIntervalString.write(to: breakEndTimeURL, atomically: true, encoding: .utf8)
        debugLog.log("💾 Saved break end time to App Group for widget: \(breakEndTime)")
    } catch {
        debugLog.log("❌ Failed to save break end time: \(error.localizedDescription)")
    }
}
```

---

#### Step 2: Clear Break End Time on Resume

**Location**: `handleBreakAutoResume(for:)` method (lines 728-747)

**Add after line 740** (after `storage.clearBreakState()`):

```swift
// Clear break end time file from App Group
if let containerURL = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.luiz.PandaApp"
) {
    let breakEndTimeURL = containerURL.appendingPathComponent("blockScheduleBreakEndTime.txt")
    do {
        if FileManager.default.fileExists(atPath: breakEndTimeURL.path) {
            try FileManager.default.removeItem(at: breakEndTimeURL)
            debugLog.log("🧹 Cleared break end time file from App Group")
        }
    } catch {
        debugLog.log("❌ Failed to clear break end time file: \(error.localizedDescription)")
    }
}
```

---

### File 2: `FocusSessionWidget.swift`

**Add Helper Method** (after `loadManualBreakEndTime()` method):

```swift
/// Load Block Schedule break end time from App Group
private func loadBlockScheduleBreakEndTime() -> Date? {
    guard let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: "group.com.luiz.PandaApp"
    ) else {
        return nil
    }
    
    let fileURL = containerURL.appendingPathComponent("blockScheduleBreakEndTime.txt")
    
    guard FileManager.default.fileExists(atPath: fileURL.path),
          let timeString = try? String(contentsOf: fileURL, encoding: .utf8),
          let timeInterval = TimeInterval(timeString) else {
        return nil
    }
    
    let endTime = Date(timeIntervalSince1970: timeInterval)
    
    // Only return if break hasn't ended yet
    if endTime > Date() {
        return endTime
    }
    
    return nil
}
```

**Update Session Loading Logic** (find the Block Schedule section):

```swift
// PRIORITY 2: Check for Block Schedule (after SFS check, before regular)
if let blockSession = loadBlockScheduleSession() {
    // NEW: Check for break first
    if let breakEndTime = loadBlockScheduleBreakEndTime() {
        return Entry(
            date: Date(),
            taskName: "BREAK",
            category: nil,
            endTime: breakEndTime,
            totalDuration: Int(breakEndTime.timeIntervalSinceNow),
            sessionType: .blockSchedule,
            isInBreak: true
        )
    }
    
    // Not in break - show normal session
    return Entry(
        date: Date(),
        taskName: blockSession.name,
        category: nil,
        endTime: blockSession.endTime,
        totalDuration: blockSession.totalDuration,
        sessionType: .blockSchedule,
        isInBreak: false
    )
}
```

---

### File 3: `RomanTimerView.swift`

**Add Break Countdown UI** (find Block Schedule display section):

**Add after the existing Block Schedule UI** (~line 300-400):

```swift
// NEW: Block Schedule Break Countdown
if blockScheduleManager.isInBreak, 
   let breakEndTime = blockScheduleManager.currentBreakEndTime {
    VStack(spacing: 16) {
        // Break countdown timer
        Text(timeString(from: breakEndTime))
            .font(RomanTheme.Typography.romanNumbers(48))
            .foregroundColor(RomanTheme.Colors.laurelGreen)
            .tracking(2)
        
        // Break label
        Text("BREAK TIME")
            .font(RomanTheme.Typography.romanHeader(16))
            .foregroundColor(RomanTheme.Colors.laurelGreen)
            .tracking(1)
        
        // Time remaining text
        Text("Resume in \(timeRemainingString(from: breakEndTime))")
            .font(RomanTheme.Typography.romanBody(14))
            .foregroundColor(RomanTheme.Colors.stoneGray)
    }
    .onAppear { startBlockScheduleBreakTimer() }
    .onDisappear { stopBlockScheduleBreakTimer() }
}
```

**Add Timer Management** (in the same file, add these methods):

```swift
// Block Schedule break timer
private var blockScheduleBreakTimer: Timer?

private func startBlockScheduleBreakTimer() {
    stopBlockScheduleBreakTimer()
    blockScheduleBreakTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
        objectWillChange.send()
    }
}

private func stopBlockScheduleBreakTimer() {
    blockScheduleBreakTimer?.invalidate()
    blockScheduleBreakTimer = nil
}
```

**Add Helper Methods** (if not already present):

```swift
private func timeString(from date: Date) -> String {
    let remaining = max(0, date.timeIntervalSinceNow)
    let minutes = Int(remaining) / 60
    let seconds = Int(remaining) % 60
    return String(format: "%02d:%02d", minutes, seconds)
}

private func timeRemainingString(from date: Date) -> String {
    let remaining = max(0, date.timeIntervalSinceNow)
    let minutes = Int(remaining) / 60
    let seconds = Int(remaining) % 60
    
    if minutes > 0 {
        return "\(minutes)m \(seconds)s"
    } else {
        return "\(seconds)s"
    }
}
```

---

#### Test Plan

**Test 1: Widget Countdown**
```
1. Start Block Schedule
2. Start break
3. Check widget
4. **EXPECTED**: Shows "BREAK" ✅
5. **EXPECTED**: Shows countdown (e.g., "01:30") ✅
6. Wait 30 seconds
7. Check widget again
8. **EXPECTED**: Countdown updated (e.g., "01:00") ✅
```

**Test 2: Main App Countdown**
```
1. Start Block Schedule
2. Start break
3. Check Focus page
4. **EXPECTED**: Shows "BREAK TIME" ✅
5. **EXPECTED**: Shows countdown ✅
6. **EXPECTED**: Countdown updates every second ✅
```

**Test 3: Break End**
```
1. Start Block Schedule
2. Start break (1 min)
3. Wait for break to end
4. Check widget
5. **EXPECTED**: Shows session countdown (not break) ✅
6. Check Focus page
7. **EXPECTED**: Shows session UI (not break) ✅
```

---

## VALIDATION CHECKLIST

### SFS Fix Validation

- [ ] Break starts → apps unlock ✅
- [ ] Leave app during break → return → apps still unlocked ✅
- [ ] Countdown shows in widget during break ✅
- [ ] Countdown shows in main app during break ✅
- [ ] Break ends → apps auto-lock ✅
- [ ] Force quit → relaunch → break state restored ✅

### Block Schedule Fix Validation

- [ ] Break starts → apps unlock ✅
- [ ] Widget shows "BREAK" with countdown ✅
- [ ] Main app shows break countdown ✅
- [ ] Countdown updates every second ✅
- [ ] Leave app → return → countdown still showing ✅
- [ ] Break ends → widget shows session ✅
- [ ] Break ends → main app shows session ✅

---

## ROLLBACK PLAN

If issues occur during testing:

**SFS Rollback**:
```bash
git diff HEAD -- PandaApp/Models/SFSManager.swift > sfs_changes.patch
git checkout HEAD -- PandaApp/Models/SFSManager.swift
```

**Block Schedule Rollback**:
```bash
git diff HEAD -- PandaApp/Models/BlockScheduleManager.swift > block_changes.patch
git checkout HEAD -- PandaApp/Models/BlockScheduleManager.swift
```

---

## FILES MODIFIED SUMMARY

**SFS Fix** (1 file):
- `PandaApp/Models/SFSManager.swift`
  - Added: `loadBreakStateFromStorage()` method
  - Modified: `syncSegmentStateOnForeground()` method
  - Removed: All `AppBlockingManager` calls from foreground sync

**Block Schedule Fix** (3 files):
- `PandaApp/Models/BlockScheduleManager.swift`
  - Modified: `startBreak(for:)` - save break end time
  - Modified: `handleBreakAutoResume(for:)` - clear break end time
  
- `FocusSessionWidget/FocusSessionWidget.swift`
  - Added: `loadBlockScheduleBreakEndTime()` method
  - Modified: Session loading logic to check for break
  
- `PandaApp/Views/RomanTimerView.swift`
  - Added: Block Schedule break countdown UI
  - Added: Timer management methods
  - Added: Helper formatting methods

**Total**: 4 files, ~200 lines changed

---

## ESTIMATED TIME

- **SFS Fix**: 2 hours
  - Code changes: 1 hour
  - Testing: 1 hour
  
- **Block Schedule Fix**: 1-2 hours
  - Code changes: 1 hour
  - Testing: 30 minutes
  - UI polish: 30 minutes

**Total**: 3-4 hours

---

## SUCCESS CRITERIA

**SFS**:
- ✅ No re-locking during breaks
- ✅ Countdown visible in both widget and app
- ✅ State persists across force quit

**Block Schedule**:
- ✅ Countdown visible in both widget and app
- ✅ Countdown updates every second
- ✅ Correctly transitions from break to session

---

**END OF IMPLEMENTATION GUIDE**
