import React from 'react';
import OriginalNavbar from '@theme-original/Navbar';
import MobileThemeToggle from '@site/src/components/MobileThemeToggle';

// Keep Docusaurus's native navbar and theme toggle on desktop.
// On mobile the sidebar drawer is deliberately hidden, so offer a separate
// theme toggle without restoring a duplicate mobile menu.
export default function NavbarWrapper(props) {
  return (
    <>
      <OriginalNavbar {...props} />
      <MobileThemeToggle />
    </>
  );
}
