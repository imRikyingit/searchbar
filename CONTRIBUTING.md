# Contributing

Thank you for your interest in improving Searchbar.

## How to contribute

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test the extension in Edge using `Load unpacked`
5. Open a pull request

## Development notes

- Main extension entry: `manifest.json`
- Popup UI: `src/popup/`
- Background logic: `src/js/background.js`
- In-page switcher logic: `src/js/content.js`
- Shared helpers and built-in engines: `src/js/utils.js`
- Localization files: `_locales/`

## Pull request tips

- Keep changes focused
- Update README if user-facing behavior changes
- Update CHANGELOG.md for notable changes
- Preserve bilingual copy when editing visible text

## Bug reports

When possible, include:
- Edge version
- Extension version
- Target website
- Steps to reproduce
- Screenshots or screen recordings
