// Power Luki Network — Ticket System REVAMPED (CLEAN VERSION)
import 'dotenv/config';
import fs from 'fs';
import express from 'express';
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
} from 'discord.js';

/* ───────── CONFIG ───────── */
const CONFIG = {
  TOKEN: process.env.TOKEN,
  PORT: process.env.PORT || 10000,

  PANEL_CHANNEL_ID: '1340758848201424926',
  LOG_CHANNEL_ID: 'PON_ID_LOGS_O_NULL', // Pon la ID real o déjalo así si no usas logs

  // ✅ ROLES ACTUALIZADOS
  ROLES: {
    owner: '1340887228431335457', // Nuevo rol Owner añadido
    staff: '1343093044290916395',
    admin: '1343060062851301406',
    helper: '1343060191880675399',
    programador: '1431306647376101407',
    events: '1343061152732545164',
    coowner: '1343040895313907805',
  },

  // ✅ PERMISOS ACTUALIZADOS (Owner añadido a todo)
  PERMISSIONS: {
    claim: ['owner', 'staff', 'admin', 'helper', 'programador', 'events', 'coowner'],
    close: ['owner', 'admin', 'coowner', 'staff'],
    reopen: ['owner', 'admin', 'coowner', 'staff'],
  },

  AUTO_CLOSE_MS: 24 * 60 * 60 * 1000, // 24h

  TYPES: {
    Reporte: {
      color: 'Orange',
      questions: ['Describe el reporte', 'Prioridad (Alta / Media / Baja)'],
    },
    Bug: {
      color: 'Red',
      questions: ['Describe el bug', 'Plataforma afectada'],
      autoCloseMs: 12 * 60 * 60 * 1000,
    },
    Tienda: {
      color: 'Green',
      questions: ['Producto o problema', 'Detalles adicionales'],
    },
    Otros: {
      color: 'Blue',
      questions: ['Describe tu solicitud'],
    },
  },

  DATA_DIR: './data',
  DATA_FILE: './data/tickets.json',
};

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/* ───────── EXPRESS ───────── */
const app = express();
app.get('/', (_, res) =>
  res.send(`🤖 Ticket Bot: ${client.isReady() ? 'ONLINE ✅' : 'OFFLINE ⏳'}`)
);
app.listen(CONFIG.PORT, () =>
  console.log(`🌐 Web server activo (${CONFIG.PORT})`)
);

/* ───────── DATA ───────── */
function ensureData() {
  if (!fs.existsSync(CONFIG.DATA_DIR))
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG.DATA_FILE))
    fs.writeFileSync(CONFIG.DATA_FILE, '{}');
}

function loadTickets() {
  ensureData();
  try {
    return JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveTickets(data) {
  ensureData();
  fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2));
}

/* ───────── HELPERS ───────── */
const ROLE_IDS = Object.values(CONFIG.ROLES);

function hasPermission(member, action) {
  const allowed = CONFIG.PERMISSIONS[action] || [];
  return allowed.some(key => {
    const roleId = CONFIG.ROLES[key];
    return roleId && member.roles.cache.has(roleId);
  });
}

function ticketEmbed(user, type, details, claimedBy) {
  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket — ${type}`)
    .setColor(CONFIG.TYPES[type].color)
    .setDescription(`👤 Usuario: ${user}`)
    .addFields({
      name: '👮 Asignado',
      value: claimedBy ? `<@${claimedBy}>` : 'Sin asignar',
    })
    .setTimestamp();

  for (const [q, a] of Object.entries(details))
    embed.addFields({ name: q, value: a || '—' });

  return embed;
}

function ticketButtons(channelId, claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_${channelId}`)
      .setLabel(claimed ? 'Dejar Ticket' : 'Reclamar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`close_${channelId}`)
      .setLabel('Cerrar')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`reopen_${channelId}`)
      .setLabel('Reabrir')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function log(guild, message) {
  if (!CONFIG.LOG_CHANNEL_ID || CONFIG.LOG_CHANNEL_ID === 'PON_ID_LOGS_O_NULL') return;
  const ch = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
  if (ch) ch.send(message).catch(() => {});
}

