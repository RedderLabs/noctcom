/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDbc7sCk1Z3cHrcVUsYjDM2EGwBL-KSUBM',
  authDomain: 'noctcom-6116b.firebaseapp.com',
  projectId: 'noctcom-6116b',
  storageBucket: 'noctcom-6116b.firebasestorage.app',
  messagingSenderId: '2207334954',
  appId: '1:2207334954:web:594da6aa8bb2636ab6b953',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Noctcom';
  const options = {
    body: payload.notification?.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    data: payload.data,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      if (windowClients.length > 0) {
        windowClients[0].focus();
        return;
      }
      clients.openWindow('/vault');
    }),
  );
});
