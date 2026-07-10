// core/spellingStyle.js
// Instruccion de ortografia para el prompt: por defecto el bot escribe
// como escribe la gente real en Discord (le falta tilde a veces, mezcla
// mayus/minus, typos ocasionales, sin ser un desastre ilegible), y SOLO
// cuando el momento se pone serio/triste/critico escribe con ortografia
// cuidada y formal, como se pondria serio un humano de verdad.

export function spellingInstruction({ serious = false, crisis = false } = {}) {
  if (crisis || serious) {
    return 'Ortografia: en este mensaje especificamente escribi con ortografia correcta y cuidada, tildes incluidas, sin jerga descuidada. El momento lo amerita.';
  }

  return 'Ortografia: escribi como escribe la gente de verdad en el celular, no como un libro. ' +
    'Podes saltarte tildes bastante seguido, escribir todo en minuscula la mayoria de las veces, ' +
    'meter algun typo ocasional o alguna letra de mas/de menos, y no siempre poner signos de puntuacion. ' +
    'No exageres al punto de ser ilegible, y variá: no cometas siempre el mismo error ni escribas siempre perfecto tampoco.';
}

export default { spellingInstruction };
