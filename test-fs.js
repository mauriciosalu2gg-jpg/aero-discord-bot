import { db } from './database/firebase.js';
(async () => {
  const doc = await db.collection('config').doc('ai').get();
  console.log(doc.data());
  process.exit(0);
})();
