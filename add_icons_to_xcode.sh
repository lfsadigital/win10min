#!/bin/bash

# Script to add app icons to Xcode Assets.xcassets

ASSETS_PATH="/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/PandaApp/PandaApp/Assets.xcassets/AppIcon.appiconset"
ICONS_PATH="/Users/luizfellipealmeida/cursor/PandaAppNew/PandaApp/AppIcons"

# Create AppIcon.appiconset directory if it doesn't exist
mkdir -p "$ASSETS_PATH"

# Copy icons with correct names for Xcode
echo "📱 Adding iPhone icons..."
cp "$ICONS_PATH/Icon-60@3x.png" "$ASSETS_PATH/Icon-60@3x.png"
cp "$ICONS_PATH/Icon-60@2x.png" "$ASSETS_PATH/Icon-60@2x.png"
cp "$ICONS_PATH/Icon-40@3x.png" "$ASSETS_PATH/Icon-40@3x.png"
cp "$ICONS_PATH/Icon-40@2x.png" "$ASSETS_PATH/Icon-40@2x.png"
cp "$ICONS_PATH/Icon-29@3x.png" "$ASSETS_PATH/Icon-29@3x.png"
cp "$ICONS_PATH/Icon-29@2x.png" "$ASSETS_PATH/Icon-29@2x.png"
cp "$ICONS_PATH/Icon-20@3x.png" "$ASSETS_PATH/Icon-20@3x.png"
cp "$ICONS_PATH/Icon-20@2x.png" "$ASSETS_PATH/Icon-20@2x.png"

echo "📱 Adding iPad icons..."
cp "$ICONS_PATH/Icon-83.5@2x.png" "$ASSETS_PATH/Icon-83.5@2x.png"
cp "$ICONS_PATH/Icon-76@2x.png" "$ASSETS_PATH/Icon-76@2x.png"
cp "$ICONS_PATH/Icon-76.png" "$ASSETS_PATH/Icon-76.png"
cp "$ICONS_PATH/Icon-40.png" "$ASSETS_PATH/Icon-40.png"
cp "$ICONS_PATH/Icon-29.png" "$ASSETS_PATH/Icon-29.png"
cp "$ICONS_PATH/Icon-20.png" "$ASSETS_PATH/Icon-20.png"

echo "🏪 Adding App Store icon..."
cp "$ICONS_PATH/Icon-1024.png" "$ASSETS_PATH/Icon-1024.png"

# Create Contents.json for the asset catalog
cat > "$ASSETS_PATH/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "Icon-20@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-20@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-29@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-29@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-40@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-40@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-60@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "60x60"
    },
    {
      "filename" : "Icon-60@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "60x60"
    },
    {
      "filename" : "Icon-20.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-20@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-29.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-29@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-40.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-40@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-76.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "76x76"
    },
    {
      "filename" : "Icon-76@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "76x76"
    },
    {
      "filename" : "Icon-83.5@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "83.5x83.5"
    },
    {
      "filename" : "Icon-1024.png",
      "idiom" : "ios-marketing",
      "scale" : "1x",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

echo "✅ Icons successfully added to Xcode project!"
echo "📱 Now rebuild your app to see the new icon"
echo ""
echo "To rebuild, run:"
echo "xcodebuild -project PandaApp.xcodeproj -scheme PandaApp -destination 'platform=iOS Simulator,name=iPhone 16' build"