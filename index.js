// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💎 POWER LUKI NETWORK — TICKET SYSTEM [PREMIUM PROMAX]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import { setDefaultResultOrder } from 'node:dns'; // 🔥 Crítico para Node 22
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  MessageFlags,
  AttachmentBuilder,
  ActivityType
} from 'discord.js';

// Forzamos la resolución de IPv4 antes que IPv6 para evitar el cuelgue en Render
setDefaultResultOrder('ipv4first');

/* ───────── ⚙️ CONFIGURACIÓN MAESTRA ───────── */
const CONFIG = {
  TOKEN: process.env.TOKEN,
  PORT: process.env.PORT || 10000,

  // Canales
  PANEL_CHANNEL_ID: '1340758848201424926',
  LOG_CHANNEL_ID: '1473520250623623441', // ⚠️ IMPORTANTE: Pon una ID real para recibir los Transcripts

  // Roles (IDs)
  ROLES: {
    owner: '1340887228431335457',
    staff: '1343093044290916395',
    admin: '1343060062851301406',
    helper: '1343060191880675399',
    programador: '1431306647376101407',
    events: '1343061152732545164',
    coowner: '1343040895313907805',
  },

  // Permisos de Botones
  PERMISSIONS: {
    claim: ['owner', 'staff', 'admin', 'helper', 'programador', 'events', 'coowner'],
    manage: ['owner', 'admin', 'coowner', 'staff', 'programador'], // Para cerrar/borrar
  },

  // Configuración de Categorías
  TYPES: {
    Reporte: {
      emoji: '🛡️',
      color: '#E67E22', // Naranja
      description: 'Reportar usuarios o incumplimiento de normas.',
      questions: [
        { id: 'reason', label: '¿Qué sucedió?', style: TextInputStyle.Paragraph },
        { id: 'nick', label: 'Nick del usuario reportado', style: TextInputStyle.Short }
      ]
    },
    Bug: {
      emoji: '🐛',
      color: '#E74C3C', // Rojo
      description: 'Reportar errores técnicos o fallos del servidor.',
      questions: [
        { id: 'desc', label: 'Descripción del Bug', style: TextInputStyle.Paragraph },
        { id: 'steps', label: '¿Cómo reproducirlo?', style: TextInputStyle.Paragraph }
      ]
    },
    Tienda: {
      emoji: '💎',
      color: '#2ECC71', // Verde
      description: 'Problemas con compras, rangos o donaciones.',
      questions: [
        { id: 'product', label: '¿Qué producto compraste?', style: TextInputStyle.Short },
        { id: 'txid', label: 'ID de Transacción / Correo', style: TextInputStyle.Short }
      ]
    },
    Otros: {
      emoji: '📬',
      color: '#3498DB', // Azul
      description: 'Dudas generales o consultas.',
      questions: [
        { id: 'inquiry', label: '¿En qué podemos ayudarte?', style: TextInputStyle.Paragraph }
      ]
    },
  },

  DATA_FILE: './tickets.json', // Guardado en raiz para evitar errores de carpetas en algunos hosts
};

/* ───────── 📡 SERVIDOR WEB (Keep Alive) ───────── */
const app = express();
app.get('/', (req, res) => res.send({ status: 'Online', time: new Date().toISOString() }));
app.listen(CONFIG.PORT, () => console.log(`🌐 Web Server corriendo en puerto ${CONFIG.PORT}`));

/* ───────── 💾 GESTIÓN DE DATOS ───────── */
function getTickets() {
  if (!fs.existsSync(CONFIG.DATA_FILE)) fs.writeFileSync(CONFIG.DATA_FILE, '{}');
  try { return JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveTickets(data) {
  fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2));
}

