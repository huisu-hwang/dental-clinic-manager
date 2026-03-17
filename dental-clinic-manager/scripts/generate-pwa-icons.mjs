/**
 * PWA Icon Generator
 * Generates PNG icons for PWA manifest using sharp (Next.js peer dependency)
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'icons')

mkdirSync(iconsDir, { recursive: true })

// SVG template: Shield icon with blue gradient (matches project header style)
function createIconSvg(size) {
  const padding = Math.round(size * 0.12)
  const shieldSize = size - padding * 2
  const cx = size / 2
  const cy = size / 2

  // Cross dimensions
  const crossW = Math.round(shieldSize * 0.08)
  const crossH = Math.round(shieldSize * 0.28)
  const crossX = cx
  const crossY = cy + Math.round(shieldSize * 0.05)

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="shield" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>

  <!-- Rounded background -->
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="url(#bg)"/>

  <!-- Shield shape -->
  <path d="
    M ${cx} ${padding + Math.round(shieldSize * 0.05)}
    L ${cx + Math.round(shieldSize * 0.38)} ${padding + Math.round(shieldSize * 0.2)}
    L ${cx + Math.round(shieldSize * 0.38)} ${padding + Math.round(shieldSize * 0.55)}
    Q ${cx + Math.round(shieldSize * 0.38)} ${padding + Math.round(shieldSize * 0.75)} ${cx} ${padding + Math.round(shieldSize * 0.95)}
    Q ${cx - Math.round(shieldSize * 0.38)} ${padding + Math.round(shieldSize * 0.75)} ${cx - Math.round(shieldSize * 0.38)} ${padding + Math.round(shieldSize * 0.55)}
    L ${cx - Math.round(shieldSize * 0.38)} ${padding + Math.round(shieldSize * 0.2)}
    Z
  " fill="url(#shield)" opacity="0.95"/>

  <!-- Medical cross -->
  <rect x="${crossX - crossW/2}" y="${crossY - crossH/2}" width="${crossW}" height="${crossH}" rx="${Math.round(crossW * 0.2)}" fill="#3b82f6"/>
  <rect x="${crossX - crossH/2}" y="${crossY - crossW/2}" width="${crossH}" height="${crossW}" rx="${Math.round(crossW * 0.2)}" fill="#3b82f6"/>
</svg>`
}

const sizes = [
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const { name, size } of sizes) {
  const svg = createIconSvg(size)
  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(iconsDir, name))
  console.log(`Generated ${name} (${size}x${size})`)
}

console.log('All PWA icons generated successfully!')
