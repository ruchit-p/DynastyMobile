importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Get Firebase configuration from environment
// Note: Service worker can't access process.env directly, 
// so config must be passed via query params or postMessage
let firebaseConfig = {
  apiKey: "AIzaSyA_uNpQElWXQXcIPDuVgzAgiGNqgT-31W4",
  authDomain: "dynasty-eba63.firebaseapp.com", 
  projectId: "dynasty-eba63",
  storageBucket: "dynasty-eba63.firebasestorage.app",
  messagingSenderId: "613996380558",
  appId: "1:613996380558:web:e92ddd147ebc530768e4df",
  measurementId: "G-KDHWY1R09Z",
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