/* ───────── 🛠️ UTILIDADES ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  // Configuraciones de bajo nivel para estabilidad en Cloud
  rest: { 
    timeout: 60000, 
    retries: 5 
  },
  ws: {
    compress: false, // Desactivar compresión reduce carga en el handshake inicial
    large_threshold: 50
  }
});

/* ───────── 🕵️ DEPURACIÓN PROFUNDA ───────── */
client.on('debug', d => console.log(`[DEBUG] ${d}`));
client.on('error', e => console.error(`[ERROR] ${e.message}`));
client.on('warn', w => console.warn(`[WARN] ${w}`));

// Esto te dirá si el bot intenta conectarse pero Discord lo rechaza
client.on('shardDisconnect', (event, id) => {
    console.error(`❌ El Shard ${id} se desconectó. Código: ${event.code}`);
});

// Verifica permisos basado en la configuración
function checkPerms(member, actionType) {
  const allowedRoles = CONFIG.PERMISSIONS[actionType];
  return allowedRoles.some(roleKey => member.roles.cache.has(CONFIG.ROLES[roleKey]));
}

// Genera Transcript simple (Texto)
async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const log = messages.reverse().map(m => 
    `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content} ${m.attachments.size > 0 ? '(Adjunto)' : ''}`
  ).join('\n');
  return new AttachmentBuilder(Buffer.from(log, 'utf-8'), { name: `transcript-${channel.name}.txt` });
}

