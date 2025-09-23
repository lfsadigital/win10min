# App Store Connect - Review Information

## For Subscription Images (1024x1024)

### How to Generate:
1. Open `SubscriptionImage.html` in your browser:
   ```bash
   open /Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/SubscriptionImage.html
   ```
2. Click the button for the subscription type you need
3. Click "Download Image" to save the 1024x1024 PNG
4. Upload to App Store Connect

## Review Notes for Each Product

### Monthly Subscription Review Notes:
```
Win 10min Monthly Premium Subscription

This is a monthly auto-renewable subscription that unlocks all premium features:
- Unlimited focus sessions (free users limited to 10/day)
- Custom timer durations (5-90 minutes)
- Advanced statistics and progress tracking
- Premium buildings (Colosseum, Circus Maximus)
- App blocking selection control
- Skip or shorten breaks
- Export progress data

The subscription auto-renews monthly at $9.99 unless cancelled.
Users can manage subscriptions in Settings.

To test: 
1. Tap any premium feature or the crown icon
2. Select Monthly subscription
3. Complete purchase with sandbox account
4. Premium features unlock immediately
```

### Yearly Subscription Review Notes:
```
Win 10min Yearly Premium Subscription

This is a yearly auto-renewable subscription offering the best value with 58% savings compared to monthly.

Includes all premium features:
- Everything from monthly subscription
- Best value pricing (save 50%)
- Priority support
- Early access to new features

The subscription auto-renews yearly at $49.99 unless cancelled.
Users can manage subscriptions in Settings.

To test:
1. Tap any premium feature or the crown icon
2. Select Yearly subscription (highlighted as best value)
3. Complete purchase with sandbox account
4. Premium features unlock immediately
```

### Lifetime Purchase Review Notes:
```
Win 10min Lifetime Premium

This is a one-time non-consumable purchase that permanently unlocks all premium features.

Includes:
- All current premium features
- All future premium features
- No recurring charges
- Restored on all devices with same Apple ID

This is a one-time purchase of $49.99.

To test:
1. Tap any premium feature or the crown icon
2. Select Lifetime option
3. Complete purchase with sandbox account
4. Premium features unlock permanently
5. Test restore purchases on another device
```

## Screenshot Requirements

For the screenshot field, you can use:
1. A screenshot of your app's premium features screen
2. The generated subscription promotional image
3. A screenshot showing the timer with premium features

### To Take App Screenshots:
1. Run app in Simulator (iPhone 15 Pro recommended)
2. Navigate to Premium screen
3. Press Cmd+S to save screenshot
4. Use this for the review screenshot

## Common Review Questions & Answers

**Q: What happens if user cancels subscription?**
A: User keeps premium features until the end of current billing period, then reverts to free tier (10 sessions/day limit).

**Q: Can users switch between monthly and yearly?**
A: Yes, iOS handles this automatically. Users can upgrade/downgrade in Settings > Subscriptions.

**Q: How do users restore purchases?**
A: Settings screen has a "Restore Purchases" button that queries StoreKit for previous purchases.

**Q: What's the difference between subscription and lifetime?**
A: Subscriptions are recurring (monthly/yearly) while lifetime is a one-time purchase. Both unlock the same features.

**Q: Are subscriptions shareable with Family Sharing?**
A: No, subscriptions are individual. Only the lifetime purchase could potentially be shared (if enabled).

## Test Account Instructions

Include this in your review notes:
```
To test purchases:
1. Use sandbox test account (create in App Store Connect > Users > Sandbox Testers)
2. Sign out of App Store on device
3. Run app and attempt purchase
4. Sign in with sandbox account when prompted
5. Purchases are free in sandbox environment
```

## Important Review Guidelines

Make sure to mention:
- App blocks distracting apps using Screen Time API (requires user permission)
- Focus sessions are 10 minutes by default (customizable with premium)
- Roman Empire theme is gamification, not historical education
- No inappropriate content, suitable for all ages
- No social features that require moderation