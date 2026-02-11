// admin/config.js
(function () {
  const isGitHubPages = /github\.io$/i.test(location.hostname);

  window.PS_ADMIN_CONFIG = {
    // GitHub Pages = no API (local mode)
    // Server domain = secure mode
    apiBase: isGitHubPages ? "" : window.location.origin,

    // Require login only on the real server
    requireLogin: !isGitHubPages
  };
})();