// interactions/commandDefinitions.js
// Definiciones de slash commands (solo la forma/estructura, sin logica).
// La logica de cada uno vive en interactions/handlers/*.js.
// Todos estos comandos son EXCLUSIVOS de Lara y Gio (se valida en runtime
// en interactionCreate.js, ademas de setDefaultMemberPermissions como
// primera barrera visual en Discord).
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ambient-mode')
    .setDescription('El bot comenta espontaneamente mas seguido en el canal (nunca pinguea sin sentido)')
    .addSubcommand(sc => sc.setName('activate').setDescription('Activa ambient-mode'))
    .addSubcommand(sc => sc.setName('deactivate').setDescription('Desactiva ambient-mode'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('modelstatus')
    .setDescription('Muestra que compania/modelo de IA esta usando el bot ahora mismo y los tokens gastados'),

  new SlashCommandBuilder()
    .setName('provider')
    .setDescription('Muestra el estado detallado de cada proveedor de IA configurado (salud, cooldown, latencia)'),
  // Igual que /modelstatus: de lectura, abierto a cualquiera. Reemplaza
  // al viejo comando de texto !provider (services/../commands/provider.js
  // queda deprecado, ver nota ahi).

  new SlashCommandBuilder()
    .setName('forcetalk')
    .setDescription('El bot responde a cualquier mensaje, sin esperar el umbral normal')
    .addSubcommand(sc => sc.setName('activate').setDescription('Activa forcetalk'))
    .addSubcommand(sc => sc.setName('deactivate').setDescription('Desactiva forcetalk'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('security')
    .setDescription('Modo seguridad: el bot se comporta de forma amable forzada')
    .addSubcommand(sc => sc.setName('activate').setDescription('Activa modo seguridad'))
    .addSubcommand(sc => sc.setName('deactivate').setDescription('Desactiva modo seguridad'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Moderacion automatica: el bot sanciona a quien falte al respeto en el chat')
    .addSubcommand(sc => sc.setName('activate').setDescription('Activa moderacion automatica'))
    .addSubcommand(sc => sc.setName('deactivate').setDescription('Desactiva moderacion automatica'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('funador')
    .setDescription('Modo funador: bit de "juicio" en broma, amable, siempre con consentimiento de todos')
    .addSubcommand(sc => sc.setName('activate').setDescription('Habilita el modo funador en este servidor'))
    .addSubcommand(sc => sc.setName('deactivate').setDescription('Deshabilita el modo funador'))
    .addSubcommand(sc => sc
      .setName('start')
      .setDescription('Arranca un "juicio" en broma, pidiendo permiso al acusado primero')
      .addUserOption(opt => opt.setName('objetivo').setDescription('A quien le vamos a hacer el juicio de mentira').setRequired(true))
      .addStringOption(opt => opt.setName('razon').setDescription('De que se le acusa / tema del juicio (opcional, si no se pone se infiere del chat reciente)').setRequired(false)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('objecion')
    .setDescription('💪 OBJECION: solo abogados registrados en un /funador activo pueden usarlo, en cualquier momento del interrogatorio')
    .addStringOption(opt => opt.setName('motivo').setDescription('Por que estas objetando (opcional, corto)').setRequired(false)),
  // Sin setDefaultMemberPermissions(Administrator) a proposito: este
  // comando NO es exclusivo de Lara/Gio. Cualquier persona que haya sido
  // registrada como abogado (de cualquiera de los dos bandos) en la sesion
  // de /funador activa en ese canal puede usarlo. La validacion real pasa
  // por registerObjection() en core/funadorSession.js, consultando
  // sessionRoles -- interactionCreate.js deja pasar 'objecion' sin el
  // chequeo generico de isCreatorOrSubCreator.

  new SlashCommandBuilder()
    .setName('resetmemory')
    .setDescription('Resetea la memoria del bot')
    .addSubcommand(sc => sc.setName('channel').setDescription('Resetea solo este canal'))
    .addSubcommand(sc => sc.setName('server').setDescription('Resetea todo este servidor'))
    .addSubcommand(sc => sc.setName('all').setDescription('Resetea TODOS los servidores (solo Lara)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

export default commandDefinitions;
