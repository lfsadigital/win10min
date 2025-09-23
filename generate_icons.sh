#!/bin/bash

# Generate App Icons Script
# Requires: ImageMagick (brew install imagemagick)

# Check if source icon exists
if [ ! -f "AppIcon-1024x1024.png" ]; then
    echo "Error: AppIcon-1024x1024.png not found!"
    echo "Please create the icon first using AppIcon.html"
    exit 1
fi

# Create Icons directory
mkdir -p AppIcons

# iPhone Icons
sips -z 180 180 AppIcon-1024x1024.png --out AppIcons/Icon-60@3x.png
sips -z 120 120 AppIcon-1024x1024.png --out AppIcons/Icon-60@2x.png
sips -z 120 120 AppIcon-1024x1024.png --out AppIcons/Icon-40@3x.png
sips -z 80 80 AppIcon-1024x1024.png --out AppIcons/Icon-40@2x.png
sips -z 87 87 AppIcon-1024x1024.png --out AppIcons/Icon-29@3x.png
sips -z 58 58 AppIcon-1024x1024.png --out AppIcons/Icon-29@2x.png
sips -z 60 60 AppIcon-1024x1024.png --out AppIcons/Icon-20@3x.png
sips -z 40 40 AppIcon-1024x1024.png --out AppIcons/Icon-20@2x.png

# iPad Icons
sips -z 167 167 AppIcon-1024x1024.png --out AppIcons/Icon-83.5@2x.png
sips -z 152 152 AppIcon-1024x1024.png --out AppIcons/Icon-76@2x.png
sips -z 76 76 AppIcon-1024x1024.png --out AppIcons/Icon-76.png
sips -z 40 40 AppIcon-1024x1024.png --out AppIcons/Icon-40.png
sips -z 29 29 AppIcon-1024x1024.png --out AppIcons/Icon-29.png
sips -z 20 20 AppIcon-1024x1024.png --out AppIcons/Icon-20.png

# App Store
cp AppIcon-1024x1024.png AppIcons/Icon-1024.png

echo "✅ Icons generated in AppIcons folder!"
echo "Now drag them into Assets.xcassets in Xcode"