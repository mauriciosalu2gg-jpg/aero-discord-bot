// deploy-commands.js
// Corre esto UNA VEZ (y cada vez que cambies un slash command) para
// registrar los comandos en Discord:
//    node deploy-commands.js            -> registra en todos los servers donde esta el bot (global, tarda ~1h en propagar)
//    node deploy-commands.js <guildId>  -> registra SOLO en ese servidor (instantaneo, ideal para probar)
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commandDefinitions } from './interactions/commandDefinitions.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildIdArg = process.argv[2];
const shouldClearGlobal = process.argv.includes('--clear-global');

if (!token) {
  console.error('[deploy] Falta DISCORD_TOKEN en el .env');
  process.exit(1);
}
if (!clientId) {
  console.error('[deploy] Falta DISCORD_CLIENT_ID en el .env (Application ID, se ve en Discord Developer Portal > General Information)');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

async function main() {
  try {
    if (guildIdArg) {
      console.log(`[deploy] Registrando ${commandDefinitions.length} comandos SOLO en el servidor ${guildIdArg} (instantaneo)...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildIdArg), { body: commandDefinitions });
      console.log('[deploy] Listo. Los comandos ya deberian aparecer en ese servidor.');
      
      // Si probamos en un guild y queremos borrar lo global viejo
      if (shouldClearGlobal) {
        console.log('[deploy] Limpiando comandos globales viejos...');
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
      }
    } else {
      console.log(`[deploy] Limpiando comandos globales viejos...`);
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(`[deploy] Registrando ${commandDefinitions.length} comandos GLOBALES (puede tardar hasta 1 hora en propagar)...`);
      await rest.put(Routes.applicationCommands(clientId), { body: commandDefinitions });
      console.log('[deploy] Listo. Puede tardar en aparecer en todos los servers.');
    }
  } catch (err) {
    console.error('[deploy] Error registrando comandos:', err);
    process.exit(1);
  }
}

main();
