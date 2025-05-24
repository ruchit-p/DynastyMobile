importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyA_uNpQElWXQXcIPDuVgzAgiGNqgT-31W4",
  authDomain: "dynasty-eba63.firebaseapp.com",
  projectId: "dynasty-eba63",
  storageBucket: "dynasty-eba63.firebasestorage.app",
  messagingSenderId: "613996380558",
  appId: "1:613996380558:web:e92ddd147ebc530768e4df",
  measurementId: "G-KDHWY1R09Z",
});

// Retrieve firebase messaging
const messaging = firebase.messaging();

// Cache configuration
const CACHE_NAME = 'dynasty-v1';
const urlsToCache = [
  '/',
  '/feed',
  '/events',
  '/family-tree',
  '/history-book',
  '/dynasty.png'
];

// Log service worker initialization
console.log('Firebase messaging service worker initialized');

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Dynasty';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/dynasty.png',
    badge: '/dynasty.png',
    tag: payload.messageId || Date.now().toString(),
    data: payload.data || {},
    requireInteraction: false,
    actions: []
  };

  // Add image if available
  if (payload.notification?.image) {
    notificationOptions.image = payload.notification.image;
  }

  // Add actions based on notification type
  if (payload.data?.type === 'message') {
    notificationOptions.actions = [
      { action: 'view', title: 'View Message' },
      { action: 'dismiss', title: 'Dismiss' }
    ];
  } else if (payload.data?.type === 'event') {
    notificationOptions.actions = [
      { action: 'view', title: 'View Event' },
      { action: 'dismiss', title: 'Dismiss' }
    ];
  }

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click event
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click Received.');

  event.notification.close();
  
  const data = event.notification.data || {};
  let url = '/';

  // Handle action clicks
  if (event.action === 'view') {
    switch (data.type) {
      case 'message':
        url = data.chatId ? `/chat/${data.chatId}` : '/chat';
        break;
      case 'event':
        url = data.eventId ? `/events/${data.eventId}` : '/events';
        break;
      case 'story':
        url = data.storyId ? `/story/${data.storyId}` : '/history-book';
        break;
      case 'family':
        url = '/family-tree';
        break;
      default:
        url = '/notifications';
    }
  } else if (event.action !== 'dismiss') {
    // Default click behavior (not on action button)
    url = data.link || '/notifications';
  }
  
  // Open the app and navigate to link
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(function(windowClients) {
      // Check if app is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: url,
            data: data
          });
          return;
        }
      }
      
      // App not open, open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Fetch event for offline support
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Chrome extension requests
  if (event.request.url.includes('chrome-extension://')) return;

  // Skip API requests - let them fail naturally
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('firebaseapp.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          // Cache successful responses
          if (event.request.url.indexOf('http') === 0) {
            cache.put(event.request, responseToCache);
          }
        });

        return response;
      }).catch(() => {
        // Return cached version if available
        return caches.match(event.request);
      });
    })
  );
});

// Message event for communication with app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 