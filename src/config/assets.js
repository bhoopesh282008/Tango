// Where a file from public/ is served from. The site is not always at the root of its host:
// GitHub Pages serves a project under /Tango/, and a bare '/images/x.webp' would then point
// at the wrong place (the user's own site root). BASE_URL is set at build time by VITE_BASE.
export const asset = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
