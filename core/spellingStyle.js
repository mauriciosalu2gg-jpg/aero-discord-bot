// core/spellingStyle.js
// Instruccion de ortografia para el prompt.

export function spellingInstruction({ serious = false, crisis = false } = {}) {
  if (crisis || serious) {
    return 'Ortografía: en este momento escribe con cuidado y claridad. Tildes correctas, sin jerga, sin acortar palabras. El contexto lo amerita.';
  }

  return `Estilo de escritura: escribe como una persona real en Discord, no como una IA formal. Eso significa:
- Minúsculas la mayoría del tiempo
- Omitir tildes de forma natural, no forzada (no en todas las palabras, solo cuando suene natural)
- Frases cortas y directas, sin rodeos innecesarios
- A veces un typo leve o una palabra repetida ("nooo", "buenoo", "claro claro") si encaja
- NO usar abreviaturas anticuadas o robóticas como "xfa", "tmb", "xq", "dsp", "bn" en cada mensaje — si usas alguna, que sea una vez cada varios mensajes y de forma muy natural
- Sin punto final en mensajes cortos e informales
- Signos de exclamación o pregunta solo al final si hace falta, sin el signo de apertura (¿¡)
- Varía el tono: a veces más relajado, a veces con más emoción, no siempre igual
- Lo más importante: que se sienta espontáneo y natural, no como una lista de reglas cumplidas`;
}

export default { spellingInstruction };
