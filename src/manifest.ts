import { defineManifest } from '@crxjs/vite-plugin'
import packageData from '../package.json'

const isDev = process.env.NODE_ENV == 'development'

export default defineManifest({
  name: `${packageData.displayName || packageData.name}${isDev ? ` ➡️ Dev` : ''}`,
  description: 'Cross-domain link? Pop confetti, chase the URL.',
  version: packageData.version,
  manifest_version: 3,
  icons: {
    16: 'img/logo-16.png',
    32: 'img/logo-32.png',
    48: 'img/logo-48.png',
    128: 'img/logo-128.png',
  },
  action: {
    default_popup: 'popup.html',
    default_icon: 'img/logo-48.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  commands: {
    toggle: {
      suggested_key: {
        default: 'Ctrl+Slash',
        mac: 'Command+Slash',
      },
      description: 'Toggle LinkBypass on/off',
    },
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/contentScript/index.ts'],
      run_at: 'document_start',
    },
  ],
  permissions: ['storage', 'contextMenus'],
  host_permissions: ['http://*/*', 'https://*/*'],
})
