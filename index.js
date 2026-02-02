// index.js — Power Luki Network Bot con Ticket System PRO
import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

/* ───────── CONFIG ───────── */
const CONFIG = {
  TICKET_CHANNEL_NAME: '📖tickets',
  MAX_INACTIVE_MS: 2 * 24 * 60 * 60 * 1000, 
  STAFF_ROLE_ID: '1343353558665396406', // ID ACTUALIZADO según tus mensajes
  EMOJIS: { TICKET: '🎫' },
  TYPES: ['Reporte', 'Bug', 'Tienda', 'Otros'],
  QUESTIONS: {
    Reporte: ['Describe tu reporte', 'Prioridad (Alta/Media/Baja)'],
    Bug: ['Describe el bug', 'Plataforma afectada (Java/Bedrock/Otra)'],
    Tienda: ['Producto o problema', 'Detalles adicionales'],
    Otros: ['Describe tu solicitud', 'Información adicional opcional'],
  },
};

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

/* ───────── EXPRESS SERVER ───────── */
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (_, res) => {
  const status = client.isReady() ? 'ONLINE ✅' : 'CONECTANDO... ⏳';
  res.send(`🤖 Bot Power Luki: ${status}`);
});

// El servidor web se inicia aquí
app.listen(PORT, () => console.log(`🌐 Web server escuchando en puerto ${PORT}`));

/* ───────── UTILIDADES ───────── */
function saveTickets(tickets) {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync('./data/tickets.json', JSON.stringify(tickets, null, 2));
}

function loadTickets() {
  if (!fs.existsSync('./data/tickets.json')) {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync('./data/tickets.json', '{}');
  }
  return JSON.parse(fs.readFileSync('./data/tickets.json', 'utf8'));
}

function findChannelByName(guild, name) {
  return guild?.channels.cache.find(c => c.name === name);
}

function createTicketEmbed(user, type, details = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${type} Ticket`)
    .setDescription(`Hola ${user}, este es tu ticket de tipo **${type}**.`)
    .setColor(type === 'Bug' ? 'Red' : type === 'Reporte' ? 'Orange' : type === 'Tienda' ? 'Green' : 'Blue')
    .setFooter({ text: 'Ticket abierto' })
    .setTimestamp();

  Object.entries(details).forEach(([k, v]) => embed.addFields({ name: k, value: v || 'No proporcionado' }));
  return embed;
}

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ ¡ÉXITO! Bot conectado como ${client.user.tag}`);

  client.guilds.cache.forEach(async guild => {
    try {
      const ch = findChannelByName(guild, CONFIG.TICKET_CHANNEL_NAME);
      if (!ch) return;

      const fetched = await ch.messages.fetch({ limit: 10 });
      if (fetched.some(m => m.author.id === client.user.id && m.embeds.length && m.embeds[0].title === '🎫 Tickets')) return;

      const embed = new EmbedBuilder()
        .setTitle('🎫 Tickets')
        .setDescription('Pulsa un botón para crear un ticket.\nTipos disponibles: Reporte, Bug, Tienda, Otros')
        .setColor('Blue');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_report').setLabel('Reporte').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_bug').setLabel('Bug').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_tienda').setLabel('Tienda').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_otro').setLabel('Otros').setStyle(ButtonStyle.Secondary),
      );

      await ch.send({ embeds: [embed], components: [row] });
    } catch (e) {
      console.error("Error en canal de tickets:", e.message);
    }
  });
});

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async interaction => {
  const tickets = loadTickets();

  if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
    const typeMap = {
      ticket_report: 'Reporte',
      ticket_bug: 'Bug',
      ticket_tienda: 'Tienda',
      ticket_otro: 'Otros',
    };
    const type = typeMap[interaction.customId];

    const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
    if (existing) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });

    const modal = new ModalBuilder().setCustomId(`ticket_modal_${type}`).setTitle(`${type} Ticket`);

    CONFIG.QUESTIONS[type].forEach((q, i) => {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(`q${i}`).setLabel(q).setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
    });

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
    const type = interaction.customId.replace('ticket_modal_', '');
    const details = {};
    CONFIG.QUESTIONS[type].forEach((q, i) => {
      details[q] = interaction.fields.getTextInputValue(`q${i}`);
    });

    const guild = interaction.guild;
    const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    
    try {
        const channel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ],
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`close_${channel.id}`).setLabel('Cerrar').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`claim_${channel.id}`).setLabel('Reclamar').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`reopen_${channel.id}`).setLabel('Reabrir').setStyle(ButtonStyle.Secondary)
        );

        const embed = createTicketEmbed(interaction.user, type, details);
        await channel.send({ content: `<@${interaction.user.id}> <@&${CONFIG.STAFF_ROLE_ID}>`, embeds: [embed], components: [row] });

        tickets[channel.id] = { userId: interaction.user.id, type, details, createdAt: Date.now(), lastActivity: Date.now(), claimedBy: null };
        saveTickets(tickets);

        return interaction.reply({ content: `Ticket creado: ${channel}`, ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: 'Error al crear el canal. Revisa los permisos del bot.', ephemeral: true });
    }
  }

  // CERRAR, RECLAMAR, etc. (Simplificado para depuración)
  if (interaction.isButton() && interaction.customId.startsWith('close_')) {
    await interaction.reply({ content: 'Cerrando ticket...', ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
  }
});

/* ───────── LOGIN DEFINITIVO ───────── */
console.log("📡 Intentando conectar a Discord...");

if (!process.env.TOKEN) {
    console.error("❌ ERROR: No hay TOKEN en las variables de Render.");
} else {
    client.login(process.env.TOKEN).catch(err => {
        console.error("❌ FALLO EL LOGIN:");
        console.error(err.message);
    });
}
