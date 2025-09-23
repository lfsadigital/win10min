# Screen Time API Breakthrough Documentation

## The Problem We Solved
We initially tried to use `DeviceActivityMonitor` to **detect** when users switched apps, then send warnings and fail the session after 5 seconds. This approach completely failed:
- Monitoring events never triggered
- "Connection invalidated" errors
- Complex warning/countdown logic that didn't work
- Apps weren't actually blocked

## The Solution: Block, Don't Monitor!
Use `ManagedSettingsStore` to **block apps entirely** during focus sessions - exactly like Forest, Opal, and One Sec do.

## Key Implementation

### 1. Core Blocking Code
```swift
// AppBlockingManager.swift
class AppBlockingManager: ObservableObject {
    private let store = ManagedSettingsStore()
    
    func startBlocking() {
        // Block the selected apps
        store.shield.applications = activitySelection.applicationTokens
        store.shield.applicationCategories = ShieldSettings.ActivityCategoryPolicy.specific(activitySelection.categoryTokens)
    }
    
    func stopBlocking() {
        // Clear all restrictions
        store.shield.applications = nil
        store.shield.applicationCategories = nil
    }
}
```

### 2. Critical Requirements

#### Authorization
- Must request Screen Time permission: `AuthorizationCenter.shared.requestAuthorization(for: .individual)`
- Check status before blocking: `authorizationStatus == .approved`
- User must approve in Settings > Screen Time

#### Clear on Launch
```swift
// Always clear shields on app launch to prevent permanent blocking
init() {
    store.shield.applications = nil
    store.shield.applicationCategories = nil
    store.shield.webDomains = nil
}
```

#### Physical Device Only
- Shields do NOT work in simulator
- Must test on real iPhone/iPad
- Connect device via USB and run from Xcode

#### App Selection
- Use `FamilyActivityPicker` for user to select apps
- Selection gives you `ApplicationToken` and `CategoryToken`
- Cannot programmatically create tokens (security restriction)

### 3. Why This Works

1. **Correct API Usage**: `ManagedSettingsStore` is designed for blocking, not `DeviceActivityMonitor`
2. **Simple Logic**: Just block/unblock, no complex monitoring
3. **System UI**: Shows Apple's "This app is not allowed" screen
4. **Reliable**: Works consistently, no timing issues

### 4. What We Removed
- All `DeviceActivityMonitor` code
- Warning countdowns
- App switch detection
- Focus state tracking
- Complex failure logic

### 5. Limitations (By Design)
- Cannot customize the blocking screen text
- Tokens don't persist across app reinstalls
- Must test on physical device
- User must grant Screen Time permission

## The Breakthrough
**Stop trying to monitor app usage - just BLOCK the apps entirely!**

This is how all successful focus apps work. The Screen Time API is meant for blocking, not monitoring. Once we understood this, implementation became trivial and everything worked perfectly.

## Testing Checklist
- [ ] Clean build folder (Cmd+Shift+K)
- [ ] Connect physical iPhone via USB
- [ ] Run app on device (not simulator)
- [ ] Grant Screen Time permission when prompted
- [ ] Select apps to block (recommend "All Apps & Categories")
- [ ] Start focus session
- [ ] Try to open blocked app → See "not allowed" screen
- [ ] End session → Apps unblocked

## Result
The app now works exactly like Forest - blocking distracting apps during focus sessions with Apple's built-in Screen Time restrictions.