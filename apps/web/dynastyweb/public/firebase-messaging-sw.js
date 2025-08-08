importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Get Firebase configuration from environment
// Note: Service worker can't access process.env directly, 
// so config must be passed via query params or postMessage
let firebaseConfig = {
  apiKey: "__REPLACE_WITH_ENV__", // placeholder; provide via postMessage or query params
  authDomain: "__REPLACE_WITH_ENV__",
  projectId: "__REPLACE_WITH_ENV__",
  storageBucket: "__REPLACE_WITH_ENV__",
  messagingSenderId: "__REPLACE_WITH_ENV__",
  appId: "__REPLACE_WITH_ENV__",
  measurementId: "__REPLACE_WITH_ENV__",
};

// Initialize the Firebase app in the service worker
firebase.initializeApp(firebaseConfig);

// Retrieve firebase messaging
const messaging = firebase.messaging();

// Log service worker initialization
console.log('Firebase messaging service worker initialized');

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/dynasty.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click event
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click Received.');

  event.notification.close();
  
  // Get link from data or default to notifications page
  const link = event.notification.data?.link || '/notifications';
  
  // Open the app and navigate to link
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(function(windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.navigate(link);
          return;
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(link);
      }
    })
  );
}); 

// Optional: allow overriding config via postMessage from the app at runtime
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_FIREBASE_CONFIG' && event.data.config) {
    try {
      firebaseConfig = event.data.config
      firebase.initializeApp(firebaseConfig)
    } catch (e) {
      console.error('Failed to set Firebase config in SW', e)
    }
  }
});