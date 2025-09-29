
// === Desktop chat rail fix (drop-in) ===
// Auto-detects #chat-panel and keeps --chat-w in sync with its width.
// Adds / removes .chat-open on <html> whenever the panel's .open class changes.
(() => {
  const html = document.documentElement;
  const panel = document.getElementById('chat-panel');
  if (!panel) return;

  const apply = () => {
    const open = panel.classList.contains('open');
    html.classList.toggle('chat-open', open);
    const w = open ? Math.round(panel.getBoundingClientRect().width) : 0;
    html.style.setProperty('--chat-w', w + 'px');
  };

  // Track class changes on the panel (open/close)
  new MutationObserver(apply).observe(panel, { attributes: true, attributeFilter: ['class'] });
  // Track width changes (resize, zoom, clamp())
  const ro = new ResizeObserver(apply);
  ro.observe(panel);
  // Handle window resizes too
  window.addEventListener('resize', apply, { passive: true });

  // Initial sync
  apply();
})();
