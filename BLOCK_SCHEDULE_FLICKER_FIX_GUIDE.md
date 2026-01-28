# BLOCK SCHEDULE FLICKER FIX - IMPLEMENTATION GUIDE

**Version**: 1.0
**Date**: November 25, 2025
**Estimated Time**: 5-10 minutes
**Risk Level**: Very Low

---

## EXECUTIVE SUMMARY

### The Problem
Block Schedule countdown flickers on the Focus page due to duplicate widget reloads happening 3.9ms apart when a break ends. The logs show:
```
11:51:05.023174 - reloadAllTimelines() ← RELOAD #1
11:51:05.026087 - reloadAllTimelines() ← RELOAD #2 (3.9ms later = FLICKER)
```

### The Root Cause
In `BlockScheduleManager.swift`, the `handleBreakAutoResume()` method calls `WidgetCenter.shared.reloadAllTimelines()` at line 972, then immediately starts a new countdown timer at line 977. The timer fires almost instantly (3-4ms), triggering a second UI update, causing the visible flicker.

### The Solution
Remove the redundant widget reload at line 972. The extension already reloads the widget when break ends, and the countdown timer handles subsequent UI updates via `objectWillChange.send()`.

### Expected Outcome
- ✅ Zero flickering on Focus page during Block Schedule countdown
- ✅ Break ends → countdown resumes smoothly (no flicker)
- ✅ Widget behavior unchanged (extension still updates it)
- ✅ App locking/unlocking during breaks unaffected
- ✅ Hybrid architecture benefits preserved

---

## PRE-IMPLEMENTATION CHECKLIST

### 1. Verify Current State

```bash
# Navigate to project directory
cd /Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp

# Check git status
git status
# Expected: On branch critical-recovery or similar
```

### 2. Create Backup Tag

```bash
# Create restore point
git tag -a PRE_FLICKER_FIX -m "Before Block Schedule flicker fix (remove line 972)"

# Verify tag created
git tag -l | grep PRE_FLICKER_FIX
```

### 3. Verify File Exists

```bash
# Check that target file exists
ls -la PandaApp/PandaApp/Models/BlockScheduleManager.swift
# Expected: File exists
```

### 4. Pre-Implementation Checklist

- [ ] Git repository clean (no uncommitted changes OR only docs)
- [ ] Backup tag created: `PRE_FLICKER_FIX`
- [ ] Target file verified to exist
- [ ] Xcode closed (to avoid conflicts)

**⚠️ STOP: Do not proceed until ALL boxes are checked.**

---

## IMPLEMENTATION

### Step 1: Locate the Target Code

**File**: `PandaApp/PandaApp/Models/BlockScheduleManager.swift`
**Method**: `handleBreakAutoResume(for scheduleId: UUID)`
**Line**: ~972 (may vary slightly, use code search)

### Step 2: Find Exact Location

Search for this exact code block:

```swift
// Reload widget to show resumed state
WidgetCenter.shared.reloadAllTimelines()
debugLog.log("✅ Block schedule resumed")
```

**Context** (what you should see around line 972):
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

    // Clean up storage
    storage.clearBreakState()
    storage.clearBreakResumeActivity(for: scheduleId)

    // Reload widget to show resumed state
    WidgetCenter.shared.reloadAllTimelines()  // ← LINE 972 (TARGET)
    debugLog.log("✅ Block schedule resumed")

    // CRITICAL FIX (Bug #1 - KEY FIX): Restart schedule countdown timer (mirrors SFS pattern)
    startScheduleCountdownTimer()

    // CRITICAL FIX (Bug #2.8): Notify observers AFTER timer started
    DispatchQueue.main.async { [weak self] in
        self?.objectWillChange.send()
    }
}
```

### Step 3: Make the Code Change

**BEFORE** (lines 971-973):
```swift
// Reload widget to show resumed state
WidgetCenter.shared.reloadAllTimelines()
debugLog.log("✅ Block schedule resumed")
```

**AFTER** (comment out the widget reload):
```swift
// CRITICAL FIX (Flicker): Widget already reloaded by extension - redundant reload causes double-update flicker
// WidgetCenter.shared.reloadAllTimelines()  // ← COMMENTED OUT to prevent double reload
debugLog.log("✅ Block schedule resumed")
```

**Alternative** (if you prefer to delete the line entirely):
```swift
// Widget reload handled by extension when break ends (no reload needed here)
debugLog.log("✅ Block schedule resumed")
```

### Step 4: Verify the Change

**Manual Code Review Checklist:**
- [ ] Line 972 `WidgetCenter.shared.reloadAllTimelines()` is commented out OR deleted
- [ ] Comment added explaining why it was removed (prevents confusion)
- [ ] `debugLog.log("✅ Block schedule resumed")` line still present
- [ ] `startScheduleCountdownTimer()` line still present (a few lines below)
- [ ] No syntax errors (closing braces still match)

### Step 5: Build Verification

```bash
# Clean build to verify syntax
xcodebuild -workspace PandaApp.xcworkspace \
           -scheme PandaApp \
           -configuration Debug \
           clean build

