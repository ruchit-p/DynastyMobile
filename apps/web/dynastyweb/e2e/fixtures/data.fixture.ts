import { TestMember, TestEvent, TestStory } from '../../playwright-env';

export interface DataFixture {
  generateEmail: () => string;
  generatePhoneNumber: () => string;
  generateMember: (overrides?: Partial<TestMember>) => TestMember;
  generateEvent: (overrides?: Partial<TestEvent>) => TestEvent;
  generateStory: (overrides?: Partial<TestStory>) => TestStory;
  generateFileName: (extension: string) => string;
  getRandomElement: <T>(array: T[]) => T;
}

export function createDataFixture(): DataFixture {
  const timestamp = Date.now();
  let counter = 0;

  return {
    /**
     * Generate a unique email address
     */
    generateEmail(): string {
      counter++;
      return `test.user.${timestamp}.${counter}@dynasty.test`;
    },

    /**
     * Generate a test phone number
     */
    generatePhoneNumber(): string {
      // Generate a valid US phone number format
      const areaCode = Math.floor(Math.random() * 900) + 100;
      const prefix = Math.floor(Math.random() * 900) + 100;
      const lineNumber = Math.floor(Math.random() * 9000) + 1000;
      return `${areaCode}${prefix}${lineNumber}`;
    },

    /**
     * Generate test member data
     */
    generateMember(overrides?: Partial<TestMember>): TestMember {
      const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'Robert', 'Lisa'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
      
      const firstName = this.getRandomElement(firstNames);
      const lastName = this.getRandomElement(lastNames);
      
      return {
        firstName,
        lastName,
        gender: this.getRandomElement(['Male', 'Female', 'Other']),
        dateOfBirth: {
          month: String(Math.floor(Math.random() * 12) + 1),
          day: String(Math.floor(Math.random() * 28) + 1),
          year: String(Math.floor(Math.random() * 50) + 1950),
        },
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        phone: this.generatePhoneNumber(),
        ...overrides,
      };
    },

    /**
     * Generate test event data
     */
    generateEvent(overrides?: Partial<TestEvent>): TestEvent {
      const eventTitles = [
        'Family Reunion',
        'Birthday Party',
        'Anniversary Celebration',
        'Holiday Gathering',
        'Summer BBQ',
        'Game Night',
        'Movie Night',
        'Potluck Dinner',
      ];

      const locations = [
        { name: 'Central Park', address: 'New York, NY' },
        { name: 'Golden Gate Park', address: 'San Francisco, CA' },
        { name: 'Millennium Park', address: 'Chicago, IL' },
        { name: 'Griffith Park', address: 'Los Angeles, CA' },
      ];

      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + Math.floor(Math.random() * 30) + 1);

      return {
        title: this.getRandomElement(eventTitles),
        singleDay: Math.random() > 0.5,
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 86400000), // Next day
        startTime: '14:00',
        endTime: '18:00',
        location: this.getRandomElement(locations),
        description: 'Join us for a wonderful time together!',
        dressCode: 'Casual',
        whatToBring: 'Your favorite dish to share',
        inviteAll: true,
        requireRsvp: true,
        allowPlusOne: false,
        showGuestList: true,
        ...overrides,
      };
    },

    /**
     * Generate test story data
     */
    generateStory(overrides?: Partial<TestStory>): TestStory {
      const storyTitles = [
        'Our Summer Vacation',
        'Grandma\'s 80th Birthday',
        'First Day of School',
        'Family Christmas',
        'The Big Move',
        'Camping Adventure',
        'Beach Day Fun',
        'Thanksgiving Memories',
      ];

      const textBlocks = [
        'What an amazing day we had together!',
        'The weather was perfect and everyone was in great spirits.',
        'We laughed, we cried, we made memories that will last a lifetime.',
        'Looking back at these photos brings such joy to my heart.',
      ];

      return {
        title: this.getRandomElement(storyTitles),
        blocks: [
          {
            type: 'text',
            content: this.getRandomElement(textBlocks),
          },
          {
            type: 'text',
            content: 'Here are some highlights from our special day.',
          },
        ],
        privacy: 'family',
        taggedPeople: [],
        location: 'New York, NY',
        date: new Date(),
        ...overrides,
      };
    },

    /**
     * Generate a unique file name
     */
    generateFileName(extension: string): string {
      counter++;
      return `test-file-${timestamp}-${counter}.${extension}`;
    },

    /**
     * Get random element from array
     */
    getRandomElement<T>(array: T[]): T {
      return array[Math.floor(Math.random() * array.length)];
    },
  };
}