/* ───────── CLIENT READY ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Conectado como ${client.user.tag}`);

  // PANEL
  for (const guild of client.guilds.cache.values()) {
    const panel = guild.channels.cache.get(CONFIG.PANEL_CHANNEL_ID);
    if (!panel) continue;

    // Evitar duplicar el mensaje del panel
    const msgs = await panel.messages.fetch({ limit: 10 });
    if (msgs.some(m => m.author.id === client.user.id && m.embeds.length > 0)) {
       console.log(`✅ Panel ya existente en: ${guild.name}`);
       continue;
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎟️ SISTEMA DE TICKETS — POWER LUKI')
      .setDescription(
        '**Bienvenido al soporte oficial de Power Luki Network**\n\n' +
        '📌 Selecciona el tipo de ticket que mejor se adapte a tu problema:\n\n' +
        '🟦 **Reporte** — Problemas con jugadores o normas\n' +
        '🟥 **Bug** — Errores del servidor o fallos técnicos\n' +
        '🟩 **Tienda** — Compras, rangos o pagos\n' +
        '🟪 **Otros** — Cualquier otra consulta\n\n' +
        '⏱️ *Nuestro equipo responderá lo antes posible*'
      )
      .setImage('https://i.postimg.cc/659F1Hch/IMG-20260204-WA0003.jpg')
      .setFooter({
        text: 'Power Luki Network • Soporte Oficial',
        iconURL: guild.iconURL(),
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      ...Object.keys(CONFIG.TYPES).map(type =>
        new ButtonBuilder()
          .setCustomId(`open_${type}`)
          .setLabel(type)
          .setStyle(
            type === 'Bug'
              ? ButtonStyle.Danger
              : type === 'Tienda'
              ? ButtonStyle.Success
              : ButtonStyle.Primary
          )
      )
    );

    await panel.send({ embeds: [embed], components: [row] });
  }

  // AUTO-CLOSE
  setInterval(() => {
    const tickets = loadTickets();
    const now = Date.now();
    let changed = false;

    for (const [cid, t] of Object.entries(tickets)) {
      const limit = CONFIG.TYPES[t.type]?.autoCloseMs ?? CONFIG.AUTO_CLOSE_MS;

      if (now - t.lastActivity > limit) {
        const ch = client.channels.cache.get(cid);
        if (ch) ch.delete().catch(() => {});
        delete tickets[cid];
        changed = true;
      }
    }
    if (changed) saveTickets(tickets);
  }, 10 * 60 * 1000);
});

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async interaction => {
  const tickets = loadTickets();

  // OPEN BUTTON
  if (interaction.isButton() && interaction.customId.startsWith('open_')) {
    const type = interaction.customId.replace('open_', '');
    
    // Crear Modal
    const modal = new ModalBuilder()
      .setCustomId(`modal_${type}`)
      .setTitle(`Ticket — ${type}`);

    // Añadir preguntas al modal
    CONFIG.TYPES[type].questions.forEach((q, i) =>
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`q${i}`)
            .setLabel(q.substring(0, 45)) // Limite discord label
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      )
    );

    return interaction.showModal(modal);
  }

  // MODAL SUBMIT (Crear el canal)
  if (interaction.isModalSubmit()) {
    const type = interaction.customId.replace('modal_', '');
    const details = {};

    CONFIG.TYPES[type].questions.forEach((q, i) => {
      details[q] = interaction.fields.getTextInputValue(`q${i}`);
    });

    const name = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    
    // Evitar spam de tickets
    const existing = Object.values(tickets).find(t => t.userId === interaction.user.id && t.guildId === interaction.guild.id);
    // Si quieres permitir solo 1 ticket a la vez, descomenta la siguiente línea:
    // if (existing) return interaction.reply({ content: '❌ Ya tienes un ticket abierto.', ephemeral: true });

    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...ROLE_IDS.map(r => ({
        id: r,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      })),
    ];

    try {
        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`, // Nombre del canal
          type: ChannelType.GuildText,
          permissionOverwrites: overwrites,
          parent: interaction.channel.parentId // Opcional: Crear en la misma categoría del panel
        });

        tickets[channel.id] = {
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          type,
          details,
          claimedBy: null,
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };

        saveTickets(tickets);

        await channel.send({
          content: `<@${interaction.user.id}> ${ROLE_IDS.map(r => `<@&${r}>`).join(' ')}`,
          embeds: [ticketEmbed(interaction.user, type, details, null)],
          components: [ticketButtons(channel.id, false)],
        });

        await log(interaction.guild, `📩 Ticket creado (${type}) por <@${interaction.user.id}> en ${channel}`);
        return interaction.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
    } catch (error) {
        console.error(error);
        return interaction.reply({ content: '❌ Error al crear el ticket. Revisa permisos o roles.', ephemeral: true });
    }
  }

  // TICKET BUTTONS (Staff)
  if (interaction.isButton()) {
    // Verificar si es un botón de gestión de tickets
    if (!['claim', 'close', 'reopen'].some(action => interaction.customId.startsWith(action + '_'))) return;

    const [action, cid] = interaction.customId.split('_');
    const ticket = tickets[cid];
    
    // Si el ticket no está en la base de datos (o se borró manualmente)
    if (!ticket) return interaction.reply({ content: '❌ Este ticket ya no está en la base de datos.', ephemeral: true });

    if (!hasPermission(interaction.member, action))
      return interaction.reply({ content: '❌ No tienes permisos para esta acción.', ephemeral: true });

    ticket.lastActivity = Date.now();

    if (action === 'claim') {
        // Toggle claim: si ya es mío lo quito, si no, lo tomo
        if (ticket.claimedBy === interaction.user.id) {
            ticket.claimedBy = null;
        } else {
            ticket.claimedBy = interaction.user.id;
        }
    }

    if (action === 'close') {
      delete tickets[cid];
      saveTickets(tickets);
      await log(interaction.guild, `🔒 Ticket cerrado por <@${interaction.user.id}>`);
      await interaction.reply({ content: '🔒 Cerrando ticket en 5 segundos...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    if (action === 'reopen') {
        // Lógica de reabrir (simplemente actualiza actividad)
        await interaction.channel.send(`🔄 Ticket reabierto/actualizado por <@${interaction.user.id}>`);
    }

    saveTickets(tickets);

    // Actualizar el embed principal con el nuevo estado (ej. Claimed)
    await interaction.update({
      embeds: [ticketEmbed(`<@${ticket.userId}>`, ticket.type, ticket.details, ticket.claimedBy)],
      components: [ticketButtons(cid, !!ticket.claimedBy)],
    });
  }
});

/* ───────── LOGIN ───────── */
if (!CONFIG.TOKEN) {
  console.error('❌ TOKEN no definido en archivo .env');
  process.exit(1);
}

client.login(CONFIG.TOKEN).catch(console.error);
