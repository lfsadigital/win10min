# Win 10min - In-App Purchase Setup Guide

## Product Identifiers (From Code)
Your app uses these exact product IDs - they MUST match in App Store Connect:

1. **Lifetime Purchase**: `com.luiz.PandaApp.lifetime`
2. **Monthly Subscription**: `com.luiz.PandaApp.subscription.monthly`  
3. **Yearly Subscription**: `com.luiz.PandaApp.subscription.yearly`

## Step 1: Create Products in App Store Connect

### A. Create Lifetime Purchase (Non-Consumable)
1. Go to **App Store Connect** → Your App → **In-App Purchases**
2. Click **"+"** → Select **"Non-Consumable"**
3. Fill in:
   - **Reference Name**: Win 10min Lifetime Premium
   - **Product ID**: `com.luiz.PandaApp.lifetime`
   - **Price**: Choose your tier (recommended: $19.99 or $29.99)
   - **Display Name**: Lifetime Premium
   - **Description**: Unlock all premium features forever! Unlimited focus sessions, custom durations, advanced stats, premium buildings, and more.

### B. Create Monthly Subscription
1. Go to **Subscriptions** → Click **"+"**
2. Create Subscription Group:
   - **Reference Name**: Win 10min Premium
   - **Subscription Group Reference Name**: Premium Membership
3. Add Monthly Subscription:
   - **Reference Name**: Monthly Premium
   - **Product ID**: `com.luiz.PandaApp.subscription.monthly`
   - **Duration**: 1 Month
   - **Price**: Choose tier (recommended: $2.99 or $3.99)
   - **Display Name**: Monthly Premium
   - **Description**: All premium features with monthly billing

### C. Create Yearly Subscription  
1. In the same subscription group, click **"+"**
2. Fill in:
   - **Reference Name**: Yearly Premium
   - **Product ID**: `com.luiz.PandaApp.subscription.yearly`
   - **Duration**: 1 Year
   - **Price**: Choose tier (recommended: $19.99 or $29.99)
   - **Display Name**: Yearly Premium (Save 50%!)
   - **Description**: Best value! All premium features with yearly billing

## Step 2: Add Localization (Required)
For each product, add at least one localization:
1. Click on the product
2. Add **English (U.S.)** localization
3. Add Display Name and Description
4. Add screenshot (can use app screenshot showing premium features)

## Step 3: Submit with App Version
Based on your screenshots, you need to:
1. Create a new app version in App Store Connect
2. In the version page, scroll to **"In-App Purchases"** section
3. Click **"+"** and select all three products you created
4. Submit the app version for review

## Step 4: Configure in Xcode
1. In Xcode, select your project
2. Go to **Signing & Capabilities**
3. Ensure **"In-App Purchase"** capability is enabled
4. Make sure you're using the correct Bundle ID

## Step 5: Test with Sandbox
1. Create a Sandbox Tester account in App Store Connect:
   - Users and Access → Sandbox Testers → "+"
2. On your device:
   - Sign out of App Store (Settings → App Store → Sign Out)
   - Run app from Xcode
   - When prompted to sign in for purchase, use sandbox account

## Recommended Pricing Strategy

### Option 1: Budget-Friendly
- **Monthly**: $2.99
- **Yearly**: $19.99 (save 44%)
- **Lifetime**: $39.99

### Option 2: Standard
- **Monthly**: $3.99
- **Yearly**: $29.99 (save 37%)
- **Lifetime**: $49.99

### Option 3: Premium
- **Monthly**: $4.99
- **Yearly**: $39.99 (save 33%)
- **Lifetime**: $69.99

## Important Notes
- The product IDs MUST match exactly what's in the code
- You must submit IAPs with your first app version
- Subscriptions need to be in a subscription group
- Add promotional text to highlight savings on yearly plan
- Consider offering introductory pricing for first-time subscribers

## Testing Checklist
- [ ] All three products created in App Store Connect
- [ ] Product IDs match exactly with code
- [ ] Localizations added with screenshots
- [ ] Products added to app version
- [ ] Sandbox tester account created
- [ ] Tested purchase flow in development build
- [ ] Restore purchases functionality works
- [ ] Premium features unlock correctly after purchase