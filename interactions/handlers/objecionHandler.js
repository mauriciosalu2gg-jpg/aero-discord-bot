// interactions/handlers/objecionHandler.js
// /bot funador objecion [motivo] -> permite a un abogado (defensa o
// acusacion) de un juicio activo interrumpir el interrogatorio con un
// "OBJECION!" comico.
//
// COMO SI puede usarse:
// - Debe haber un /funador en curso en ESE MISMO canal.
// - Quien lo use debe estar registrado como abogado en esa sesion (de
//   cualquiera de los dos bandos: defensa del acusado, o apoyo de la
//   acusacion). Se registran al principio del juicio cuando el bot les
//   pide que etiqueten abogados.
// - Solo se puede tener UNA objecion en cola a la vez por canal; si ya hay
//   una esperando a resolverse, hay que esperar a que se consuma antes de
//   mandar otra.
// - Se puede usar en cualquier momento mientras el juicio esta activo, no
//   hay una "ventana" especifica -- se resuelve automaticamente antes de
//   la siguiente pregunta que el bot le haga a alguien.
//
// COMO NO puede usarse:
// - No funciona fuera de un canal con juicio activo.
// - No lo puede usar el acusado, el acusador, un testigo, ni nadie que no
//   haya sido etiquetado como abogado (Lara/Gio incluidos, salvo que ellos
//   mismos hayan sido tageados como abogados en esa sesion).
// - No sirve para "objetar" fuera de la sala del juicio (otro canal) ni
//   para parar el juicio del todo -- es un efecto narrativo de comedia,
//   no cambia el resultado ni el flujo real de turnos.
// - No se pueden encolar objeciones en cadena: si ya hay una pendiente,
//   el bot va a avisar que hay que esperar a que se resuelva primero.
import { registerObjection } from '../../core/funadorSession.js';

export async function handleObjecionCommand(interaction) {
  const motivo = interaction.options.getString('motivo');
  const result = registerObjection(interaction.channelId, interaction.user.id, motivo);

  if (!result.ok) {
    await interaction.reply({ content: `🚫 no se pudo: ${result.reason}`, ephemeral: true });
    return true;
  }

  await interaction.reply({
    content: `💪 ¡${interaction.user} grito OBJECION desde la ${result.side}! Se va a narrar en el proximo turno del interrogatorio.`,
    ephemeral: false,
  });
  return true;
}

export default { handleObjecionCommand };
