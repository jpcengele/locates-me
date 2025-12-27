"use client";

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const MapComponent = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen bg-gray-100">Loading Map...</div>
});

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <Suspense fallback={<div>Loading...</div>}>
        <MapComponent />
      </Suspense>
    </main>
  );
}
