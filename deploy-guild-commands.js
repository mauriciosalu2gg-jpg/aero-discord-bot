import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { commandDefinitions } from './interactions/commandDefinitions.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('[deploy-guilds] Falta token o clientId');
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
      console.log(`Registrando comandos de servidor para ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandDefinitions });
    } catch (err) {
      console.error(`Error registrando en ${guildId}:`, err.message);
    }
  }
  
  console.log('Todos los comandos de servidor registrados. (Deberían aparecer al instante)');
  process.exit(0);
});

client.login(token);
