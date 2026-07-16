import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', async () => {
    try {
        console.log('Iniciando script de reestructuración 3...');
        const guild = client.guilds.cache.get('1493288927388369139');
        if (!guild) throw new Error('Guild no encontrado');

        // 1. Renombrar reglas
        const reglas = guild.channels.cache.get('1493654460067610664');
        if (reglas) await reglas.setName('・📜︴𝐑𝐞𝐠𝐥𝐚𝐬◦✰');

        // 2. Eliminar Reportes actual (texto)
        const viejosReportes = guild.channels.cache.find(c => c.name.includes('𝐑𝐞𝐩𝐨𝐫𝐭𝐞𝐬') && c.type === ChannelType.GuildText);
        if (viejosReportes) await viejosReportes.delete();

        // 3. Crear Reportes como FORO
        const catComunidad = '1493288928411910316';
        await guild.channels.create({
            name: '・🐞︴𝐑𝐞𝐩𝐨𝐫𝐭𝐞𝐬◦✰',
            type: ChannelType.GuildForum,
            parent: catComunidad,
            topic: '📖 GUÍA DEL CANAL:\nReporte de bugs y problemas.\n\n¿Qué hacer aquí?\n1. Documenta fallos del servidor o del bot Novarito.\n2. Avisa sobre exploits o abusos.\n\n⚖️ Igualdad: Todo reporte será tratado de manera justa y sin favoritismos.'
        });

        // 4. Crear Categoría Privada y Canal de Pruebas
        const adminRole = guild.roles.cache.find(r => r.name.includes('𝐀𝐝𝐦𝐢𝐧𝐢𝐬𝐭𝐫𝐚𝐝𝐨𝐫'));
        const staffRole = guild.roles.cache.find(r => r.name.includes('𝐌𝐨𝐝𝐞𝐫𝐚𝐝𝐨𝐫'));
        
        const permissionOverwrites = [
            {
                id: guild.id, // @everyone
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            }
        ];
        if (adminRole) permissionOverwrites.push({ id: adminRole.id, allow: [PermissionsBitField.Flags.ViewChannel] });
        if (staffRole) permissionOverwrites.push({ id: staffRole.id, allow: [PermissionsBitField.Flags.ViewChannel] });

        const catStaffPriv = await guild.channels.create({
            name: '「🔒︴✦-𝐙𝐎𝐍𝐀-𝐒𝐓𝐀𝐅𝐅-✦」',
            type: ChannelType.GuildCategory,
            permissionOverwrites
        });

        await guild.channels.create({
            name: '・🛠️︴𝐏𝐫𝐮𝐞𝐛𝐚𝐬◦✰',
            type: ChannelType.GuildText,
            parent: catStaffPriv.id,
            topic: '📖 GUÍA DEL CANAL: Canal aislado para testeo del bot y comandos de staff. Solo visible para moderadores.'
        });

        // 5. Añadir más canales geniales
        const canalesExtra = [
            { name: '・🎮︴𝐉𝐮𝐞𝐠𝐨𝐬◦✰', topic: '📖 GUÍA DEL CANAL:\nBúsqueda de grupo y charla gaming.\n\n¿Qué hacer aquí?\n1. Busca dúo o equipo para jugar.\n2. Comparte tus victorias o clips de videojuegos.\n\n⚖️ Igualdad: Respeto entre jugadores, nada de toxicidad.' },
            { name: '・🎨︴𝐃𝐢𝐬𝐞𝐧̃𝐨◦✰', topic: '📖 GUÍA DEL CANAL:\nArte, diseño gráfico y edición.\n\n¿Qué hacer aquí?\n1. Comparte tus dibujos, banners o edits.\n2. Pide feedback constructivo sobre tu trabajo.\n\n⚖️ Igualdad: No robes arte, da créditos siempre.' },
            { name: '・🎥︴𝐒𝐭𝐫𝐞𝐚𝐦𝐢𝐧𝐠◦✰', topic: '📖 GUÍA DEL CANAL:\nCreadores de contenido.\n\n¿Qué hacer aquí?\n1. Avisa cuando estés en vivo (Twitch/YouTube).\n2. Comparte tus videos.\n\n⚖️ Igualdad: Evita el spam excesivo, interactúa con los demás.' }
        ];

        for (const can of canalesExtra) {
            await guild.channels.create({
                name: can.name,
                type: ChannelType.GuildText,
                parent: catComunidad,
                topic: can.topic
            });
        }

        console.log('Script finalizado con éxito.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
});

client.login(process.env.DISCORD_TOKEN);
