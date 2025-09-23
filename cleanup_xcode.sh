#!/bin/bash

echo "🧹 Cleaning up Xcode project..."

# Clean build folders
echo "Cleaning build folders..."
xcodebuild -project PandaApp.xcodeproj -scheme PandaApp clean

# Remove derived data
echo "Removing derived data..."
rm -rf ~/Library/Developer/Xcode/DerivedData/PandaApp-*

# List any missing files that might need removal from project
echo ""
echo "⚠️  Please manually remove these files from Xcode if they appear in red:"
echo "  - StoreManager.swift"
echo "  - StoreView.swift"
echo "  - PandaManager.swift"
echo "  - PandaTypes.swift"
echo ""
echo "Steps to fix in Xcode:"
echo "1. Open Xcode"
echo "2. Select any red (missing) files in the navigator"
echo "3. Press Delete key and choose 'Remove Reference'"
echo "4. Clean Build Folder (Shift+Cmd+K)"
echo "5. Build and Run (Cmd+R)"
echo ""
echo "✅ Cleanup complete!"