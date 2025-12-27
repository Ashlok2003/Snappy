# 📸 Snappy Pro

A professional Chrome extension for capturing, annotating, and cropping screenshots with ease.

## Features

- **📷 Instant Capture** - Capture the visible area of any webpage with one click
- **✂️ Precise Cropping** - Drag to select exactly the area you want
- **🎨 Annotation Tools**
  - **Pen** - Freehand drawing for highlighting and marking
  - **Arrow** - Add directional arrows to point out important details
  - **Text** - Insert text labels anywhere on your screenshot
- **🎨 Color Palette** - Choose from 6 vibrant colors for your annotations
- **💾 One-Click Download** - Save your annotated screenshots as PNG files
- **⌨️ Keyboard Shortcuts** - Press `ESC` to cancel at any time

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `snappy` folder
6. The extension is now ready to use!

## How to Use

1. Click the **Snappy Pro** extension icon in your browser toolbar
2. Click **Capture Visible Area**
3. Drag to select the area you want to capture
4. Use the toolbar to:
   - Switch between **Select**, **Pen**, **Arrow**, or **Text** tools
   - Choose your preferred **color**
   - Add annotations to your screenshot
5. Click **Save** to download your screenshot
6. Press `ESC` to cancel at any time

## Tech Stack

- **Manifest V3** - Latest Chrome extension architecture
- **Vanilla JavaScript** - No external dependencies
- **Canvas API** - Multi-layer rendering for non-destructive editing
- **Chrome APIs** - `chrome.tabs`, `chrome.scripting`, `chrome.downloads`

## Project Structure

```
snappy/
├── manifest.json       # Extension configuration
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic and screenshot capture
├── content.js          # Main annotation and cropping logic
├── styles.css          # Professional UI styling
├── background.js       # Service worker for downloads
└── icons/              # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Browser Compatibility

- ✅ Chrome (Recommended)
- ✅ Edge (Chromium-based)
- ✅ Brave
- ✅ Other Chromium-based browsers

**Note:** This extension cannot capture `chrome://` pages or extension pages due to browser security restrictions.

## License

MIT License - Feel free to use and modify for your own projects.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

---

**Made with ❤️ for productivity enthusiasts**
