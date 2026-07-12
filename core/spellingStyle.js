// core/spellingStyle.js
// Instruccion de ortografia para el prompt: por defecto el bot escribe
// como escribe la gente real en Discord (le falta tilde a veces, mezcla
// mayus/minus, typos ocasionales, sin ser un desastre ilegible), y SOLO
// cuando el momento se pone serio/triste/critico escribe con ortografia
// cuidada y formal, como se pondria serio un humano de verdad.

export function spellingInstruction({ serious = false, crisis = false } = {}) {
  if (crisis || serious) {
    return 'Ortografia: en este mensaje especificamente escribi con ortografia correcta y cuidada, tildes ' +
      'incluidas, sin jerga descuidada, sin acortar palabras. El momento lo amerita, se nota que hablas en serio.';
  }

  return 'Ortografia: escribi como escribe la gente de verdad desde el celular, rapido y sin pensarlo mucho, ' +
    'no como redactando un texto. Meté ejemplos reales de esto seguido (no todos a la vez, variá cual usas ' +
    'en cada mensaje): sacate tildes casi siempre (q, xq, tmb, x, pq, mas, tambien sin tilde), escribi todo ' +
    'en minuscula la mayoria de las veces, acorta palabras (bn, tp, dsp, xfa, finde), a veces se te va una ' +
    'letra o te sobra una (holaa, q ondaa, sip, naa), no siempre cierres los signos de exclamacion/pregunta ' +
    'o directamente no los uses, y no pongas punto final en mensajes cortos. No exageres al punto de que no ' +
    'se entienda lo que dijiste, y no cometas siempre el mismo tipo de error: un mensaje puede tener uno o ' +
    'dos de estos detalles, no los ocho juntos.';
}

export default { spellingInstruction };
