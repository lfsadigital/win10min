# PandaApp Session Management Architecture - Comprehensive Analysis

## EXECUTIVE SUMMARY

The PandaApp has THREE separate session management systems that are NOT fully coordinated:
1. **Regular Sessions** (TimerManager) - Traditional Pomodoro timer
2. **Super Focus Sessions (SFS)** (SFSManager) - Multi-task batch sessions with manual breaks
3. **Block Schedules** (BlockScheduleManager) - Recurring app blocking periods

Critical bugs stem from:
- Incomplete state synchronization across session types
- App foreground detection not triggering proper state refreshes
- Widget data not matching main app state
- Break state persistence incomplete
- Sub-task availability logic missing entirely

---

## ARCHITECTURE OVERVIEW

### 1. Session Managers (Three Independent Systems)

#### A. TimerManager (Regular Sessions)
- **File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/TimerManager.swift`
- **Scope**: Traditional Pomodoro-style sessions (focus → break → focus...)
- **Key Properties**:
  - `@Published var isRunning: Bool`
  - `@Published var timeRemaining: TimeInterval`
  - `@Published var currentSessionType: SessionType` (focus, shortBreak, longBreak)
- **Conflict Detection**: Lines 1179-1261 - Checks for SFS and Block Schedule conflicts BEFORE starting
- **Issue**: Conflict detection exists but may not prevent all cases

#### B. SFSManager (Super Focus Sessions)
- **File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/SFSManager.swift`
- **Scope**: Multi-task batching with manual breaks
- **Key Properties**:
  - `@Published var activeSession: SuperFocusSession?`
  - `@Published var isSessionActive: Bool`
  - `@Published var isInManualBreak: Bool` (CRITICAL FOR BUG #3)
  - `@Published var manualBreakEndTime: Date?`
  - `@Published var scheduledSessions: [SuperFocusSession]` (For future sessions)
- **Manual Break Flow** (Lines 916-1159):
  1. User clicks "TAKE BREAK" button
  2. `startManualBreak()` is called
  3. `AppBlockingManager.pauseBlockingForBreak()` removes shields
  4. Session start time extended by break duration (TIME EXTENSION trick)
  5. DeviceActivity resume interval scheduled for break end
  6. `isInManualBreak = true` and `manualBreakEndTime` set
  7. On foreground: `handleBreakAutoResume()` clears break state
- **Foreground Sync**: Lines 1263-1360 - `syncSegmentStateOnForeground()` should detect manual break end

#### C. BlockScheduleManager (App Blocking Schedules)
- **File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/BlockScheduleManager.swift`
- **Scope**: Recurring app blocking periods (separate from sessions)
- **Key Properties**:
  - `@Published var activeSchedule: BlockSchedule?`
  - `@Published var isInBreak: Bool`
  - `@Published var currentBreakEndTime: Date?`
- **Break System**: Lines 616-718 - Manual breaks with DeviceActivity resume
- **Monitoring**: 30-second timer (Line 162) checks for active schedule changes

---

### 2. App Blocking System (AppBlockingManager)

**File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/AppBlockingManager.swift`

**Key Methods**:
- `startBlocking(isPremium:)` - Lines 167-220: Applies shields via ManagedSettingsStore
- `pauseBlockingForBreak()` - Lines 276-280: Removes shields temporarily for breaks
- `resumeBlockingAfterBreak()` - Lines 281-283: Re-applies shields after break

**Critical Issue**: No validation that break state matches current session state

---

### 3. Widget Synchronization

**File**: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaAppWidget/FocusSessionWidget.swift`

**Data Files Shared via App Group** (`group.com.luiz.PandaApp`):
1. `sfsActiveSession.json` - Current SFS session
2. `sfsCurrentTaskIndex.txt` - Which task is active
3. `manualBreakEndTime.txt` - Break countdown (new)
4. `activeBlockSchedule.json` - Current Block Schedule (new)
5. `focusSessionData.json` - Regular session (fallback)

**Widget Priority** (Lines 129-206):
1. Check for SFS session
2. Check for Block Schedule
3. Fallback to regular session

**Issue**: Widget loads break data but may not sync when session state changes

---

## CRITICAL BUG ANALYSIS

### Bug #1: Break Countdown Missing / Animation Delayed (SFS Start)

**Symptoms**: 
- When starting SFS with "START NOW", no 5-second countdown appears
- Causes confusion about when session actually begins

**Root Cause**:
- Line 370 in SFSManager: `let startTime = now.addingTimeInterval(5)` delays session by 5 seconds
- Line 370-381: Creates `immediateSession` with delayed start time
- But RomanTimerView countdown logic (Lines 155-198) may not detect the 5-second delay

**Evidence**:
```swift
// SFSManager.swift:369-381
let startTime = now.addingTimeInterval(5)  // Wait for 5-second countdown
let immediateSession = SuperFocusSession(
    scheduledStartTime: startTime,  // Delayed start time
    ...
)
```

**Needed Fix**:
- RomanTimerView should show countdown when SFS start time is < 2 minutes away
- Check `sfsSegmentInfo?.segmentEndTime` against current time to calculate remaining countdown
- Display visual countdown to session start when delay is present

---

### Bug #2: Widget Showing Delays for SFS Countdown

**Symptoms**:
- Widget countdown doesn't sync with main app
- Starts with wrong time, then corrects

**Root Cause**:
- Widget loads data once per refresh cycle
- SFS break state saved to `manualBreakEndTime.txt` but widget may not read it
- Widget loads `sfsCurrentTaskIndex.txt` but not break state
- Lines 250-300 of FocusSessionWidget: Widget calculates task progress but doesn't check for break state

**Evidence**:
```swift
// FocusSessionWidget.swift:250-300
// Widget loads task index but NOT break state!
let taskIndexURL = containerURL.appendingPathComponent("sfsCurrentTaskIndex.txt")
// Never checks: containerURL.appendingPathComponent("manualBreakEndTime.txt")
```

**Needed Fix**:
- Widget should check for `manualBreakEndTime.txt` and use break countdown if present
- Add break state detection similar to SFS task detection

---

### Bug #3: Break Unblocks Apps But Re-blocks on App Foreground

**Symptoms**:
- During SFS manual break: Apps correctly unblock
- User leaves app during break and returns
- Apps get RE-BLOCKED before break ends

**Root Cause Chain**:
1. Manual break starts → `pauseBlockingForBreak()` removes shields
2. `isInManualBreak = true` and `manualBreakEndTime` set
3. User backgrounds app
4. User comes to foreground → RomanTimerView triggers foreground handling
5. **BUG**: `syncSegmentStateOnForeground()` (Lines 1263-1360) has guard at Line 1284 that skips sync if in break
6. But `syncShieldsWithExtension()` (Lines 1639-1671) is called separately and may RE-APPLY SHIELDS
7. No check that extension state matches app break state

**Code Evidence**:
```swift
// SFSManager.swift:1282-1287 - CORRECT (skips sync during break)
guard !isInManualBreak else {
    logger.debug("  → In manual break - skipping shield sync to prevent re-blocking")
    return
}

// But RomanTimerView.swift may call syncShieldsWithExtension() which doesn't check break state!
```

**Needed Fix**:
1. Ensure `syncShieldsWithExtension()` checks `isInManualBreak` before re-applying shields
2. When app comes to foreground during break: Check if `manualBreakEndTime` has passed
3. If break ended: Call `handleBreakAutoResume()` BEFORE any shield sync

---

### Bug #4: Sub-tasks Remain Available During Active/Scheduled SFS

**Symptoms**:
- User can click on SavedTasks and select them while SFS is active
- Gives false impression tasks are available
- Tasks should be disabled/unavailable during active SFS

**Root Cause**:
- SavedTask model (SavedTask.swift) has NO "availability" state
- SavedTasksView displays all tasks without checking SFS state
- No validation that prevents starting second SFS with same task

**Evidence**:
```swift
// SavedTask.swift - NO availability/disabled state
struct SavedTask: Identifiable, Codable {
    let id: UUID
    var text: String
    var category: String
    // NO: var isAvailable: Bool = true
    // NO: var isInActiveSFS: Bool = false
}
```

**SFSManager has task uniqueness check** (Lines 576-599):
```swift
// Prevents CREATING SFS with same task
if let savedTaskId = task.savedTaskId {
    if let activeSession = self.activeSession,
       activeSession.id != session.id {
        for activeTask in activeSession.tasks {
            if activeTask.savedTaskId == savedTaskId {
                throw SFSError.taskAlreadyInUse  // PREVENTS CREATION
            }
        }
    }
}
```

**But UI never shows this** - SavedTasksView should gray out tasks that are:
1. In active SFS session
2. In scheduled SFS session
3. Currently in active Block Schedule

**Needed Fix**:
- Add computed property to SavedTask: `var isAvailable: Bool { /* check managers */ }`
- SavedTasksView should disable tasks based on availability
- Visual feedback: gray out, add lock icon, tooltip explaining why unavailable

---

### Bug #5: Block Schedule Activated During Active SFS (Should Skip)

**Symptoms**:
- User can create Block Schedule while SFS is active
- Both run simultaneously
- No mutual exclusivity enforcement

**Root Cause Analysis**:

**TimerManager** has mutual exclusivity check (Lines 1179-1261):
- Prevents Regular Sessions from starting during SFS/Block Schedule
- Uses `MainActor` to safely access other managers

**BlockScheduleManager** has partial checks (Lines 229-303):
- Checks if SFS session is active (Lines 238-248)
- Checks ALL scheduled SFS sessions (Lines 251-264)
- But these checks happen in VALIDATION phase (Line 226)
- If validation passes, schedule is ADDED to array (Line 307)
- **ISSUE**: DeviceActivity scheduling (Line 314) might fail, but schedule stays in array

**SFSManager** checks Block Schedules (Lines 323-367):
- Checks for active Block Schedule (Lines 324-327)
- Checks all enabled Block Schedules (Lines 339-367)
- But only checks BEFORE `createDeviceActivitySchedule()` (Line 393)

**The Problem**: Schedule state vs DeviceActivity monitoring state mismatch
```swift
// BlockScheduleManager.swift:306-325
schedules.append(schedule)  // Added to array FIRST
storage.saveSchedules(schedules)  // Persisted
// THEN try DeviceActivity
try await scheduleBlockActivities(for: schedule)  // Might fail!
```

If DeviceActivity scheduling fails, schedule is STILL in memory and storage but NOT actually monitored!

**Needed Fix**:
1. Reorder: Validate → Try DeviceActivity → Only THEN add to array
2. Add rollback on failure (Lines 317-321 have rollback but AFTER adding)
3. Check mutual exclusivity at ACTIVATION time, not just creation time

---

### Bug #6: "Cancel Entire Session" Button Not Working for SFS

**Symptoms**:
- Cancel button doesn't actually stop SFS
- Apps remain blocked after cancellation

**Root Cause**:
- `stopSession()` method exists (Lines 782-848) but may not be called
- Or called but doesn't properly clear all state

**Evidence**:
```swift
// SFSManager.swift:782-848 - stopSession() should:
// 1. Stop segment timer ✓
// 2. Cancel notifications ✓
// 3. Stop DeviceActivity monitoring ✓
// 4. Clear shields ✓ (Lines 806-809)
// 5. Clear storage ✓ (Lines 812-815)
// 6. Reset state ✓ (Lines 835-841)
```

**Possible Issue**: UI not calling this method
- Check RomanTimerView for cancel button handler
- May be calling wrong method or not awaiting completion

---

### Bug #7: Can't Edit/Delete Scheduled SFS Sessions

**Symptoms**:
- Users can't modify future scheduled SFS sessions
- No edit/delete UI for scheduled sessions

**Root Cause**:
- `deleteScheduledSession()` method exists (Lines 850-881)
- Should have UI integration in ScheduledSFSListView
- May be missing swipe-to-delete or button handling

---

### Bug #8: Block Schedule Not Appearing in Widget

**Symptoms**:
- Block Schedule active but widget doesn't show it
- Main app shows it correctly

**Root Cause**:
- Widget checks for activeBlockSchedule.json (Line 146-159)
- But BlockScheduleManager may not save this file consistently
- Line 190 in BlockScheduleManager: `storage.saveActiveScheduleId(active.id)` saves ID
- But widget expects FULL schedule JSON

**Evidence**:
```swift
// FocusSessionWidget.swift:145-159
let blockScheduleActiveURL = containerURL.appendingPathComponent("activeBlockSchedule.json")
// Widget expects this file
// But BlockScheduleManager.swift:189 only saves activeScheduleId!
storage.saveActiveScheduleId(active.id)  // Saves ID only
```

**Needed Fix**:
- BlockScheduleManager should save full schedule JSON to App Group
- Or widget should load ID then fetch schedule from manager
- Currently there's a mismatch between what's saved and what widget expects

---

### Bug #9: Break Countdown Not Appearing After Break Ends

**Symptoms**:
- During break: countdown shows correctly
- When break ends: countdown disappears
- Should show main session countdown instead

**Root Cause**:
- Widget loads session data once per refresh cycle
- Break end is not detected by widget until next refresh
- Main app calls `handleBreakAutoResume()` but widget doesn't sync immediately

**Evidence**:
```swift
// SFSManager.swift:1093-1159 - handleBreakAutoResume()
// Clears isInManualBreak and manualBreakEndTime
// Deletes manualBreakEndTime.txt from App Group
// But widget might not refresh for 1 minute

// WidgetKit timeline refreshes every minute (Line 103-112)
for minuteOffset in 0..<60 {
    let entryDate = Calendar.current.date(byAdding: .minute, ...)
}
```

**Needed Fix**:
- Widget should refresh immediately when break state changes
- Call `WidgetCenter.shared.reloadAllTimelines()` in `handleBreakAutoResume()`
- Add break end detection in widget's `loadSessionData()`

---

### Bug #10: Cancel Button for Block Schedule Not Working

**Symptoms**:
- Cancel button may not be wired up
- Or cancel doesn't properly clear shields

**Root Cause**:
- `cancelSchedule()` method exists (Lines 720-789)
- Should unblock apps and mark schedule as cancelled
- But may not be called or may have incomplete cleanup

**Evidence**:
```swift
// BlockScheduleManager.swift:720-789 - cancelSchedule()
// Should:
// 1. Clear shields ✓ (Lines 729-734)
// 2. Stop DeviceActivity ✓ (Lines 738-740)
// 3. Clear break state if in break ✓ (Lines 748-756)
// 4. Track cancellation ✓ (Lines 758-780)
// 5. Clear active schedule ✓ (Line 783)
// 6. Reload widget ✓ (Line 786)
```

**Possible Issue**: UI integration
- Check SavedTasksView for Block Schedule cancel button
- May need alert confirmation like regular sessions

---

## SESSION STATE SYNCHRONIZATION FLOW

### When App Comes to Foreground

**Current Flow** (should be):
1. `RomanTimerView` detects `scenePhase` change to `.active`
2. Calls `sfsManager.syncSegmentStateOnForeground()`
3. Which reloads session from storage
4. Checks if manual break ended (Lines 1273-1279)
5. If break ended: calls `handleBreakAutoResume()`
6. Calls `syncShieldsWithExtension()`

**Issue**: Not all states properly synchronized

---

### Mutual Exclusivity Enforcement Points

**1. Creating SFS** (SFSManager.activateSessionNow):
- Lines 323-327: Check if Block Schedule is CURRENTLY active
- Lines 329-367: Check if Block Schedule would OVERLAP with this SFS
- **MISSING**: Check for concurrent Regular Sessions

**2. Creating Block Schedule** (BlockScheduleManager.createSchedule):
- Lines 231-248: Check if active SFS exists
- Lines 251-264: Check all scheduled SFS sessions
- **MISSING**: Check for concurrent Regular Sessions
- **WEAK**: Uses calendar dates which may not work for midnight-crossing schedules

**3. Starting Regular Session** (TimerManager.startTimer):
- Lines 124-135: Calls `checkForSessionConflicts()`
- Lines 1183-1261: Comprehensive conflict checking
- **STRONGEST IMPLEMENTATION**

**Problem**: The checks are uni-directional. SFS doesn't check for Regular Sessions starting!

---

## STORAGE AND PERSISTENCE ARCHITECTURE

### App Group Data Files
```
group.com.luiz.PandaApp/
├── sfsActiveSession.json              // Current SFS (SFSManager)
├── sfsScheduledSessions.json          // All scheduled SFS
├── sfsCurrentTaskIndex.txt            // Which task is active (0-indexed)
├── sfsCurrentState.json               // Extension state (not used in Option A)
├── manualBreakEndTime.txt             # Break countdown
├── breakResumeActivityName.txt        # DeviceActivity name for break resume
├── sfsBlockedApps.json                # FamilyActivitySelection for SFS
├── activeBlockSchedule.json           # Current Block Schedule
├── blockScheduleCompletion.json       # Completion data
├── focusSessionData.json              // Regular session (TimerManager)
├── sessionState.json                  // Persisted Regular session
└── ...others
```

### SFSScheduleStorage (SFSScheduleStorage.swift)
Handles:
- `saveActiveSession()` / `loadActiveSession()`
- `saveScheduledSessions()` / `loadScheduledSessions()`
- `saveCurrentTaskIndex()` / `loadCurrentTaskIndex()`
- `saveBreaksUsed()` / `loadBreaksUsed()`
- `saveBreakResumeActivity()` / `loadBreakResumeActivity()`

### BlockScheduleStorage
Handles:
- `saveSchedules()` / `loadSchedules()`
- `saveActiveScheduleId()` / `loadActiveScheduleId()`
- `saveBreakState()` / `loadBreakState()`
- `saveCancelledSchedules()` / `loadCancelledSchedules()`

### Issue: Inconsistent Patterns
- SFS saves full session objects
- Block Schedule saves ID only (plus some state files)
- Widget expects different formats for each

---

## COUNTDOWN ANIMATION FLOW

### RomanTimerView Timer Display (Lines 140-198)
1. **mainTimerSection** checks which session is active
2. If SFS active:
   - Checks if in manual break → show BREAK countdown
   - Else show TASK countdown
3. Uses `RomanCoinTimer` component with:
   - `progress`: calculated from remaining time
   - `timeString`: formatted remaining time
   - `endTime`: Date for `timerInterval` countdown
   - `isRunning`: whether timer should count down

### timerInterval (built-in SwiftUI)
- Automatically counts down based on `endTime: Date`
- Starts when view appears
- Updates UI every second

### Issue: 5-Second Startup Delay Not Animated
- SFS starts with 5-second delay (Line 370: `addingTimeInterval(5)`)
- But this is the actual start time, not a visual countdown
- Widget/UI should show "starting in 5 seconds" countdown

---

## BREAK MANAGEMENT STATE MACHINE

### SFS Manual Break State (COMPLETE)
```
Session Running (no break)
    ↓ [User clicks TAKE BREAK]
isInManualBreak = true
manualBreakEndTime = now + breakDuration
pauseBlockingForBreak() [shields removed]
DeviceActivity resume interval scheduled
    ↓ [Break ends]
isInManualBreak = false
manualBreakEndTime = nil
resumeBlockingAfterBreak() [shields re-applied]
handleBreakAutoResume() [clears break state]
```

### Block Schedule Break State (SIMILAR)
```
Schedule Running (no break)
    ↓ [User clicks TAKE BREAK]
isInBreak = true
currentBreakEndTime = now + breakDuration
Shield removed via ManagedSettingsStore
DeviceActivity resume interval scheduled
    ↓ [Break ends]
isInBreak = false
currentBreakEndTime = nil
Shields re-applied
handleBreakAutoResume() [clears break state]
```

### Problem: Incomplete Persistence
- Break state IS saved (`isInManualBreak` and dates)
- But when app is killed during break, restored state may not match DeviceActivity state
- Extension may re-apply shields while app thinks break is ongoing

---

## KEY FILES AND THEIR RESPONSIBILITIES

| File | Responsibility | Critical Code |
|------|-----------------|----------------|
| SFSManager.swift | Multi-task SFS sessions | startManualBreak() (941), stopSession() (782), syncSegmentStateOnForeground() (1263) |
| BlockScheduleManager.swift | Block schedules | startBreak() (642), cancelSchedule() (721), updateActiveSchedule() (169) |
| TimerManager.swift | Regular Pomodoro sessions | checkForSessionConflicts() (1182) |
| RomanTimerView.swift | Main timer UI | sfsTimerView (156), blockScheduleTimerView, mainTimerSection (141) |
| AppBlockingManager.swift | Shield management | pauseBlockingForBreak() (276), resumeBlockingAfterBreak() (281) |
| FocusSessionWidget.swift | Widget display | loadSessionData() (114), loadSFSSession() (209), loadBlockScheduleSession() |
| SavedTasksManager.swift | Task storage | completeTask() (93) - NO availability logic |
| SavedTask.swift | Task model | **MISSING: availability state** |

---

## SUMMARY OF ROOT CAUSES

1. **Countdown Animation** - 5-second delay has no visual feedback
2. **Widget Sync Delay** - Refreshes only every minute
3. **Break Re-blocking** - `syncShieldsWithExtension()` doesn't check break state
4. **Sub-task Availability** - SavedTask model has no disabled/locked state
5. **Mutual Exclusivity** - Checks happen but don't prevent all simultaneous sessions
6. **Scheduled SFS Management** - UI may not have full edit/delete support
7. **Block Schedule Widget** - Widget expects format mismatch
8. **Break Countdown After End** - Widget doesn't detect break end until next refresh
9. **Cancel Buttons** - May not be fully wired to UI or may not complete cleanup
10. **State Persistence** - Break state saved but not always loaded/synced correctly

---

## IMPLEMENTATION PRIORITY

**IMMEDIATE (Blocking)**:
1. Fix break re-blocking on app foreground (Bug #3)
2. Fix mutual exclusivity checks (Bug #5)
3. Fix Block Schedule widget display (Bug #8)

**HIGH PRIORITY**:
4. Add sub-task availability state (Bug #4)
5. Implement countdown animation for SFS delay (Bug #1)
6. Fix widget break state sync (Bugs #2, #9)

**MEDIUM PRIORITY**:
7. Verify cancel buttons work (Bugs #6, #10)
8. Ensure edit/delete for scheduled SFS (Bug #7)

