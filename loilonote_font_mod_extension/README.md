# LoiLoNote Font Selector MOD

A Chrome extension that adds font selection, dark mode, and colorful mode to LoiLoNote School web app.

## Features

- 🎨 **Font Selection** — Choose from 24 Google Fonts + system fonts
- 🌙 **Dark Mode** — Toggle dark theme for the note list view
- 🌈 **Colorful Mode** — Fun colorful theme (mutually exclusive with dark mode)
- 📝 **Editor Font Control** — Apply fonts to selected text in the note editor
- ⚡ **Performance Optimized** — CSS-based dark mode, no lag

## Installation

### From Source (Developer Mode)

1. Download or clone this repository
2. Open Chrome/Helium and go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `loilonote_font_mod_extension` folder

### From Chrome Web Store

(Coming soon)

## Usage

1. Open [LoiLoNote School](https://loilonote.app)
2. Click the **"Font"** button (bottom-left corner)
3. Select a font from the dropdown
4. Use **"Dark"** button for dark mode
5. Use **"Colorful"** button for colorful mode

### Global vs Selection
- **"アプリ全体に適用"** — Apply font to all text on the page
- **"選択テキストに適用"** — Apply font to selected text only

## Compatibility

- Chrome 88+ (Manifest V3)
- Helium Browser
- Edge (Chromium-based)

## Known limitations

- Dark mode only applies to note list views (not the note editor canvas)
- Font changes may not persist across page navigations in some cases
- LoiLoNote UI updates may break selectors

## Development

The extension consists of:
- `manifest.json` — Extension metadata
- `background.js` — Service worker for toggle action
- `content.js` — Main content script (font, dark mode, colorful mode)

## 注意事項

本拡張機能はLoiLoNoteのWeb UIの見た目を変更します。データの収集や送信は一切行いません。LoiLoNoteのアップデートにより機能が動作しなくなる可能性があります。作者は本拡張機能の使用によって生じた結果について責任を負いません。

## License

MIT