# Expected: BUILD SUCCEEDED
```

**If build fails:**
1. Check for syntax errors (missing braces, etc.)
2. Verify you only modified the single line
3. Use `git diff` to review changes

---

## TESTING STRATEGY

### Test Case 1: Break End Flicker (Primary Fix)

**Setup:**
1. Create Block Schedule starting NOW with 1-minute break duration
2. Immediately click "TAKE BREAK"
3. Keep app in FOREGROUND (Focus page visible)
4. Watch countdown reach 00:00

**Expected Behavior:**
- Break countdown reaches 00:00
- Transition to schedule countdown is SMOOTH (no flicker)
- NO rapid flash/jump of UI elements
- Countdown continues normally

**Verification:**
```bash
# Monitor logs during test
log stream --predicate 'message CONTAINS "reloadAllTimelines"' --level debug

# Expected: ONE reload when break starts
# Expected: ONE reload when break ends (from extension, NOT from line 972)
# NOT expected: Two reloads 3-4ms apart
```

**Pass Criteria:**
- [ ] NO visible flicker when break ends
- [ ] Countdown resumes smoothly
- [ ] Only ONE `reloadAllTimelines()` log when break ends
- [ ] Focus page shows correct countdown after break

---

### Test Case 2: Focus Page Countdown Display (Regression Check)

**Setup:**
1. Create Block Schedule starting NOW (30 minutes)
2. Keep app in FOREGROUND
3. Watch countdown for 60 seconds continuously

**Expected Behavior:**
- Countdown updates every 1 second
- Smooth progression (no jumps, no freezes)
- NO flicker at any interval
- Matches expected remaining time

**Pass Criteria:**
- [ ] Countdown displays correctly
- [ ] Updates every second
- [ ] No flicker observed
- [ ] No visual stuttering

---

### Test Case 3: Widget Behavior (Match Focus Page)

**Setup:**
1. Create Block Schedule starting NOW
2. Go to Home screen (view widget)
3. Observe widget countdown
4. Return to app (Focus page)
5. Compare countdown times

**Expected Behavior:**
- Widget shows countdown correctly
- Widget updates regularly (every ~1 minute is normal for widgets)
- Widget time matches Focus page time (±1-2 seconds tolerance)

**Pass Criteria:**
- [ ] Widget displays active Block Schedule
- [ ] Widget countdown matches Focus page
- [ ] No widget flicker or rapid updates

---

### Test Case 4: App Locking During Break (Regression Check)

**Setup:**
1. Create Block Schedule with blocked app (e.g., Safari)
2. Start schedule
3. Click "TAKE BREAK"
4. Try to open Safari during break
5. Wait for break to end
6. Try to open Safari after break

**Expected Behavior:**
- Safari blocked before break: ✅ Shield appears
- Safari unblocked during break: ✅ Opens normally
- Safari blocked after break: ✅ Shield appears again

**Pass Criteria:**
- [ ] Apps unlock during break
- [ ] Apps re-lock after break ends
- [ ] No delay in re-locking (immediate)

---

### Test Case 5: Hybrid Architecture Still Working (Regression Check)

**Setup:**
1. Create Block Schedule for current time + 30 seconds
2. Close app completely (swipe up)
3. Wait for schedule to start
4. Reopen app

**Expected Behavior:**
- Darwin notification sent by extension when schedule starts
- Main app receives notification (instant update)
- Focus page shows active schedule immediately
- No waiting for 30-second polling

**Verification:**
```bash
# Monitor Darwin notifications
log stream --predicate 'message CONTAINS "DARWIN"' --level debug

