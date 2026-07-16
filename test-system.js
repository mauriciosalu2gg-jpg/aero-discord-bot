import { buildSystemExtra } from './services/ai/systemContext.js';
try {
  console.log(buildSystemExtra({
    moodInfo: { mood: 'neutral', intensity: 1, isJoke: false },
    isOwner: false,
    isSubCreator: false,
    botPersonality: 'otaku'
  }));
  console.log("Success");
} catch(e) {
  console.error("Error", e);
}
