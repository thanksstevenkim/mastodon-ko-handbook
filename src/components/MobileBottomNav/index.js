import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useLocation} from '@docusaurus/router';
import styles from './styles.module.css';

const tabs = [
  {id: 'home', label: '홈', to: '/', icon: 'home'},
  {id: 'install', label: '설치', to: '/menu/install', icon: 'book'},
  {id: 'operate', label: '운영', to: '/menu/operate', icon: 'server'},
  {id: 'problems', label: '문제', to: '/menu/problems', icon: 'help'},
  {id: 'more', label: '자료', to: '/menu/more', icon: 'grid'},
];

function TabIcon({name}) {
  const shapes = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9" /><path d="M9 21v-7h6v7" /></>,
    book: <><path d="M4 19.5V5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-1.5Z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></>,
    server: <><rect x="4" y="3" width="16" height="8" rx="2" /><rect x="4" y="13" width="16" height="8" rx="2" /><path d="M8 7h.01M8 17h.01" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" /><path d="M12 17h.01" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  };
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name]}
    </svg>
  );
}

function activeTab(pathname, homePath) {
  if (pathname === homePath || pathname === homePath.replace(/\/$/, '')) return 'home';
  if (pathname.includes('/menu/install') || pathname.includes('/guide/getting-started/')) return 'install';
  if (pathname.includes('/menu/operate') || pathname.includes('/guide/operations/')) return 'operate';
  if (pathname.includes('/menu/problems') || pathname.includes('/guide/troubleshooting/')) return 'problems';
  if (pathname.includes('/menu/more') || pathname.includes('/guide/security/') ||
      pathname.includes('/guide/search/') || pathname.includes('/guide/labs/') ||
      pathname.includes('/guide/overview')) return 'more';
  return null;
}

export default function MobileBottomNav() {
  const {pathname} = useLocation();
  const homePath = useBaseUrl('/');
  const current = activeTab(pathname, homePath);

  return (
    <nav className={styles.bar} aria-label="모바일 주요 메뉴">
      {tabs.map((tab) => (
        <Link key={tab.id} to={tab.to}
          className={[styles.tab, current === tab.id && styles.selected].filter(Boolean).join(' ')}
          aria-current={current === tab.id ? 'page' : undefined}>
          <TabIcon name={tab.icon} />
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