# Expected logs:
# Extension: "📡 DARWIN: Posted com.luiz.PandaApp.blockScheduleStarted"
# Main app: "📡 RECEIVED: blockScheduleStarted"
```

**Pass Criteria:**
- [ ] Darwin notification posted by extension
- [ ] Darwin notification received by main app
- [ ] Schedule appears in Focus page instantly (< 1 second)
- [ ] No 10-30 second delay

---

## VERIFICATION CHECKLIST

### Code Changes
- [ ] Single line modified (line 972 commented out or deleted)
- [ ] Comment added explaining the change
- [ ] No other lines modified
- [ ] Build succeeds with no errors/warnings

### Testing Results
- [ ] Test Case 1: Break end flicker eliminated ✅
- [ ] Test Case 2: Focus page countdown works correctly ✅
- [ ] Test Case 3: Widget behavior matches Focus page ✅
- [ ] Test Case 4: App locking/unlocking during breaks works ✅
- [ ] Test Case 5: Hybrid architecture still functional ✅

### Log Verification
- [ ] Only ONE `reloadAllTimelines()` when break ends (not two)
- [ ] Darwin notifications still being posted/received
- [ ] No error messages in logs
- [ ] No warnings about missing state

---

## ROLLBACK STRATEGY

### If Fix Doesn't Work

**Quick Rollback:**
```bash
# Restore to pre-fix state
git checkout PRE_FLICKER_FIX

