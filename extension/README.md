# Hosty Chrome extension

Publish anything to Hosty without leaving the browser:

- **Drag & drop** a ZIP/HTML/PDF/image onto the popup → live URL (copied to
  your clipboard and opened in a new tab).
- **Publish AI code**: on a ChatGPT / Claude / Gemini / Grok / DeepSeek tab,
  click *Publish AI code* to grab the latest code block from the conversation
  and host it as a live page.
- **Recent projects** list, with one-click "update with next upload" to
  re-deploy an existing project instead of creating a new one.
- Signs in with a Hosty **API key** (Dashboard → API keys); the key is stored
  in `chrome.storage.local` and used against the public REST API v1.

## Install (developer mode)

1. `chrome://extensions` → enable *Developer mode*
2. *Load unpacked* → select this `extension/` folder
3. Click the Hosty icon, paste your API key

## Icons

Placeholder PNGs (16/48/128 px) live in `icons/`. Replace with brand assets
before publishing to the Chrome Web Store.
