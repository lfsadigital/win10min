# Adding Shield Configuration Extension to Xcode

## Steps to Add the Shield Extension Target

### 1. Open Xcode
Open your PandaApp project in Xcode

### 2. Add New Target
1. Go to **File → New → Target**
2. Select **iOS** platform
3. Search for "App Extension"
4. Choose **Shield Configuration Extension**
5. Click **Next**

### 3. Configure the Target
- **Product Name**: PandaAppShield
- **Team**: Select your team
- **Bundle Identifier**: com.luiz.PandaApp.Shield
- **Language**: Swift
- **Embed in Application**: PandaApp
- Click **Finish**

### 4. Replace Generated Files
The extension files have been created at:
- `/PandaAppShield/ShieldConfigurationExtension.swift`
- `/PandaAppShield/Info.plist`
- `/PandaAppShield/PandaAppShield.entitlements`

Replace the Xcode-generated files with these.

### 5. Configure Build Settings
1. Select the **PandaAppShield** target
2. Go to **Signing & Capabilities**
3. Ensure these capabilities are added:
   - Family Controls (should be automatic)
   - App Groups: `group.com.luiz.PandaApp`

### 6. Update Info.plist
The Info.plist is already configured with:
```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.ManagedSettings.shield-configuration</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShieldConfigurationExtension</string>
</dict>
```

### 7. Build and Test
1. Clean build folder: `Cmd + Shift + K`
2. Build the project: `Cmd + B`
3. Run on your device

## What the Shield Shows

Your custom shield will display:
- **Icon**: 🏛️ (building columns)
- **Title**: "Focus Mode Active 🏛️"
- **Subtitle**: "Return to 10 Minutes to continue building your empire"
- **Button**: "OK" (in imperial purple)
- **Background**: Dark with blur effect

## Customization

You can modify the appearance in `ShieldConfigurationExtension.swift`:
- Change colors
- Update text messages
- Use different icons
- Adjust blur styles

## Testing
1. Start a focus session in your app
2. Try to open a blocked app
3. You should see your custom shield instead of the generic "Restricted" screen