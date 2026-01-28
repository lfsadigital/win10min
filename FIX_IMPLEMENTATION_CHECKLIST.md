# BREAK FREEZE FIX - IMPLEMENTATION CHECKLIST

**Date**: November 24, 2025
**Branch**: critical-recovery
**Files to Modify**: 3 files, 13 specific locations

---

## QUICK REFERENCE

### Files:
1. `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/SFSManager.swift`
2. `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/BlockScheduleManager.swift`
3. `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/TimerManager.swift`

---

## SFS MANAGER (4 changes)

- [ ] **Fix 1.1** (Line ~1211): Add `DispatchQueue.main.async { self?.objectWillChange.send() }`
- [ ] **Fix 1.2** (Line ~1177): Add `stopSegmentTimer()` before timer creation
- [ ] **Fix 1.2b** (Line ~1196): Change `Task { @MainActor in }` to `DispatchQueue.main.async`
- [ ] **Fix 1.3** (Line ~1247): Change `Task { @MainActor in }` to `DispatchQueue.main.async`
- [ ] **Fix 1.4** (Line ~1255): Add `@MainActor` before `private func checkSegmentCompletion()`

---

## BLOCK SCHEDULE MANAGER (4 changes)

- [ ] **Fix 2.1** (Line 117): Add `@MainActor` before `class BlockScheduleManager`
- [ ] **Fix 2.2** (Lines ~910-915): Replace thread check with simple `objectWillChange.send()`
- [ ] **Fix 2.3** (Lines ~833-838): Replace thread check with simple `objectWillChange.send()`
- [ ] **Fix 2.4** (Line ~908): Add `objectWillChange.send()` after `startScheduleCountdownTimer()`

---

## TIMER MANAGER (3 changes)

- [ ] **Fix 3.1** (Line ~157): Change `Task { @MainActor in }` to `DispatchQueue.main.async`
- [ ] **Fix 3.2** (Line ~321): Change `Task { @MainActor in }` to `DispatchQueue.main.async`
- [ ] **Fix 3.3** (Line ~622): Change `Task { @MainActor in }` to `DispatchQueue.main.async`

---

## BUILD & TEST

- [ ] Build succeeds (no errors)
- [ ] No new warnings
- [ ] Test Case 1: SFS break stays in app (no freeze)
- [ ] Test Case 2: Block break stays in app (no freeze)
- [ ] Test Case 3: SFS foreground resume (still works)
- [ ] Test Case 4: Block foreground resume (still works)
- [ ] Test Case 5: Regular session (no regression)

---

## COMMIT & PUSH

- [ ] Commit with message: "Fix break freeze at 00:00 for SFS and Block Schedule"
- [ ] Push to critical-recovery branch
- [ ] Archive build
- [ ] Deploy to TestFlight
- [ ] Production testing

---

## PATTERN REFERENCE

### Replace This:
```swift
Task { @MainActor in
    self?.methodName()
}
```

### With This:
```swift
DispatchQueue.main.async {
    self?.methodName()
}
```

### Add This (at end of state change methods):
```swift
DispatchQueue.main.async { [weak self] in
    self?.objectWillChange.send()
}
```

---

See `BREAK_FREEZE_COMPREHENSIVE_FIX_PLAN.md` for full details.
