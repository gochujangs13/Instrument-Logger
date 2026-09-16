export async function applyAppVersion() {
  try {
    const response = await fetch(new URL('./version.json', import.meta.url), {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const release = await response.json();
    const label = release.version ? `v${release.version}` : '';
    document.querySelectorAll('[data-app-version]').forEach(node => {
      node.textContent = label;
      node.title = release.releaseDate
        ? `Release ${label} (${release.releaseDate})`
        : `Release ${label}`;
    });

    if (label && !document.title.includes(label)) {
      document.title = `${document.title} ${label}`;
    }
    window.APP_RELEASE = Object.freeze(release);
    return release;
  } catch (error) {
    console.warn('[version] release information could not be loaded:', error);
    return null;
  }
}
