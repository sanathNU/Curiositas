// Dark mode: follows prefers-color-scheme unless the reader picks one with the toggle.
// Loaded in <head> so the saved theme applies before first paint.
(function () {
  const KEY = "curiositas-theme";
  const root = document.documentElement;

  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  } catch (_) { /* storage blocked: fall back to system preference */ }

  function currentTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  document.addEventListener("DOMContentLoaded", function () {
    const button = document.getElementById("theme-toggle");
    if (!button) return;
    button.addEventListener("click", function () {
      const next = currentTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (_) {}
    });
  });
})();
