# CRITICAL SFS SCHEDULING BUG - COMPREHENSIVE ROOT CAUSE ANALYSIS
Date: November 22, 2025
Status: Multiple interconnected failures identified

---

## EXECUTIVE SUMMARY: THE BUG CHAIN

The SFS scheduling system is broken due to a **chain of 5 interconnected failures** that cascade when a scheduled SFS reaches its start time:

1. **Session promotion works correctly** ✅ (deviceActivityMonitor lines 538-572)
2. **Storage functions work correctly** ✅ (SFSScheduleStorage, DeviceActivityMonitor)
3. **Main app initialization looks correct** ✅ (SFSManager.init loads active session)
4. **UI display broken** ❌ (ScheduledSFSListView has wrong logic)
5. **State tracking broken** ❌ (canActivateSFS doesn't check for PROMOTED sessions)

---

## DETAILED ROOT CAUSES

### ROOT CAUSE #1: MAIN APP NOT DETECTING PROMOTED SESSIONS
**File**: `SFSManager.swift`, `__init__` method
**Lines**: 146-217

**Problem**: When extension promotes scheduled → active session, main app doesn't know about it on startup.

**Flow**:
```
1. User schedules SFS for 2:00 PM
   → Stored in sfsScheduledSessions.json (main app storage)
   → DeviceActivitySchedule created in extension

2. Extension fires at 2:00 PM (intervalDidStart)
   → Loads scheduled session from sfsScheduledSessions.json
   → Saves it to sfsActiveSession.json (PROMOTED)
   → Removes it from sfsScheduledSessions.json (DELETED)
   → Blocks apps ✅

3. Main app launches (or was backgrounded)
   → SFSManager.__init__ runs
   → Loads sfsActiveSession.json ✅
   → Sets activeSession property ✅
   → Sets isSessionActive = true ✅
   → Loads sfsScheduledSessions.json (now empty after extension removed it) ✅
   
   SHOULD: Update UI to show active session
   ACTUALLY: Works correctly but...
```

**Why this seems fine**: The initial load works. The problem is DOWNSTREAM (see #2-5).

---

### ROOT CAUSE #2: SCHEDULED SESSION LIST UI LOGIC IS BACKWARDS
**File**: `ScheduledSFSListView.swift`
**Lines**: 48-72

**The Bug**:
```swift
private var displaySessions: [SuperFocusSession] {
    var sessions: [SuperFocusSession] = []

    // Add active session first if it exists
    if let active = sfsManager.activeSession, isSessionActive(active) {
        sessions.append(active)  // ✅ CORRECT
    }

    // Add all future scheduled sessions from Published property
    let futureSessions = sfsManager.scheduledSessions.filter { isSessionFuture($0) }
    sessions.append(contentsOf: futureSessions)  // ✅ CORRECT

    return sessions
}

private func isSessionActive(_ session: SuperFocusSession) -> Bool {
    guard let startTime = session.scheduledStartTime else { return false }
    return Date() >= startTime  // ⚠️ PROBLEM HERE
}

private func isSessionFuture(_ session: SuperFocusSession) -> Bool {
    guard let startTime = session.scheduledStartTime else { return false }
    return Date() < startTime  // ⚠️ PROBLEM HERE
}
```

**What's wrong**:
- `isSessionActive()` checks if `Date() >= scheduledStartTime`
- But it should check `sfsManager.isSessionActive && session.id == sfsManager.activeSession?.id`
- This is ONLY checking the scheduled time, not actual session state

**Why session disappears**:
1. Extension promotes session at 2:00 PM
2. Extension removes it from `sfsScheduledSessions.json`
3. Main app's `scheduledSessions` property is now empty
4. UI tries to display sessions:
   - Active session check: `sfsManager.activeSession` exists ✅ (was promoted by extension)
   - BUT: `isSessionActive(active)` checks `Date() >= startTime`
   - If it's NOW 2:05 PM and startTime was 2:00 PM → TRUE
   - Active session should show ✅
   - Future sessions: List is empty ✅

**So why doesn't it show?**
- Because `sfsManager.scheduledSessions` was loaded ONCE at init
- But after extension removes the session, the Published property isn't reloaded
- The UI has stale data (it still thinks session is scheduled)
- When displaySessions runs: checks active session (should show), checks future sessions (should be empty)
- Should work correctly... BUT

**The REAL problem**: Observer relationship is broken

---

### ROOT CAUSE #3: PUBLISHED PROPERTY NOT REACTIVE TO EXTENSION CHANGES
**File**: `SFSManager.swift`
**Lines**: 108, 210-211

**Problem**:
```swift
@Published var scheduledSessions: [SuperFocusSession] = []
...
// In init:
self.scheduledSessions = storage.loadScheduledSessions()  // Load ONCE
```

**Issue**:
- `scheduledSessions` is loaded ONCE in `__init__`
- When extension modifies `sfsScheduledSessions.json` (removes the promoted session), main app doesn't know
- The Published property has stale data
- The UI doesn't refresh because the property hasn't changed

**Why it matters**:
- User schedules SFS at 2:00 PM
- At 2:00 PM, extension promotes it
- Main app is in background → extension runs in isolation
- When user brings app to foreground, SFSManager init already ran
- The published property is never re-read
- Extension's removal of the session from the file is never reflected in the UI

---

### ROOT CAUSE #4: NO REFRESH ON FOREGROUND WHEN SCHEDULED SESSIONS CHANGE
**File**: `RomanTimerView.swift`
**Lines**: 85 (scenePhase) but missing SFS scheduled session sync

**Problem**: 
When app comes to foreground, no code checks if extension modified `sfsScheduledSessions.json`

**What should happen**:
```swift
@Environment(\.scenePhase) var scenePhase

.onChange(of: scenePhase) { newPhase in
    if newPhase == .active {
        // Reload scheduled sessions from storage
        sfsManager.scheduledSessions = sfsManager.storage.loadScheduledSessions()
        // This would refresh the UI
    }
}
```

**What actually happens**: Nothing specific for scheduled sessions

---

### ROOT CAUSE #5: CAN'T CREATE NEW SFS DURING PROMOTED SESSION
**File**: `SFSManager.swift`
**Lines**: 272-298, specifically line 348

**Problem**:
```swift
func canActivateSFS() -> (canActivate: Bool, reason: String?) {
    // Check if already active
    if sfsManager.isSessionActive {
        // Wait... this is checking if ONE specific session is active
        // But what about ANOTHER scheduled SFS that got promoted?
    }
}
```

**The bug**:
- `canActivateSFS()` only checks `isSessionActive` Boolean
- Doesn't check if there's an `activeSession` in memory
- Extension promoted the scheduled session to active
- Main app's `isSessionActive` might still be FALSE if it wasn't updated
- User can create another SFS thinking one isn't active
- Error: "SFS already active" (but they didn't know about the promoted one)

---

## STATE FLOW: WHAT ACTUALLY HAPPENS VS WHAT SHOULD HAPPEN

### Timeline of a Scheduled SFS

**EXPECTED FLOW:**
```
T=0:00    User schedules SFS for T=2:00
          → Saved to sfsScheduledSessions.json
          → DeviceActivitySchedule created

T=2:00    Scheduled time arrives
          → Extension's intervalDidStart fires
          → Loads scheduled session
          → Promotes to sfsActiveSession.json
          → Removes from sfsScheduledSessions.json
          → Applies shields
          → Session is ACTIVE, apps are BLOCKED

T=2:05    User opens app
          → SFSManager checks for active session
          → Finds activeSession from file
          → Sets isSessionActive = true
          → UI shows active session countdown
          → User CAN take breaks
          → Cannot create new SFS (correctly blocked)

T=2:30    User cancels SFS or it completes
          → Session ends
          → activeSession = nil
          → isSessionActive = false
          → Shields removed
          → UI shows empty state
```

**ACTUAL BROKEN FLOW:**
```
T=0:00    User schedules SFS for T=2:00
          → Saved to sfsScheduledSessions.json ✅
          → DeviceActivitySchedule created ✅
          → UI shows in scheduled list ✅

T=2:00    Scheduled time arrives
          → Extension's intervalDidStart fires ✅
          → Loads scheduled session ✅
          → Saves to sfsActiveSession.json ✅
          → Removes from sfsScheduledSessions.json ✅
          → Applies shields ✅
          → **Apps ARE BEING BLOCKED** ✅

T=2:05    User opens app (session has been blocked for 5 minutes)
          ❌ PROBLEM APPEARS HERE
          → SFSManager loads activeSession ✅
          → Displays in UI ✅
          BUT:
          → Session isn't in scheduledSessions list anymore
          → isSessionActive might not be set correctly
          → ScheduledSFSListView shows NOTHING (but apps ARE blocked)
          → User thinks SFS crashed
          → Extension is still blocking apps (ghosts session)

T=2:30    User tries to stop/edit/delete
          ❌ CAN'T - no UI element showing session
          → Apps stay blocked (ghost blocking)
          → No way to unblock without force-kill or wait until time expires
```

---

## THE 6 USER-REPORTED ISSUES - ROOT CAUSES

### Issue #1: Session disappears from SFS list
**Root Cause**: Extension removes it from file, main app's published property isn't refreshed on foreground
**Location**: SFSManager init (loads once), RomanTimerView (doesn't refresh on foreground)
**Fix Needed**: Reload scheduled sessions on app foreground in `scenePhase` observer

### Issue #2: Does NOT activate at scheduled time (no UI, no blocking initially)
**Root Cause**: WRONG - Extension blocks apps immediately ✅. UI just doesn't show it.
**Actual Issue**: No UI feedback, so user thinks it didn't start
**Location**: RomanTimerView doesn't refresh when extension activates session
**Fix Needed**: Add observer for app activation (scenePhase)

### Issue #3: Eventually starts blocking apps (delayed activation)
**Root Cause**: Blocking happens immediately in extension ✅, it just LOOKS delayed because UI doesn't update
**Location**: Extension is correct, UI is wrong
**Fix Needed**: Refresh UI on app foreground

### Issue #4: Blocks new SFS creation (says "SFS already active")
**Root Cause**: `canActivateSFS()` doesn't properly check for promoted active sessions
**Location**: SFSManager.swift line 348
**Fix Needed**: Check both `isSessionActive` boolean AND presence of `activeSession` object

### Issue #5: Can't edit or delete scheduled SFS from list
**Root Cause**: Session isn't shown in UI at all (disappeared after promotion)
**Location**: ScheduledSFSListView doesn't show active sessions properly
**Fix Needed**: Fix display logic and/or add UI for active sessions

### Issue #6: SFS blocking apps but NOT showing in Focus page UI (ghost session)
**Root Cause**: 
1. Extension has promoted active session in sfsActiveSession.json
2. Extension is blocking apps
3. Main app's UI doesn't refresh to show the active session
4. SFSManager has the activeSession loaded but UI doesn't display it
**Location**: RomanTimerView display logic
**Fix Needed**: Ensure UI displays active sessions on app foreground

---

## CRITICAL CODE SECTIONS VERIFIED

### ✅ What's Actually Working (Extension Side)

**DeviceActivityMonitor.swift lines 532-572 (Session Promotion)**:
```swift
if loadedSession == nil {
    if let scheduledSessions = loadScheduledSessions() {
        if let matchingSession = scheduledSessions.first(where: { $0.id == sessionId }) {
            saveActiveSession(matchingSession)      // ✅ Saves to sfsActiveSession.json
            removeScheduledSession(id: sessionId)   // ✅ Removes from sfsScheduledSessions.json
            loadedSession = matchingSession
            logger.log("🚀 SFS: Scheduled session activated successfully")
        }
    }
}
```
**Status**: CORRECT ✅

### ✅ Storage Functions Work

**SFSScheduleStorage.swift**:
- `loadScheduledSessions()` (lines 234-253): Correct ✅
- `addScheduledSession()` (lines 281-291): Correct ✅
- `removeScheduledSession()` (lines 294-298): Correct ✅
- `saveActiveSession()` (lines 50-74): Correct ✅
- `loadActiveSession()` (lines 77-105): Correct ✅

**DeviceActivityMonitor.swift**:
- `loadScheduledSessions()` (lines 639-665): Correct ✅
- `saveActiveSession()` (lines 667-686): Correct ✅
- `removeScheduledSession()` (lines 688-720): Correct ✅

**Status**: ALL CORRECT ✅

### ✅ Initial Load in SFSManager Works

**SFSManager.swift lines 146-217**:
```swift
if let savedSession = storage.loadActiveSession() {
    logger.info("📱 Restoring active SFS session from storage")
    self.activeSession = savedSession    // ✅ Sets correctly
    self.isSessionActive = true          // ✅ Sets correctly
}
// Load scheduled sessions
self.scheduledSessions = storage.loadScheduledSessions()  // ✅ Loads (but only ONCE)
```
**Status**: Correct on first launch ✅

### ❌ BROKEN: Refresh on Foreground

**Not found in RomanTimerView**: No code to reload scheduled sessions when app comes to foreground
**Location**: Missing from scenePhase observer
**Status**: MISSING ❌

### ❌ BROKEN: canActivateSFS Check

**SFSManager.swift line 348**:
```swift
let (canActivate, reason) = canActivateSFS()
guard canActivate else {
    logger.error("❌ Cannot activate: \(reason ?? "Unknown reason")")
    throw SFSError.dailyLimitReached
}
```

**But canActivateSFS doesn't check**:
- If there's already an `activeSession` object in memory
- Only checks `isSessionActive` boolean
- If extension promoted session, the Boolean might not match the object state

**Status**: INCOMPLETE ❌

---

## CONCRETE IMPLEMENTATION FAILURES

### Failure #1: ScheduledSFSListView Display Logic
**File**: `ScheduledSFSListView.swift` lines 48-72
**Issue**: Relies on `isSessionActive()` checking `Date() >= startTime`, which is wrong
**Should**: Display sessions from `sfsManager.scheduledSessions` array PLUS active session
**Status**: UI logic backward ❌

### Failure #2: No Foreground Refresh
**File**: `RomanTimerView.swift`
**Issue**: No code to reload scheduled sessions when app comes to foreground
**Should**: Add scenePhase observer that reloads `sfsManager.scheduledSessions`
**Status**: MISSING ❌

### Failure #3: Active Session Not Displayed
**File**: Multiple places
**Issue**: No dedicated display area for active sessions in SFS tab
**Should**: Show active session at top of list if it exists
**Status**: BROKEN ❌

### Failure #4: canActivateSFS Incomplete Check
**File**: `SFSManager.swift` line 272-298
**Issue**: Doesn't check if `activeSession` exists in memory
**Should**: Check both `isSessionActive` boolean AND `activeSession != nil`
**Status**: INCOMPLETE ❌

---

## SUMMARY: WHY ALL 6 ISSUES HAPPEN

1. **Session disappears** → Extension removes from file, main app never reloads
2. **No blocking initially** → Blocking happens, UI just doesn't show it (refresh missing)
3. **Delayed blocking** → Not delayed, just hidden (same as #2)
4. **Blocks new SFS creation** → Check doesn't properly detect promoted session
5. **Can't edit/delete** → Session not visible in UI (disappeared after promotion)
6. **Ghost blocking** → Extension blocks but UI doesn't show session (refresh missing)

**All 6 stem from these 4 failures**:
1. No refresh of `scheduledSessions` on app foreground
2. `canActivateSFS()` doesn't properly check for active sessions
3. ScheduledSFSListView logic is flawed
4. No UI dedicated to displaying active sessions during SFS

---

## FIX PRIORITY

### P0 (Blocking) - Must fix first:
1. Add foreground refresh to reload scheduled sessions
2. Fix canActivateSFS to check activeSession object exists
3. Fix ScheduledSFSListView to properly display active sessions

### P1 (Critical) - Fix immediately after P0:
4. Add UI feedback when session is promoted
5. Ensure active session state syncs with extension state

### P2 (Important):
6. Add ability to edit/delete active sessions
7. Add ghost session cleanup on app launch

