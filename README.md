# FlashFuzz

Quickly fuzz URLs and scan for secrets directly in your browser tabs.

Fast, lightweight, and designed for security engineers who want immediate reconnaissance without leaving the browser.

## Features

- Fuzz URLs across open tabs
- Use custom wordlists or built-in example lists.
- Concurrent requests with configurable batch size.
- Scan JavaScript files loaded in each tab for likely secrets (API keys, tokens, AWS keys, regex-based indicators).
- Export findings as a TXT report that includes full URL and scan timestamp in the header (easy to archive/share).
- Lightweight UI for quick runs and detailed results with request/response snapshots.