# Clean and rebuild
rm -rf ~/Library/Developer/Xcode/DerivedData/PandaApp-*
xcodebuild -workspace PandaApp.xcworkspace -scheme PandaApp clean build
```

**Recovery Time**: < 2 minutes

### If Fix Causes Issues

**Symptoms to watch for:**
1. Widget stops updating after break ends
2. Focus page doesn't show countdown after break
3. Build errors or crashes

**If any symptom occurs:**
1. Document the exact behavior (screenshot + logs)
2. Execute rollback commands above
3. Report issue with evidence

---

## EXPECTED LOG OUTPUT

### BEFORE FIX (Current Behavior - Flicker)

When break ends:
```
11:51:05.023174 - 🔄 Widget reloaded for break display
11:51:05.026087 - 🔄 Widget reloaded for break display  ← 3.9ms later (FLICKER!)
11:51:05.030000 - ✅ Block schedule resumed
```

### AFTER FIX (Expected Behavior - No Flicker)

When break ends:
```
11:51:05.023174 - 🔄 Widget reloaded for break display  ← ONE reload (from extension)
11:51:05.030000 - ✅ Block schedule resumed
11:51:06.000000 - (countdown timer tick - UI updates)
11:51:07.000000 - (countdown timer tick - UI updates)
```

---

## ARCHITECTURAL NOTES

### Why This Fix Works

**The Problem:**
1. Extension reloads widget when break ends (proper behavior)
2. Main app's `handleBreakAutoResume()` reloads widget AGAIN at line 972 (redundant)
3. Main app starts new countdown timer at line 977 (fires immediately)
4. Result: TWO widget reloads within 3-4ms = visible flicker

**The Solution:**
1. Extension reloads widget when break ends (keep this ✅)
2. Main app's `handleBreakAutoResume()` does NOT reload widget (remove line 972 ✅)
3. Main app starts countdown timer which updates UI via `objectWillChange.send()` (keep this ✅)
4. Result: ONE widget reload + smooth UI updates = no flicker

### Why Widget Still Works Without Line 972

**Widget Update Sources:**
1. **Extension** - Reloads widget when schedule starts/ends/break changes (PRIMARY)
2. **Main app** - `@Published` property changes trigger SwiftUI updates (SECONDARY)
3. **Countdown timer** - Updates Focus page UI every second via `objectWillChange.send()` (UI ONLY)

The line 972 reload is **redundant** because the extension already handled it. Removing redundancy eliminates the flicker.

### Why Focus Page Still Works

**Focus Page Update Sources:**
1. **Countdown timer** - Fires every 1 second, calls `objectWillChange.send()` ✅
2. **SwiftUI reactivity** - Detects `@Published` property changes automatically ✅
3. **Darwin notifications** - Extension → Main app for instant updates ✅

None of these depend on line 972. The Focus page countdown is driven by the timer's `objectWillChange.send()`, not widget reloads.

### Hybrid Architecture Preserved

This fix does NOT affect the hybrid architecture implemented previously:
- ✅ Darwin notifications still work (instant schedule start detection)
- ✅ Nil check still works (prevents timer restarts during polling)
- ✅ 30-second polling still works (fallback mechanism)

The fix addresses a DIFFERENT issue (break end flicker) that's unrelated to the hybrid architecture benefits.

---

## FREQUENTLY ASKED QUESTIONS

### Q1: Will this affect widget updates?
**A:** No. The extension reloads the widget when break ends. Line 972 was a redundant second reload causing the flicker.

### Q2: Will Focus page countdown still work?
**A:** Yes. The countdown timer (line 977) handles UI updates via `objectWillChange.send()` every second.

### Q3: Will apps still unlock/lock during breaks?
**A:** Yes. The extension handles app locking/unlocking via shields. This is completely separate from line 972.

### Q4: Why keep the hybrid architecture if it didn't fix this?
**A:** The hybrid architecture fixes DIFFERENT problems (polling delays, instant schedule start). This fix addresses break end flicker. Both are needed.

### Q5: What if the flicker persists after this fix?
**A:** Use the rollback strategy and investigate other sources. The 3.9ms timing strongly suggests line 972 is the cause, but if not, we'll need to look at other `reloadAllTimelines()` call sites.

---

## SUCCESS CRITERIA

Before marking this fix as COMPLETE, verify:

**Code:**
- [ ] Line 972 commented out or deleted
- [ ] Build succeeds
- [ ] No syntax errors

**Testing:**
- [ ] Break end flicker eliminated (Test Case 1) ✅
- [ ] Focus page countdown works (Test Case 2) ✅
- [ ] Widget matches Focus page (Test Case 3) ✅
- [ ] App locking works (Test Case 4) ✅
- [ ] Hybrid architecture works (Test Case 5) ✅

**Logs:**
- [ ] Only ONE `reloadAllTimelines()` when break ends
- [ ] Darwin notifications still functioning
- [ ] No new errors or warnings

**User Experience:**
- [ ] No visible flicker on Focus page
- [ ] Smooth countdown transitions
- [ ] Widget behavior correct

---

## IMPLEMENTATION SUMMARY

**Total Changes**: 1 line (line 972)
**Files Modified**: 1 (`BlockScheduleManager.swift`)
**Risk Level**: Very Low
**Estimated Time**: 5-10 minutes
**Rollback Time**: < 2 minutes

**Change Summary:**
```diff
// Clean up storage
storage.clearBreakState()
storage.clearBreakResumeActivity(for: scheduleId)

- // Reload widget to show resumed state
- WidgetCenter.shared.reloadAllTimelines()
+ // CRITICAL FIX (Flicker): Widget already reloaded by extension - redundant reload causes flicker
+ // WidgetCenter.shared.reloadAllTimelines()  // ← COMMENTED OUT
debugLog.log("✅ Block schedule resumed")

// CRITICAL FIX (Bug #1 - KEY FIX): Restart schedule countdown timer
startScheduleCountdownTimer()
```

---

## END OF GUIDE

**Good luck with the implementation! This is a simple, low-risk fix that should eliminate the flickering permanently.**

**Next Steps:**
1. Complete Pre-Implementation Checklist
2. Make the one-line change
3. Build and verify
4. Run all 5 test cases
5. Report results

**If any test fails**, use the rollback strategy immediately and report findings.
