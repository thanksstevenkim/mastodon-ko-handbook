/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '마스토돈 한국어 운영 핸드북',
  tagline: '마스토돈 서버를 처음 설치하고 운영하는 사람을 위한 비공식 한국어 실무 안내서',
  url: 'https://thanksstevenkim.github.io',
  baseUrl: '/mastodon-ko-handbook/',
  organizationName: 'thanksstevenkim',
  projectName: 'mastodon-ko-handbook',
  onBrokenLinks: 'throw', // Reject unresolved site links during the build.
  i18n: {defaultLocale: 'ko', locales: ['ko']},
  markdown: {format: 'detect'},
  presets: [
    ['classic', {
      docs: {
        path: 'docs',
        routeBasePath: 'guide',
        sidebarPath: './sidebars.js',
        editUrl: 'https://github.com/thanksstevenkim/mastodon-ko-handbook/edit/main/',
      },
      blog: false,
      theme: {customCss: './src/css/custom.css'},
    }],
  ],
  themeConfig: {
    navbar: {
      title: '마스토돈 핸드북',
      items: [
        {to: '/menu/install', label: '처음 설치', position: 'left'},
        {to: '/menu/operate', label: '서버 운영', position: 'left'},
        {to: '/menu/problems', label: '문제 해결', position: 'left'},
        {to: '/menu/more', label: '보안·심화', position: 'left'},
        {href: 'https://github.com/thanksstevenkim/mastodon-ko-handbook', label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'light',
      links: [
        {title: '문서', items: [
          {label: '처음 시작하기', to: '/guide/getting-started/introduction'},
          {label: '운영하기', to: '/guide/operations/backup-readiness'},
          {label: '장애 해결', to: '/guide/troubleshooting/known-failures'},
        ]},
        {title: '프로젝트', items: [{label: 'GitHub 저장소', href: 'https://github.com/thanksstevenkim/mastodon-ko-handbook'}]},
      ],
      copyright: '비공식 Mastodon 한국어 운영 안내서',
    },
  },
};
export default config;
