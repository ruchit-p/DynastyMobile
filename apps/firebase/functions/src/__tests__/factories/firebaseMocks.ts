/**
 * Firebase service mocks for testing
 * Provides realistic mock implementations of Firebase services
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Create a mock Firestore instance with chainable methods
 */
export function createMockFirestore() {
  const mockData = new Map<string, any>();
  
  // Mock document reference
  const createMockDocRef = (path: string) => ({
    id: path.split('/').pop() || '',
    path,
    get: jest.fn(async () => ({
      exists: mockData.has(path),
      id: path.split('/').pop() || '',
      data: () => mockData.get(path),
      ref: { path },
    })),
    set: jest.fn(async (data: any) => {
      mockData.set(path, { ...data, _createdAt: Timestamp.now() });
      return { writeTime: Timestamp.now() };
    }),
    update: jest.fn(async (data: any) => {
      const existing = mockData.get(path) || {};
      mockData.set(path, { ...existing, ...data, _updatedAt: Timestamp.now() });
      return { writeTime: Timestamp.now() };
    }),
    delete: jest.fn(async () => {
      mockData.delete(path);
      return { writeTime: Timestamp.now() };
    }),
  });

  // Mock query
  const createMockQuery = () => {
    const conditions: any[] = [];
    const query: any = {
      where: jest.fn((field: string, op: string, value: any) => {
        conditions.push({ field, op, value });
        return query;
      }),
      orderBy: jest.fn(() => query),
      limit: jest.fn(() => query),
      startAfter: jest.fn(() => query),
      get: jest.fn(async () => {
        // Simple filtering implementation
        const docs: any[] = [];
        mockData.forEach((data, path) => {
          let matches = true;
          conditions.forEach(({ field, op, value }) => {
            const fieldValue = data[field];
            if (op === '==' && fieldValue !== value) matches = false;
            if (op === 'in' && !value.includes(fieldValue)) matches = false;
          });
          if (matches) {
            docs.push({
              id: path.split('/').pop() || '',
              data: () => data,
              ref: { path },
            });
          }
        });
        return { docs, empty: docs.length === 0, size: docs.length };
      }),
    };
    return query;
  };

  // Mock collection reference
  const createMockCollectionRef = (collectionPath: string) => ({
    id: collectionPath,
    path: collectionPath,
    doc: jest.fn((docId?: string) => {
      const id = docId || `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return createMockDocRef(`${collectionPath}/${id}`);
    }),
    add: jest.fn(async (data: any) => {
      const id = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const path = `${collectionPath}/${id}`;
      mockData.set(path, { ...data, _createdAt: Timestamp.now() });
      return createMockDocRef(path);
    }),
    where: jest.fn((field: string, op: string, value: any) => 
      createMockQuery().where(field, op, value)
    ),
    orderBy: jest.fn(() => createMockQuery()),
    limit: jest.fn(() => createMockQuery()),
    get: jest.fn(async () => {
      const docs: any[] = [];
      mockData.forEach((data, path) => {
        if (path.startsWith(collectionPath + '/')) {
          docs.push({
            id: path.split('/').pop() || '',
            data: () => data,
            ref: { path },
          });
        }
      });
      return { docs, empty: docs.length === 0, size: docs.length };
    }),
  });

  // Mock batch
  const createMockBatch = () => {
    const operations: any[] = [];
    return {
      set: jest.fn((ref: any, data: any) => {
        operations.push({ type: 'set', ref, data });
      }),
      update: jest.fn((ref: any, data: any) => {
        operations.push({ type: 'update', ref, data });
      }),
      delete: jest.fn((ref: any) => {
        operations.push({ type: 'delete', ref });
      }),
      commit: jest.fn(async () => {
        // Process all operations
        operations.forEach(({ type, ref, data }) => {
          if (type === 'set') mockData.set(ref.path, data);
          if (type === 'update') {
            const existing = mockData.get(ref.path) || {};
            mockData.set(ref.path, { ...existing, ...data });
          }
          if (type === 'delete') mockData.delete(ref.path);
        });
        return { writeTime: Timestamp.now() };
      }),
    };
  };

  // Mock transaction
  const createMockTransaction = () => ({
    get: jest.fn(async (ref: any) => ({
      exists: mockData.has(ref.path),
      data: () => mockData.get(ref.path),
    })),
    set: jest.fn((ref: any, data: any) => {
      mockData.set(ref.path, data);
    }),
    update: jest.fn((ref: any, data: any) => {
      const existing = mockData.get(ref.path) || {};
      mockData.set(ref.path, { ...existing, ...data });
    }),
    delete: jest.fn((ref: any) => {
      mockData.delete(ref.path);
    }),
  });

  const mockFirestore = {
    collection: jest.fn((path: string) => createMockCollectionRef(path)),
    doc: jest.fn((path: string) => createMockDocRef(path)),
    batch: jest.fn(() => createMockBatch()),
    runTransaction: jest.fn(async (callback: any) => {
      const transaction = createMockTransaction();
      return await callback(transaction);
    }),
    // Helper methods for testing
    _getData: () => mockData,
    _setData: (path: string, data: any) => mockData.set(path, data),
    _clear: () => mockData.clear(),
  };

  return mockFirestore;
}

/**
 * Create mock Firebase Auth
 */
export function createMockAuth() {
  const users = new Map<string, any>();
  
  return {
    verifyIdToken: jest.fn(async (token: string) => {
      const uid = token.replace('token_', '');
      const user = users.get(uid);
      if (!user) throw new Error('Invalid token');
      return { uid, email: user.email, email_verified: user.emailVerified };
    }),
    createUser: jest.fn(async (properties: any) => {
      const uid = properties.uid || `uid_${Date.now()}`;
      const user = {
        uid,
        email: properties.email,
        emailVerified: properties.emailVerified || false,
        displayName: properties.displayName,
        phoneNumber: properties.phoneNumber,
        disabled: false,
        metadata: {
          creationTime: new Date().toISOString(),
          lastSignInTime: null,
        },
      };
      users.set(uid, user);
      return user;
    }),
    updateUser: jest.fn(async (uid: string, properties: any) => {
      const user = users.get(uid);
      if (!user) throw new Error('User not found');
      Object.assign(user, properties);
      return user;
    }),
    deleteUser: jest.fn(async (uid: string) => {
      if (!users.has(uid)) throw new Error('User not found');
      users.delete(uid);
    }),
    getUser: jest.fn(async (uid: string) => {
      const user = users.get(uid);
      if (!user) throw new Error('User not found');
      return user;
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      for (const user of users.values()) {
        if (user.email === email) return user;
      }
      throw new Error('User not found');
    }),
    listUsers: jest.fn(async () => ({
      users: Array.from(users.values()),
      pageToken: undefined,
    })),
    createCustomToken: jest.fn(async (uid: string) => `custom_token_${uid}`),
    setCustomUserClaims: jest.fn(async (uid: string, claims: any) => {
      const user = users.get(uid);
      if (!user) throw new Error('User not found');
      user.customClaims = claims;
    }),
    // Helper for tests
    _getUsers: () => users,
    _clear: () => users.clear(),
  };
}

/**
 * Create test user data
 */
export function createTestUser(overrides: Partial<any> = {}) {
  return {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email: `test_${Date.now()}@example.com`,
    displayName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    phoneNumber: '+15551234567',
    emailVerified: true,
    photoURL: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastLoginAt: Timestamp.now(),
    settings: {
      notifications: {
        email: true,
        sms: true,
        push: true,
      },
      privacy: {
        profileVisibility: 'family',
      },
    },
    subscription: null,
    ...overrides,
  };
}

/**
 * Create test family tree data
 */
export function createTestFamilyTree(overrides: Partial<any> = {}) {
  const ownerId = overrides.ownerId || `user_${Date.now()}`;
  return {
    id: `tree_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Family Tree',
    ownerId,
    adminIds: [ownerId],
    memberIds: [ownerId],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    settings: {
      privacy: 'private',
      allowInvites: true,
    },
    ...overrides,
  };
}

/**
 * Create test SMS log entry
 */
export function createTestSMSLog(overrides: Partial<any> = {}) {
  return {
    id: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    messageId: `msg_${Date.now()}`,
    phoneNumber: '+15551234567',
    sanitizedPhone: '+1555***4567',
    type: 'notification',
    status: 'sent',
    content: 'Test SMS message',
    userId: `user_${Date.now()}`,
    sentAt: Timestamp.now(),
    deliveredAt: null,
    failureReason: null,
    cost: 0.00581,
    provider: 'aws',
    ...overrides,
  };
}