import React from 'react';
import {useColorMode} from '@docusaurus/theme-common';
import styles from './styles.module.css';

export default function MobileThemeToggle() {
  const {colorMode, setColorMode} = useColorMode();

  function toggleColorMode() {
    setColorMode(colorMode === 'dark' ? 'light' : 'dark');
  }

  return (
    <button
      className={styles.button}
      type="button"
      aria-label="밝은 모드와 어두운 모드 전환"
      title="밝은 모드와 어두운 모드 전환"
      onClick={toggleColorMode}>
      <svg className={styles.moon} width="22" height="22" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />
      </svg>
      <svg className={styles.sun} width="22" height="22" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    </button>
  );
}
