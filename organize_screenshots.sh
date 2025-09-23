#!/bin/bash

# Create App Store Screenshots directory
SCREENSHOT_DIR="/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/AppStoreScreenshots"
mkdir -p "$SCREENSHOT_DIR"

echo "📱 Organizing App Store Screenshots..."

# The 6 BEST screenshots for App Store (in order of importance)
# 1. Hero Timer - Shows the main timer screen
# 2. Task Naming - Shows "What will you work on?" dialog
# 3. Break Confirmation - Shows "Building Complete!" with break options
# 4. Construction Complete - Shows celebration screen
# 5. City View - Shows your Roman city
# 6. Stats Dashboard - Shows success rate and graphs

# Copy and rename the best screenshots
echo "1️⃣ Hero Timer Screen..."
cp "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.07.38.png" \
   "$SCREENSHOT_DIR/1_Hero_Timer.png"

echo "2️⃣ Task Naming Dialog..."
cp "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.25.12.png" \
   "$SCREENSHOT_DIR/2_Task_Naming.png"

echo "3️⃣ Break Confirmation..."
cp "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.13.25.png" \
   "$SCREENSHOT_DIR/3_Break_Confirmation.png"

echo "4️⃣ Construction Complete..."
cp "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.13.16.png" \
   "$SCREENSHOT_DIR/4_Construction_Complete.png"

# Check if there are City and Stats screenshots
if [ -f "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.09.08.png" ]; then
    echo "5️⃣ City View..."
    cp "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.09.08.png" \
       "$SCREENSHOT_DIR/5_City_View.png"
fi

if [ -f "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.09.24.png" ]; then
    echo "6️⃣ Stats Dashboard..."
    cp "/Users/luizfellipealmeida/Desktop/Simulator Screenshot - iPhone 16 Pro - 2025-08-26 at 15.09.24.png" \
       "$SCREENSHOT_DIR/6_Stats_Dashboard.png"
fi

# Create a README for App Store Connect
cat > "$SCREENSHOT_DIR/README.md" << 'EOF'
# App Store Screenshots Order

## Upload these screenshots to App Store Connect in this order:

### iPhone 6.7" Display (iPhone 16 Pro Max, 15 Pro Max, 14 Pro Max)
1. **1_Hero_Timer.png** - Main timer screen showing "BUILD YOUR EMPIRE"
2. **2_Task_Naming.png** - "What will you work on?" dialog
3. **3_Break_Confirmation.png** - "Building Complete!" break options
4. **4_Construction_Complete.png** - Celebration screen with confetti
5. **5_City_View.png** - Your Roman city visualization
6. **6_Stats_Dashboard.png** - Success rate and statistics

### Suggested Captions for Each Screenshot:

1. "Focus for just 10 minutes at a time"
2. "Name your task and stay accountable"
3. "Choose to rest or keep building"
4. "Celebrate every completed session"
5. "Watch your Roman Empire grow"
6. "Track your success with beautiful stats"

## Notes:
- These are iPhone 16 Pro screenshots (1290 × 2796 pixels)
- You may need to also capture iPad screenshots if your app supports iPad
- Consider adding device frames using tools like:
  - https://mockuphone.com
  - https://www.apple.com/app-store/product-page/
  - Figma templates

## To Upload:
1. Go to App Store Connect
2. Select your app
3. Navigate to the "Screenshots" section
4. Drag these 6 screenshots in order
5. Add the suggested captions
EOF

echo ""
echo "✅ Screenshots organized successfully!"
echo "📁 Location: $SCREENSHOT_DIR"
echo ""
echo "Your 6 App Store screenshots are ready:"
ls -la "$SCREENSHOT_DIR"/*.png 2>/dev/null | wc -l | xargs echo "Total screenshots:"
echo ""
echo "📝 Next steps:"
echo "1. Open $SCREENSHOT_DIR"
echo "2. Review the screenshots"
echo "3. Optionally add device frames"
echo "4. Upload to App Store Connect"