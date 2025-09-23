# Win 10min - App Store Submission Checklist

## ✅ What's Already Done:
- App name changed to "Win 10min" in Info.plist
- App icon updated with Roman coin design
- All three IAP products created in App Store Connect
- StoreKit configuration for testing

## 🔧 What You Need to Fix:

### 1. Fix "Missing Metadata" for Yearly Subscription
1. In App Store Connect, click on "Yearly" subscription
2. Add localization (English U.S.)
3. Add Display Name: "Yearly Premium - Save 50%"
4. Add Description: "Best value! All premium features with yearly billing. Unlimited focus sessions, custom durations, advanced stats, and more."
5. Add a screenshot (use any app screenshot)
6. Save

### 2. Submit with New App Version
Since you're seeing "Your first in-app purchase must be submitted with a new app version":

1. **Create New Version** in App Store Connect:
   - Go to your app → "+" → New Version
   - Version Number: 1.0.1 (or whatever is next)
   - What's New: "Introducing Win 10min Premium! Unlock unlimited focus sessions and advanced features."

2. **Update App Name** (in the new version):
   - In the version information, change "App Name" to "Win 10min"

3. **Add IAPs to Version**:
   - Scroll to "In-App Purchases" section
   - Click "+" and select all three products:
     - lifetime
     - Monthly subscription
     - Yearly subscription

4. **Upload Build**:
   - In Xcode: Product → Archive
   - Upload to App Store Connect
   - Select the build in your version

5. **Submit for Review**

## 📱 Testing Before Submission:

### Test with StoreKit (Local Testing):
1. In Xcode: Product → Scheme → Edit Scheme
2. Options tab → StoreKit Configuration → Select "PandaApp.storekit"
3. Run the app
4. Try purchasing (it's free in StoreKit testing)

### Test App Selection Button:
- I've temporarily made it visible for all users
- **IMPORTANT**: Before final submission, change it back to premium-only by editing line 183 in RomanTimerView.swift

## 🚨 Before Final Submission:
1. [ ] Fix yearly subscription metadata
2. [ ] Test all purchases work in StoreKit
3. [ ] Change app selection button back to premium-only
4. [ ] Increment build number in Xcode
5. [ ] Archive and upload build
6. [ ] Add all IAPs to the version
7. [ ] Fill in version notes
8. [ ] Submit for review

## 💡 Tips:
- The app name in App Store Connect updates when you submit the new version
- IAPs must be submitted with a version to become active
- Once approved, you can add more IAPs without new versions