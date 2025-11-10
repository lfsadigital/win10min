# 🚨 CRITICAL: Win 10 Minutes App Recovery Mission

## URGENT CONTEXT
The Win 10 Minutes app (codebase name: PandaApp) has multiple catastrophic failures after recent attempted fixes. Core functionality is completely broken. You need to perform emergency recovery following a strict phased approach.

## YOUR MISSION
Fix the app systematically by following the 5-phase recovery plan below. DO NOT attempt all fixes at once. Test after each phase.

## CURRENT STATE
- **Regular 10-minute sessions**: Won't start at all
- **Block Schedules**: Created but invisible in UI, don't block apps
- **SFS Sessions**: Start with 5-second delay but no countdown animation
- **Cancel buttons**: Completely non-functional for all session types
- **Break system**: Re-blocks apps when returning during break
- **Mutual exclusivity**: Failed - multiple sessions run simultaneously
- **Screen Time permission**: Not requested during onboarding

## FILES LOCATION
Codebase: `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/`

## PHASE 1: RESTORE CORE FUNCTIONALITY (CRITICAL)

### Step 1: Fix Regular Timer Sessions
**File:** `PandaApp/Models/TimerManager.swift`
- Line 126-135: Make conflict check non-fatal (warn but still start)
```swift
if let conflictError = checkForSessionConflicts() {
    debugLog.log("⚠️ Warning: \(conflictError)")
    // Still start but show warning to user
}
startTimerInternal()
```

### Step 2: Fix Block Schedule Visibility
**File:** `PandaApp/Models/BlockScheduleManager.swift`
- After line 266 in `createSchedule()`: Add `updateActiveSchedule()`
- After line 347 in `deleteSchedule()`: Add `updateActiveSchedule()`
- Remove async wrapper in `updateActiveSchedule()` blocking UI updates

### Step 3: Preserve Active Shields
**File:** `PandaApp/Models/AppBlockingManager.swift`
- Comment out lines 57-67 (the `clearShieldsOnLaunch()` call)
- Only clear shields when explicitly ending sessions

**TEST PHASE 1**: Build and verify regular sessions work again

## PHASE 2: FIX MUTUAL EXCLUSIVITY

### Step 4: Add Conflict Prevention
**File:** `PandaApp/Models/BlockScheduleManager.swift`
Before line 196 in `createSchedule()`:
```swift
if SFSManager.shared.isSessionActive {
    throw BlockScheduleError.conflictWithSFS
}
```

**File:** `PandaApp/Models/SFSManager.swift`
Add similar check before creating SFS:
```swift
if BlockScheduleManager.shared.activeSchedule != nil {
    throw SFSError.conflictWithBlockSchedule
}
```

### Step 5: Force State Refresh
Add to `BlockScheduleManager`:
```swift
func forceStateRefresh() {
    updateActiveSchedule()
    WidgetCenter.shared.reloadAllTimelines()
    NotificationCenter.default.post(name: .blockScheduleStateChanged, object: nil)
}
```
Call after create/delete/break operations

**TEST PHASE 2**: Verify only one session type can be active

## PHASE 3: FIX BREAK SYSTEM

### Step 6: Load Break State on Launch
**File:** `PandaApp/Models/SFSManager.swift`
In `init()`:
```swift
if let breakEnd = loadManualBreakEndTime() {
    if breakEnd > Date() {
        isInManualBreak = true
        manualBreakEndTime = breakEnd
    }
}
```

### Step 7: Refresh on Foreground
**File:** `PandaApp/Views/RomanTimerView.swift`
Add:
```swift
.onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
    sfsManager.syncSegmentStateOnForeground()
    blockScheduleManager.forceStateRefresh()
}
```

**TEST PHASE 3**: Verify breaks don't re-block when switching apps

## PHASE 4: FIX UI ISSUES

### Step 8: Add SFS Countdown Animation
**File:** `PandaApp/Views/RomanTimerView.swift`
- Find countdown overlay section
- Ensure it shows for immediate starts
- Add 5-second countdown animation

### Step 9: Fix Cancel Buttons
Ensure cancel methods:
1. Stop DeviceActivity monitoring
2. Clear shields immediately
3. Update UI state
4. Show confirmation dialog

**TEST PHASE 4**: Verify countdown shows and cancel buttons work

## PHASE 5: FIX ONBOARDING

### Step 10: Add Screen Time Permission
**File:** `PandaApp/Views/NewOnboardingView.swift`
- Add Screen Time permission step before task selection
- Handle denial gracefully

**TEST PHASE 5**: Full regression testing

## CRITICAL WARNINGS
- DO NOT attempt all fixes at once
- DO NOT modify DeviceActivity intervals (15-min iOS minimum)
- DO NOT change shield store names
- ALWAYS test on real device
- COMMIT after each successful phase

## TESTING CHECKLIST
After ALL phases:
- [ ] Regular 10-minute sessions start
- [ ] Block Schedules appear in UI immediately
- [ ] Only one session type active at a time
- [ ] SFS countdown animation shows
- [ ] All cancel buttons functional
- [ ] Breaks don't re-block when returning
- [ ] Widget shows correct info
- [ ] Screen Time requested in onboarding

## ROLLBACK IF NEEDED
```bash
git checkout DUAL_PLATFORM_STABLE  # Last stable
# OR
git checkout SAFE_IPHONE_VERSION   # Production
```

## LOGS LOCATION
Test logs saved to: `/Users/luizfellipealmeida/Desktop/`

## START INSTRUCTIONS
1. Create recovery branch: `git checkout -b critical-recovery`
2. Start with Phase 1 Step 1
3. Test after EACH phase
4. Document what you fix
5. If something breaks further, STOP and report

The app MUST work again. Focus on restoration, not new features. Good luck!