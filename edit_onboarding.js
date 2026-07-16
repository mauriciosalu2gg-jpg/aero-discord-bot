import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function getOrCreateRole(guild, name, color) {
    let role = guild.roles.cache.find(r => r.name === name);
    if (!role) {
        console.log(`Creating role: ${name}`);
        role = await guild.roles.create({
            name: name,
            color: color,
            reason: 'Onboarding roles'
        });
    }
    return role.id;
}

client.once('ready', async () => {
    try {
        console.log('Fetching guild...');
        const guild = client.guilds.cache.get('1493288927388369139');
        if (!guild) return console.log('Guild not found');

        await guild.roles.fetch();

        console.log('Setting up roles...');
        const rMexico = await getOrCreateRole(guild, '🇲🇽 México', '#006847');
        const rEspana = await getOrCreateRole(guild, '🇪🇸 España', '#AA151B');
        const rArgentina = await getOrCreateRole(guild, '🇦🇷 Argentina', '#74ACDF');
        const rColombia = await getOrCreateRole(guild, '🇨🇴 Colombia', '#FCD116');
        const rChile = await getOrCreateRole(guild, '🇨🇱 Chile', '#D52B1E');
        const rPeru = await getOrCreateRole(guild, '🇵🇪 Perú', '#D91023');
        const rOtro = await getOrCreateRole(guild, '🌎 Latam / Otro', '#99AAB5');

        const rSocial = await getOrCreateRole(guild, '🗣️ Charlar', '#FF5E89');
        const rJugar = await getOrCreateRole(guild, '🎮 Gamer', '#5E89FF');
        const rMirar = await getOrCreateRole(guild, '👀 Espectador', '#2C2F33');
        const rDebate = await getOrCreateRole(guild, '🤔 Filósofo', '#E6C200');

        // ==== ONBOARDING ====
        console.log('Editing Onboarding...');
        await guild.editOnboarding({
            enabled: true,
            mode: 1, // ONBOARDING_DEFAULT
            defaultChannels: [
                '1493288928411910318', // General
                '1504258529819889784', // REGLAS
                '1493653960987246805', // Anuncios
                '1498357095345553488', // Avisos
                '1493979737280876644', // Comandos
                '1504933513714077879', // Media
                '1527253013209682010', // Reportes
                '1527250968956375110', // Ayuda
                '1504912669809836274'  // Tickets
            ],
            prompts: [
                {
                    title: '¿Cuáles son tus intereses principales? 🎮🎨',
                    options: [
                        {
                            title: 'Anime, Manga y Cultura Geek',
                            description: 'Para los otakus y fans de la cultura pop.',
                            channels: ['1493288928411910318'],
                            roles: [],
                            emoji: '1493452241208873042' // umamazing_2
                        },
                        {
                            title: 'Videojuegos y Búsqueda de Grupo',
                            description: 'Desbloquea canales de gaming y voz.',
                            channels: ['1527248131228700672', '1498386165772980416'],
                            roles: [],
                            emoji: '1493661504132747357' // liiko
                        },
                        {
                            title: 'Tecnología, Programación e IA',
                            description: 'Un espacio para hardware, software y tecnología.',
                            channels: ['1527250963336007710'],
                            roles: [],
                            emoji: '1498193280696062084' // disgusted
                        },
                        {
                            title: 'Arte, Dibujo y Diseño',
                            description: 'Comparte tu arte y recibe feedback.',
                            channels: ['1494486731712499804', '1527253017529811037'],
                            roles: [],
                            emoji: '1494370866837061682' // Liko_2
                        },
                        {
                            title: 'Creación de Contenido y Streams',
                            description: 'Comparte tus directos con la comunidad.',
                            channels: ['1527253019081572426'],
                            roles: [],
                            emoji: '1496247148977721354' // AHHHH
                        },
                        {
                            title: 'Charlar de la vida y Debates',
                            description: 'Cosas cotidianas, dilemas o el mundo.',
                            channels: ['1527248129148194937'],
                            roles: [],
                            emoji: '1498188042920394823' // Tea
                        },
                        {
                            title: 'Memes y Shitpost',
                            description: 'Solo quiero reírme un rato.',
                            channels: ['1504933513714077879'],
                            roles: [],
                            emoji: '1493453094661652490' // ehh
                        }
                    ],
                    required: true,
                    singleSelect: false,
                    inOnboarding: true,
                },
                {
                    title: '¿De qué país nos visitas? 🌎',
                    options: [
                        { title: 'México', description: '¡Viva México!', channels: [], roles: [rMexico], emoji: '🌮' },
                        { title: 'España', description: '¡Olé!', channels: [], roles: [rEspana], emoji: '🥘' },
                        { title: 'Argentina', description: '¡Che, boludo!', channels: [], roles: [rArgentina], emoji: '🧉' },
                        { title: 'Colombia', description: '¡Qué chimba!', channels: [], roles: [rColombia], emoji: '☕' },
                        { title: 'Chile', description: '¡Weón!', channels: [], roles: [rChile], emoji: '🍷' },
                        { title: 'Perú', description: '¡Causa!', channels: [], roles: [rPeru], emoji: '🦙' },
                        { title: 'Otro País de Latam / Mundo', description: 'De otra parte del planeta.', channels: [], roles: [rOtro], emoji: '1493450693904826491' }
                    ],
                    required: true,
                    singleSelect: true,
                    inOnboarding: true,
                },
                {
                    title: '¿Qué tipo de socialización buscas? ✨',
                    options: [
                        {
                            title: 'Quiero socializar y hacer amigos',
                            description: 'Hablar de todo un poco y conocer gente.',
                            channels: [],
                            roles: [rSocial],
                            emoji: '1493450362286247997' // colazon
                        },
                        {
                            title: 'Solo vengo a jugar con otros',
                            description: 'Lo mío son las partidas y los voice chats.',
                            channels: [],
                            roles: [rJugar],
                            emoji: '1498193872445247581' // happy
                        },
                        {
                            title: 'Me gusta debatir y dar mi opinión',
                            description: 'Intercambiar ideas respetuosamente.',
                            channels: [],
                            roles: [rDebate],
                            emoji: '1495830887328256241' // grumpy
                        },
                        {
                            title: 'Prefiero solo mirar / Modo Fantasma',
                            description: 'Estar chill, leer y ver memes sin tanta presión.',
                            channels: [],
                            roles: [rMirar],
                            emoji: '1493662574682705950' // hapiiitachyon
                        }
                    ],
                    required: true,
                    singleSelect: false,
                    inOnboarding: true,
                },
                {
                    title: 'Opcionales: Eventos y Entretenimiento 🎁',
                    options: [
                        {
                            title: 'Notificaciones de Eventos y Sorteos',
                            description: 'Acceso directo a dinámicas y premios.',
                            channels: ['1527250964657078302', '1527250965248479383'],
                            roles: [],
                            emoji: '1496184954416267445'
                        },
                        {
                            title: 'Votar en Encuestas Comunitarias',
                            description: 'Ayuda a decidir el futuro del servidor.',
                            channels: ['1527250966884253725'],
                            roles: [],
                            emoji: '📊'
                        },
                        {
                            title: 'Bots de Música',
                            description: 'Desbloquea los comandos de música.',
                            channels: ['1504927889093824543'],
                            roles: [],
                            emoji: '🎧'
                        },
                        {
                            title: 'Alianzas y Promociones',
                            description: 'Spam sano y búsqueda de partners.',
                            channels: ['1494486157239779529', '1527248509554786486'],
                            roles: [],
                            emoji: '🤝'
                        }
                    ],
                    required: false,
                    singleSelect: false,
                    inOnboarding: false,
                }
            ]
        });

        console.log('Onboarding successfully updated!');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
