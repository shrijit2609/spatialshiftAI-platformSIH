const fs = require('fs');
const path = require('path');

/** Copy MapLibre v6 worker + sibling chunk into public/ so webpack/Next
 *  cannot rewrite import.meta.url. See MapLibre Next.js installation docs. */
function copyMaplibreWorkers() {
  const pkgDir = path.dirname(require.resolve('maplibre-gl/package.json'));
  const dist = path.join(pkgDir, 'dist');
  const dest = path.join(__dirname, 'public', 'maplibre');
  fs.mkdirSync(dest, { recursive: true });
  for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
    fs.copyFileSync(path.join(dist, file), path.join(dest, file));
  }
}

copyMaplibreWorkers();

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
