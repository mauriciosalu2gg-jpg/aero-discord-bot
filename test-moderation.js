import { analyzeWithAI, looksSuspicious } from './core/moderation/index.js';
import { db } from './database/firebase.js';

async function test() {
  const msgs = ['ptm', 'putamadre'];
  for (const m of msgs) {
    console.log(`\nProbando: ${m}`);
    console.log(`looksSuspicious: ${looksSuspicious(m)}`);
    if (looksSuspicious(m)) {
      const res = await analyzeWithAI(m, [], true); // isStaff = true
      console.log('AI Result:', res);
    }
  }
  process.exit(0);
}
test();
