# Receipt Validator - Deployment Instructions

**TEMPORARY WORKAROUND** for StoreKit restoration issue with deleted product ID `com.luiz.PandaApp.lifetime`.

This serverless function validates App Store receipts directly with Apple's API, allowing restoration of purchases even when the product ID has been deleted from App Store Connect.

## Quick Start (5 minutes)

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Deploy to Vercel

```bash
cd /Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/receipt-validator
vercel login
vercel --prod
```

Follow the prompts:
- **Set up and deploy?** Yes
- **Which scope?** Select your account
- **Link to existing project?** No
- **Project name?** `pandaapp-receipt-validator` (or any name you want)
- **Directory?** `.` (current directory)
- **Override settings?** No

### 3. Copy Your Deployment URL

After deployment, Vercel will show:
```
✅  Production: https://pandaapp-receipt-validator.vercel.app [copied to clipboard]
```

### 4. Update PremiumManager.swift

Open `/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Models/PremiumManager.swift`

Find line 658:
```swift
let endpoint = "https://your-app.vercel.app/api/validate"
```

Replace with your actual URL:
```swift
let endpoint = "https://pandaapp-receipt-validator.vercel.app/api/validate"
```

### 5. Test

1. Archive and upload to TestFlight (Build 143)
2. Install on your iPhone
3. Tap "Restore Purchases"
4. Check Console.app logs for "SERVER VALIDATION" messages

## How It Works

1. **StoreKit fails** to find the deleted product ID
2. **App extracts** the App Store receipt from the device
3. **Server validates** the receipt with Apple's API
4. **Apple returns** ALL purchases (including deleted product IDs)
5. **Server checks** for lifetime purchases
6. **App grants** premium access if found

## What the Server Returns

```json
{
  "success": true,
  "hasLifetime": true,
  "environment": "Production",
  "purchases": [
    {
      "productId": "com.luiz.PandaApp.lifetime",
      "transactionId": "1000000123456789",
      "purchaseDate": "2025-09-25 12:34:56 Etc/GMT",
      "cancelled": false
    }
  ]
}
```

## Cleanup (After Apple Restores Product ID)

Once `com.luiz.PandaApp.lifetime` is restored in App Store Connect:

### 1. Remove from PremiumManager.swift

Delete lines 613-729 (the entire `tryServerSideRestore()` method and fallback logic).

### 2. Delete Vercel Deployment

```bash
vercel remove pandaapp-receipt-validator
```

### 3. Delete Local Files

```bash
rm -rf /Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/receipt-validator
```

## Troubleshooting

### "No receipt file found"
- Receipt doesn't exist on device
- This happens in simulator or if app was never downloaded from App Store
- Test with real device and TestFlight build

### "Server returned error: 400"
- Check Console.app for error details
- Likely receipt validation failed with Apple
- Verify receipt is from production App Store (not sandbox)

### "Server returned error: 500"
- Server-side error
- Check Vercel logs: `vercel logs pandaapp-receipt-validator`

### Server validation doesn't run
- Make sure StoreKit restore fails first
- Server validation only runs if `isPremium` is still false after StoreKit

## Security Notes

- No passwords or API keys required (App Store receipts are self-contained)
- Server never stores any data
- Receipt validation happens directly with Apple
- All communication over HTTPS

## Cost

**FREE** on Vercel's hobby plan:
- 100GB bandwidth/month
- 100 serverless function executions/day
- More than enough for this use case

---

**Questions?** Check Vercel docs: https://vercel.com/docs
