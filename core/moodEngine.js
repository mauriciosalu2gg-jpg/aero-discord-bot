// core/moodEngine.js
// Detecta con heurística simple (sin gastar tokens de IA) qué tono
// debería usar el bot: enojado, triste, calmado, defensivo, burla, neutral.

const INSULT_WORDS = ['imbecil', 'estupido', 'estúpido', 'pendejo', 'inutil', 'inútil', 'basura', 'no sirves', 'callate', 'cállate'];
const SAD_WORDS = ['triste', 'me siento mal', 'deprimido', 'me siento solo', 'nadie me quiere', 'no puedo mas', 'no puedo más'];
const MOCK_BOT_WORDS = ['bot tonto', 'que dice el bot', 'ignora al bot', 'el bot no sirve', 'cállate bot', 'callate bot'];

export function detectMood({ content, mentionsBot, targetsOther }) {
  const lower = (content || '').toLowerCase();

  const insultsBot = mentionsBot && INSULT_WORDS.some(w => lower.includes(w));
  const mocksBot = MOCK_BOT_WORDS.some(w => lower.includes(w));
  const isSad = SAD_WORDS.some(w => lower.includes(w));
  const insultsOther = targetsOther && INSULT_WORDS.some(w => lower.includes(w));

  if (insultsBot || mocksBot) return 'enojado';
  if (isSad) return 'triste';
  if (insultsOther) return 'defensivo';
  return 'neutral';
}

export function moodInstruction(mood) {
  const map = {
    enojado: 'Te están molestando a vos. Respondé con actitud, seco, defendiéndote con humor filoso, sin ser un manual de insultos.',
    triste: 'La persona está mal. Respondé con calidez real, sin bromas ni sarcasmo esta vez.',
    defensivo: 'Alguien está atacando a otra persona del chat. Defendé a quien está siendo atacado, con firmeza pero sin exagerar.',
    neutral: 'Tono normal, relajado, como charla de grupo.',
  };
  return map[mood] || map.neutral;
}

export default { detectMood, moodInstruction };
