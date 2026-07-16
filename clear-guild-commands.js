import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { Client, GatewayIntentBits } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('[clear-guilds] Falta token o clientId');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: '10' }).setToken(token);

client.once('ready', async () => {
  console.log(`Logueado como ${client.user.tag}`);
  
  const guilds = client.guilds.cache.map(g => g.id);
  console.log(`El bot está en ${guilds.length} servidores.`);

  for (const guildId of guilds) {
    try {
      console.log(`Borrando comandos de servidor para ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    } catch (err) {
      console.error(`Error borrando en ${guildId}:`, err.message);
    }
  }
  
  console.log('Todos los comandos de servidor borrados. (Discord ahora debería forzarse a usar los Globales limpios)');
  process.exit(0);
});

client.login(token);
