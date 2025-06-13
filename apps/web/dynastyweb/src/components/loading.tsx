'use client';

import React from 'react';

/**
 * Loading component 
 * 
 * Displays a loading spinner for use during data fetching or page transitions
 * Used in protected layout and other areas that need to show loading states
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-t-4 border-b-4 border-green-600 animate-spin"></div>
        <div className="absolute top-0 left-0 h-16 w-16 rounded-full border-l-4 border-r-4 border-amber-500 animate-spin animate-duration-1500"></div>
      </div>
      <span className="ml-4 text-xl font-medium text-gray-700">Loading...</span>
    </div>
  );
}