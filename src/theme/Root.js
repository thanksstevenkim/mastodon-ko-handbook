import React from 'react';
import MobileBottomNav from '@site/src/components/MobileBottomNav';

// Root is shared by all Docusaurus pages, including existing documentation routes.
export default function Root({children}) {
  return (
    <>
      {children}
      <MobileBottomNav />
    </>
  );
}
