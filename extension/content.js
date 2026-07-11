/* Runs on AI chat sites (ChatGPT, Claude, Gemini, Grok, DeepSeek).
   Exposes window.__hostyGrabCode(): returns the most recent code block's
   text so the popup can publish it as a live page. */

window.__hostyGrabCode = function () {
  // All supported chat UIs render code inside <pre> blocks; take the last,
  // longest-looking one (prefer blocks that look like full HTML documents).
  const blocks = Array.from(document.querySelectorAll("pre"))
    .map((pre) => pre.innerText.trim())
    .filter((t) => t.length > 40);
  if (blocks.length === 0) return null;

  const htmlBlocks = blocks.filter((t) => /<html|<!doctype/i.test(t));
  if (htmlBlocks.length) return htmlBlocks[htmlBlocks.length - 1];
  return blocks[blocks.length - 1];
};