/* ───────── 🤖 EVENTOS DEL CLIENTE ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🚀 Bot iniciado como: ${client.user.tag}`);

  // --- INICIO DE ESTADOS ROTATIVOS ---
  const estados = [
    { nombre: '🎟️ Soporte de Tickets', tipo: ActivityType.Playing },
    { nombre: '🌐 IP: powerlucky.hidenmc.com', tipo: ActivityType.Watching }, // "Viendo IP..."
    { nombre: '🔗 powerlucky.tebex.io', tipo: ActivityType.Playing }
  ];

  let indice = 0;
  
  // Cambia el estado cada 15 segundos
  setInterval(() => {
    client.user.setActivity(estados[indice].nombre, { type: estados[indice].tipo });
    indice = (indice + 1) % estados.length;
  }, 15000);
  // --- FIN DE ESTADOS ROTATIVOS ---

  // 1. SISTEMA DE PANEL AUTOMÁTICO
  const guild = client.guilds.cache.first(); // Asume que está en 1 server principal
  if (!guild) return;

  const panelChannel = guild.channels.cache.get(CONFIG.PANEL_CHANNEL_ID);
  if (panelChannel) {
    const messages = await panelChannel.messages.fetch({ limit: 5 });
    const alreadyExists = messages.some(m => m.author.id === client.user.id && m.embeds.length > 0);

    if (!alreadyExists) {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎟️ CENTRO DE SOPORTE — POWER LUKI')
        .setDescription(
          `¡Bienvenido al sistema de asistencia oficial!\n\n` +
          `Para comenzar, selecciona la categoría que corresponda a tu consulta pulsando los botones de abajo.\n\n` +
          Object.entries(CONFIG.TYPES).map(([name, data]) => `> **${data.emoji} ${name}**\n> *${data.description}*`).join('\n\n')
        )
        .setImage('https://i.postimg.cc/659F1Hch/IMG-20260204-WA0003.jpg')
        .setFooter({ text: 'Power Luki Network • Sistema Seguro', iconURL: guild.iconURL() });

      const row = new ActionRowBuilder().addComponents(
        Object.keys(CONFIG.TYPES).map(key => 
          new ButtonBuilder()
            .setCustomId(`open_${key}`)
            .setLabel(key)
            .setEmoji(CONFIG.TYPES[key].emoji)
            .setStyle(ButtonStyle.Secondary)
        )
      );

      await panelChannel.send({ embeds: [embed], components: [row] });
      console.log('✅ Panel de tickets publicado.');
    }
  }
});

/* ───────── 🎮 MANEJO DE INTERACCIONES ───────── */
client.on(Events.InteractionCreate, async interaction => {
  const db = getTickets();

  // 👉 1. ABRIR MODAL (Botón del Panel)
  if (interaction.isButton() && interaction.customId.startsWith('open_')) {
    const typeKey = interaction.customId.split('_')[1];
    const typeConfig = CONFIG.TYPES[typeKey];

    if (!typeConfig) return interaction.reply({ content: '❌ Configuración no encontrada.', flags: [MessageFlags.Ephemeral] });

    const modal = new ModalBuilder()
      .setCustomId(`modal_${typeKey}`)
      .setTitle(`Nuevo Ticket: ${typeKey}`);

    // Construcción dinámica de inputs
    typeConfig.questions.forEach((q, index) => {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`q_${index}`)
            .setLabel(q.label)
            .setStyle(q.style)
            .setRequired(true)
        )
      );
    });

    await interaction.showModal(modal); // ⚡ CRÍTICO: Debe ser la primera respuesta
  }

  // 👉 2. PROCESAR FORMULARIO (Crear Canal)
  else if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_')) {
    // ⏳ "Pensando..." para evitar Error 10062 si la API tarda
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const typeKey = interaction.customId.split('_')[1];
    const typeConfig = CONFIG.TYPES[typeKey];
    
    // Recopilar respuestas
    const fields = [];
    typeConfig.questions.forEach((q, index) => {
      fields.push({ name: q.label, value: interaction.fields.getTextInputValue(`q_${index}`) });
    });

    try {
      // Nombre del canal limpio
      const channelName = `${typeKey.substring(0,3)}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

      // Crear canal
      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: interaction.channel.parentId, // Crea en la misma categoría del panel
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
          // Añadir roles staff
          ...Object.values(CONFIG.ROLES).map(roleId => ({
             id: roleId, 
             allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] 
          }))
        ]
      });

      // Guardar en DB
      db[channel.id] = {
        owner: interaction.user.id,
        type: typeKey,
        claimedBy: null,
        openedAt: Date.now()
      };
      saveTickets(db);

      // Embed de bienvenida dentro del ticket
      const ticketEmbed = new EmbedBuilder()
        .setColor(typeConfig.color)
        .setTitle(`${typeConfig.emoji} Ticket: ${typeKey}`)
        .setDescription(`Hola <@${interaction.user.id}>, el staff te atenderá pronto.\n**Estado:** 🟢 Esperando Staff`)
        .addFields(fields)
        .setFooter({ text: 'Usa los botones para gestionar el ticket' })
        .setTimestamp();

      const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Reclamar').setEmoji('🙋‍♂️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar').setEmoji('🔒').setStyle(ButtonStyle.Danger)
      );

      // Mención al staff + Embed
      await channel.send({ 
        content: `|| <@${interaction.user.id}> | Staff: ${Object.values(CONFIG.ROLES).map(r => `<@&${r}>`).join(' ')} ||`, 
        embeds: [ticketEmbed], 
        components: [controls] 
      });

      // Confirmar al usuario
      await interaction.editReply({ content: `✅ Ticket creado exitosamente: ${channel}` });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '❌ Ocurrió un error creando el ticket. Verifica mis permisos.' });
    }
  }

  // 👉 3. BOTONES DENTRO DEL TICKET
  else if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
    const action = interaction.customId.split('_')[1];
    const ticketData = db[interaction.channel.id];

    if (!ticketData) return interaction.reply({ content: '⚠️ Este ticket no está registrado en mi base de datos.', flags: [MessageFlags.Ephemeral] });

    // --- ACCIÓN: RECLAMAR ---
    if (action === 'claim') {
      if (!checkPerms(interaction.member, 'claim')) 
        return interaction.reply({ content: '⛔ No tienes permiso para reclamar tickets.', flags: [MessageFlags.Ephemeral] });

      if (ticketData.claimedBy === interaction.user.id) {
        ticketData.claimedBy = null;
        await interaction.reply({ content: `🗑️ Has dejado el ticket.` });
      } else if (ticketData.claimedBy) {
        return interaction.reply({ content: `❌ Este ticket ya lo atiende <@${ticketData.claimedBy}>`, flags: [MessageFlags.Ephemeral] });
      } else {
        ticketData.claimedBy = interaction.user.id;
        await interaction.reply({ content: `✅ **Ticket reclamado por** <@${interaction.user.id}>` });
      }
      
      saveTickets(db);
      
      // Actualizar nombre del canal para indicar que está ocupado (Opcional)
      // await interaction.channel.setName(`working-${interaction.user.username}`); 
    }

    // --- ACCIÓN: CERRAR ---
    if (action === 'close') {
      if (!checkPerms(interaction.member, 'manage') && interaction.user.id !== ticketData.owner) 
        return interaction.reply({ content: '⛔ Solo el staff o el creador pueden cerrar esto.', flags: [MessageFlags.Ephemeral] });

      await interaction.reply({ content: '🔒 **Cerrando ticket y guardando transcript...**' });

      // Generar Transcript
      const attachment = await generateTranscript(interaction.channel);
      
      // Enviar Log
      const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📕 Ticket Cerrado')
          .setColor('#FF0000')
          .addFields(
            { name: 'Ticket', value: interaction.channel.name, inline: true },
            { name: 'Creador', value: `<@${ticketData.owner}>`, inline: true },
            { name: 'Cerrado por', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setTimestamp();
        
        await logChannel.send({ embeds: [logEmbed], files: [attachment] });
      }

      // Borrar de DB y Discord
      delete db[interaction.channel.id];
      saveTickets(db);
      
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }
  }
});

/* ───────── 🔥 ENCENDIDO ───────── */
client.on('debug', info => console.log(`[DEBUG] ${info}`));
client.on('warn', info => console.warn(`[WARN] ${info}`));
client.on('error', error => console.error(`[ERROR] ${error}`));

// 1. Verificación de seguridad del Token
if (!CONFIG.TOKEN) {
    console.error("------------------------------------------");
    console.error("❌ ERROR CRÍTICO: No se detectó la variable 'TOKEN'.");
    console.error("Asegúrate de configurarla en las Environment Variables de Render.");
    console.error("------------------------------------------");
    process.exit(1);
}

// 2. Diagnóstico de inicio
console.log("------------------------------------------");
console.log("🔍 DIAGNÓSTICO DE INICIO:");
console.log(`- Fecha: ${new Date().toISOString()}`);
console.log(`- Token presente: SÍ (Longitud: ${CONFIG.TOKEN.length})`);
console.log("------------------------------------------");

client.once(Events.ClientReady, async (c) => {
    console.log('------------------------------------------');
    console.log(`✅ [SESIÓN INICIADA]`);
    console.log(`🤖 Usuario: ${c.user.tag}`);
    console.log(`🌍 Servidores: ${c.guilds.cache.size}`);
    console.log('------------------------------------------');
});

// 3. Intento de Login con Watchdog de Conexión
console.log("------------------------------------------");
console.log("⏳ [SISTEMA] Iniciando secuencia de login...");

const connectionWatchdog = setTimeout(() => {
    console.error("⛔ [CRÍTICO] Timeout excedido (30s) sin respuesta de Discord Gateway.");
    console.error("Revisar: Variables de entorno, IPv6 o Rate Limits.");
    process.exit(1);
}, 30000);

client.login(CONFIG.TOKEN)
    .then(() => {
        clearTimeout(connectionWatchdog);
        console.log('🔥 [BOT] Sesión establecida correctamente.');
    })
    .catch(err => {
        clearTimeout(connectionWatchdog);
        console.error('❌ [BOT] Error fatal en la autenticación:');
        console.error(err.stack || err);
        process.exit(1);
    });
