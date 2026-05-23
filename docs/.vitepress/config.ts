import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'UniPet',
  description: 'A desktop pet that watches your AI coding agents — so you don\'t have to.',
  base: '/',

  head: [
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/http-api' },
      { text: 'Themes', link: '/themes' },
      {
        text: 'v0.1.7',
        items: [
          { text: 'Changelog', link: 'https://github.com/qaz154/unipet/releases' },
          { text: 'GitHub', link: 'https://github.com/qaz154/unipet' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Integration',
        items: [
          { text: 'HTTP API', link: '/http-api' },
          { text: 'MCP Tools', link: '/mcp' },
          { text: 'Adapters', link: '/adapters' },
          { text: 'CLI', link: '/cli' },
        ],
      },
      {
        text: 'Customization',
        items: [
          { text: 'Themes', link: '/themes' },
          { text: 'Renderers', link: '/renderers' },
          { text: 'Live2D SDK Integration', link: '/live2d-sdk' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/qaz154/unipet' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 UniPet Contributors',
    },

    search: {
      provider: 'local',
    },
  },
})
