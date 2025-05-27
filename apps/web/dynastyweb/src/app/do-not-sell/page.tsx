import React from 'react';
import { Metadata } from 'next';
import DoNotSellContent from './DoNotSellContent';

export const metadata: Metadata = {
  title: 'Do Not Sell or Share My Personal Information | Dynasty',
  description: 'California residents can opt-out of the sale or sharing of personal information collected by Dynasty.',
  robots: 'index, follow',
};

export default function DoNotSellPage() {
  return <DoNotSellContent />;
}