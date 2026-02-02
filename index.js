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
  MAX_INACTIVE_MS: 2 * 24 * 60 * 60 * 1000, // 2 días
  STAFF_ROLE_ID: '1458243569075884219', // Ajusta tu rol de staff
  EMOJIS: { TICKET: '🎫' },
  TYPES: ['Reporte', 'Bug', 'Tienda', 'Otros'],
  QUESTIONS: {
    Reporte: ['Describe tu reporte', 'Prioridad (Alta/Media/Baja)'],
    Bug: ['Describe el bug', 'Plataforma afectada (Java/Bedrock/Otra)'],
    Tienda: ['Producto o problema', 'Detalles adicionales'],
    Otros: ['Describe tu solicitud', 'Información adicional opcional'],
  },
};

/* ───────── EXPRESS SERVER ───────── */
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (_, res) =>
  res.send(`🤖 Bot Power Luki: ${client?.ws?.status === 0 ? 'ONLINE' : 'CONECTANDO...'}`)
);
app.listen(PORT, () => console.log(`🌐 Web server escuchando en ${PORT}`));

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

/* ───────── UTILIDADES ───────── */
function saveTickets(tickets) {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data');
  fs.writeFileSync('./data/tickets.json', JSON.stringify(tickets, null, 2));
}

function loadTickets() {
  if (!fs.existsSync('./data/tickets.json')) fs.writeFileSync('./data/tickets.json', '{}');
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
  console.log(`🤖 Bot conectado como ${client.user.tag}`);

  // Enviar mensaje de ticket si no existe
  client.guilds.cache.forEach(async guild => {
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

    await ch.send({ embeds: [embed], components: [row] }).catch(console.error);
  });
});

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async interaction => {
  const tickets = loadTickets();

  // ===== CREACIÓN DE TICKET =====
  if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
    const typeMap = {
      ticket_report: 'Reporte',
      ticket_bug: 'Bug',
      ticket_tienda: 'Tienda',
      ticket_otro: 'Otros',
    };
    const type = typeMap[interaction.customId];

    const guild = interaction.guild;
    const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const existing = guild.channels.cache.find(c => c.name === channelName);
    if (existing) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });

    // Modal con preguntas específicas
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

  // ===== RECEPCIÓN DE MODAL =====
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
    const type = interaction.customId.replace('ticket_modal_', '');
    const details = {};
    CONFIG.QUESTIONS[type].forEach((q, i) => {
      details[q] = interaction.fields.getTextInputValue(`q${i}`);
    });

    const guild = interaction.guild;
    const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
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
  }

  // ===== CERRAR TICKET =====
  if (interaction.isButton() && interaction.customId.startsWith('close_')) {
    await interaction.reply({ content: 'Cerrando ticket en 5s...', ephemeral: true });
    setTimeout(async () => {
      const ch = interaction.channel;
      const tickets = loadTickets();
      delete tickets[ch.id];
      saveTickets(tickets);
      await ch.delete().catch(() => {});
    }, 5000);
  }

  // ===== RECLAMAR TICKET =====
  if (interaction.isButton() && interaction.customId.startsWith('claim_')) {
    const ticketId = interaction.customId.replace('claim_', '');
    if (tickets[ticketId]?.claimedBy) return interaction.reply({ content: 'Este ticket ya está reclamado.', ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirm_claim_${ticketId}`).setLabel('✅ Sí').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancel_claim_${ticketId}`).setLabel('❌ No').setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ content: '¿Deseas reclamar este ticket?', components: [row], ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId.startsWith('confirm_claim_')) {
    const ticketId = interaction.customId.replace('confirm_claim_', '');
    tickets[ticketId].claimedBy = interaction.user.id;
    saveTickets(tickets);
    return interaction.update({ content: `Ticket reclamado por ${interaction.user.tag}`, components: [], ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId.startsWith('cancel_claim_')) {
    return interaction.update({ content: 'Reclamo cancelado ❌', components: [], ephemeral: true });
  }

  // ===== REABRIR TICKET =====
  if (interaction.isButton() && interaction.customId.startsWith('reopen_')) {
    const ch = interaction.channel;
    if (tickets[ch.id]) return interaction.reply({ content: 'Este ticket ya está abierto.', ephemeral: true });
    tickets[ch.id] = { userId: interaction.user.id, type: 'Reabierto', details: {}, createdAt: Date.now(), lastActivity: Date.now(), claimedBy: null };
    saveTickets(tickets);
    return interaction.reply({ content: 'Ticket reabierto ✅', ephemeral: true });
  }
});

/* ───────── INACTIVIDAD AUTOMÁTICA ───────── */
setInterval(() => {
  const tickets = loadTickets();
  const now = Date.now();
  Object.entries(tickets).forEach(async ([channelId, data]) => {
    if (now - data.lastActivity > CONFIG.MAX_INACTIVE_MS) {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (ch) await ch.delete().catch(() => {});
      delete tickets[channelId];
    }
  });
  saveTickets(tickets);
}, 60_000);

/* ───────── LOGIN ───────── */
client.login(process.env.TOKEN).then(() => console.log('✅ Bot logueado')).catch(console.error);
