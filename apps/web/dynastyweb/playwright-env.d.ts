/// <reference types="@playwright/test" />

import { Page } from '@playwright/test';

declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      // Add custom matchers here if needed
    }
  }
}

// Custom test fixtures types
export interface TestFixtures {
  authenticatedPage: Page;
  testUser: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}

// Test data types
export interface TestMember {
  firstName: string;
  lastName: string;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth?: {
    month: string;
    day: string;
    year: string;
  };
  email?: string;
  phone?: string;
}

export interface TestEvent {
  title: string;
  singleDay: boolean;
  startDate: Date;
  endDate?: Date;
  startTime: string;
  endTime: string;
  location?: {
    name: string;
    address: string;
  };
  virtualLink?: string;
  description?: string;
  dressCode?: string;
  whatToBring?: string;
  inviteAll: boolean;
  requireRsvp: boolean;
  allowPlusOne: boolean;
  showGuestList: boolean;
}

export interface TestStory {
  title: string;
  coverPhoto?: string;
  blocks: Array<{
    type: 'text' | 'image' | 'video' | 'audio';
    content: string;
  }>;
  privacy: 'family' | 'private' | 'custom';
  taggedPeople: string[];
  location?: string;
  date?: Date;
}