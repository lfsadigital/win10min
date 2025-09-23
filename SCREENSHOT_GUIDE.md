# Screenshot Guide for App Store

## Required Screenshots
You need screenshots for:
- **iPhone 6.5"** (iPhone 11 Pro Max, 12 Pro Max, 13 Pro Max, 14 Plus, 15 Plus)
- **iPhone 5.5"** (iPhone 6 Plus, 7 Plus, 8 Plus)

## Step-by-Step Process

### 1. Set Up Simulator
```bash
# In Xcode:
1. Product → Destination → iPhone 15 Pro Max (6.5")
2. Product → Run (⌘R)
3. Wait for app to load
```

### 2. Prepare App Data
Before taking screenshots, set up good sample data:
1. Complete 5-10 focus sessions (mix of success/failure)
2. Build up a nice city
3. Get to at least 70% success rate

### 3. Take Screenshots (⌘S in Simulator)

#### Screenshot 1: Hero Timer Shot
**Setup:**
1. Go to Focus tab
2. Start a session with task name "Study for exam"
3. Let timer run to about 7:23 remaining
4. Take screenshot when building animation is visible

#### Screenshot 2: Task Naming
**Setup:**
1. Go to Focus tab (timer not running)
2. Tap "Start Building"
3. When dialog appears with "What will you work on?"
4. Type "Write report" but don't submit
5. Take screenshot

#### Screenshot 3: Task Completion
**Setup:**
1. Complete a focus session
2. When "Did you complete: [task]?" appears
3. Take screenshot before selecting YES/NO
4. Shows the decision moment

#### Screenshot 4: City View
**Setup:**
1. Go to City tab
2. Make sure you have 8-12 buildings
3. Tap on Visual City tab
4. Take screenshot showing the isometric city
5. Best if taken during "sunset" sky

#### Screenshot 5: Stats Dashboard
**Setup:**
1. Go to Stats tab
2. Scroll to show Success Rate circle (should be 70%+)
3. Include compound growth chart
4. Take screenshot

#### Screenshot 6: Results/Celebration
**Setup:**
1. Complete a successful session
2. When results view shows with new building
3. Take screenshot of success screen

### 4. Alternative Screenshots (Optional)
- Settings showing timer options
- City with 20+ buildings
- Break confirmation screen
- Different building types in list

### 5. Export Screenshots
Simulator saves to: `~/Desktop/` by default

### 6. Edit Screenshots (Optional but Recommended)

Use **Screenshot** app or **Figma** to:
1. Add device frames
2. Add text overlays:
   - "Focus for just 10 minutes"
   - "Build your Roman Empire" 
   - "Track your success rate"
   - "Watch your city grow"
3. Add app store badges if needed

## Dimensions Reference
- **iPhone 6.5"**: 1284 × 2778 pixels (or 1242 × 2688 for older)
- **iPhone 5.5"**: 1242 × 2208 pixels

## Pro Tips
1. **Clean Status Bar**: Simulator → Device → Status Bar → Clean
2. **Best Time**: Set device time to 9:41 AM (Apple's standard)
3. **Full Battery**: Shows 100% battery
4. **No Notifications**: Clear all notifications before screenshots
5. **Consistent Data**: Use same city/progress for all screenshots

## Quick Simulator Commands
- **Screenshot**: ⌘S
- **Home**: ⌘⇧H  
- **Rotate**: ⌘← or ⌘→
- **Shake**: ⌃⌘Z

## Upload to App Store Connect
1. Go to App Store Connect
2. Select your app
3. Go to "App Store" tab → "Screenshots"
4. Drag and drop for each device size
5. Arrange in order listed above