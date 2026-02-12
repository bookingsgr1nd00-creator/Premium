// admin/config.js
(function () {
  const isGitHubPages = /github\.io$/i.test(location.hostname);

  window.PS_ADMIN_CONFIG = {
    // If you are on GitHub Pages => DEMO mode (no API, no real upload)
    // If you are on a server later => point this to your API origin, ex: "https://premiumsupply.ca"
    apiBase: isGitHubPages ? "" : window.location.origin,

    // In demo mode we don't force login (since it cannot be secure anyway)
    requireLogin: !isGitHubPages
  };
})();