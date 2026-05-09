const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const DATA_FILE = './data.json';

// ===== DATA HELPERS =====
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { tickets: [], results: [], weekTokens: {}, weekKey: getWeekKey() };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { tickets: [], results: [], weekTokens: {}, weekKey: getWeekKey() }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getWeekKey() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

function checkAndResetWeek(data) {
  const cur = getWeekKey();
  if (data.weekKey !== cur) {
    data.weekKey = cur;
    data.weekTokens = {};
    saveData(data);
  }
  return data;
}

function formatTime(mins, secs) {
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const CLASS_ICONS = { Warrior: '⚔️', Mage: '🔮', Archer: '🏹', Healer: '💚', Rogue: '🗡️', Paladin: '🛡️' };
const CLASS_COLORS_HEX = { Warrior: 0xe05c5c, Mage: 0x9b59ff, Archer: 0x3bc48d, Healer: 0x55d4a0, Rogue: 0xf0c040, Paladin: 0x6aaeff };

// ===== EMBEDS =====
function ticketEmbed(ticket) {
  const members = ticket.members || [];
  const filled = members.length;
  const total = ticket.partySize;
  const statusMap = { open: '🟢 OPEN', full: '🔒 FULL', completed: '✅ DONE', closed: '🔴 CLOSED' };
  const memberList = members.map(m => `${CLASS_ICONS[m.cls]} **${m.name}** (${m.cls})`).join('\n') || '—';
  const empty = Array(Math.max(0, total - filled)).fill('— ว่าง —').join('\n');

  return new EmbedBuilder()
    .setColor(ticket.status === 'completed' ? 0x3bc48d : ticket.status === 'full' ? 0xf0c040 : 0x1a6aff)
    .setTitle(`🎫 Ticket #${ticket.id} — ${ticket.creatorName}`)
    .addFields(
      { name: '👥 Party Size', value: `${total} คน`, inline: true },
      { name: '🎯 เวลาเป้าหมาย', value: formatTime(ticket.targetMins, ticket.targetSecs), inline: true },
      { name: '📅 วันที่', value: ticket.runDate, inline: true },
      { name: `📋 สมาชิก (${filled}/${total})`, value: memberList + (empty ? '\n' + empty : '') },
      { name: '📊 สถานะ', value: statusMap[ticket.status] || ticket.status, inline: true },
    )
    .setFooter({ text: `Where Wind Meet Speedrun · สัปดาห์ ${ticket.weekKey}` })
    .setTimestamp();
}

function leaderboardEmbed(results, filterSize) {
  const medals = ['🥇', '🥈', '🥉'];
  const filtered = filterSize ? results.filter(r => r.partySize === filterSize) : results;
  const sorted = [...filtered].sort((a, b) => (a.mins * 60 + a.secs) - (b.mins * 60 + b.secs));

  const rows = sorted.slice(0, 10).map((r, i) => {
    const medal = medals[i] || `**#${i + 1}**`;
    const time = formatTime(r.mins, r.secs);
    const beat = r.beat ? '✅' : '❌';
    return `${medal} ${beat} \`${time}\` — **${r.runner}** (${r.partySize}P) · ${r.runDate}`;
  }).join('\n') || 'ยังไม่มีผล';

  return new EmbedBuilder()
    .setColor(0xf0c040)
    .setTitle(`🏆 Leaderboard${filterSize ? ` — ${filterSize} คน` : ' — ทั้งหมด'}`)
    .setDescription(rows)
    .setFooter({ text: 'Where Wind Meet Speedrun' })
    .setTimestamp();
}

function tokenEmbed(data) {
  const entries = Object.entries(data.weekTokens);
  const rows = entries.length
    ? entries.map(([name, used]) => {
        const bar = '█'.repeat(used) + '░'.repeat(7 - used);
        return `**${name}** \`${bar}\` ${used}/7`;
      }).join('\n')
    : 'ยังไม่มีการใช้ Token สัปดาห์นี้';

  return new EmbedBuilder()
    .setColor(0x7ecfff)
    .setTitle(`🪙 Token สัปดาห์ ${data.weekKey}`)
    .setDescription(rows)
    .setFooter({ text: 'รีใหม่ทุกต้นสัปดาห์' });
}

// ===== BUTTONS =====
function ticketButtons(ticket) {
  const row = new ActionRowBuilder();
  if (ticket.status === 'open') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`join_${ticket.id}`).setLabel('+ เข้าร่วม').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`result_${ticket.id}`).setLabel('🏁 บันทึกผล').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`close_${ticket.id}`).setLabel('✕ ปิด Ticket').setStyle(ButtonStyle.Danger),
    );
  } else if (ticket.status === 'full') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`result_${ticket.id}`).setLabel('🏁 บันทึกผล').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`close_${ticket.id}`).setLabel('✕ ปิด').setStyle(ButtonStyle.Danger),
    );
  } else {
    return null;
  }
  return row;
}

// ===== COMMANDS =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  if (!content.startsWith('!')) return;

  const [cmd, ...args] = content.slice(1).split(' ');
  let data = loadData();
  data = checkAndResetWeek(data);

  // !create <party:5|10> <target:MM:SS> <date:YYYY-MM-DD> [note]
  if (cmd === 'create') {
    const usage = '❌ ใช้: `!create <5|10> <MM:SS> <YYYY-MM-DD> [note]`\nตัวอย่าง: `!create 5 30:00 2025-06-01 ต้องการ healer`';
    if (args.length < 3) return message.reply(usage);

    const partySize = parseInt(args[0]);
    if (![5, 10].includes(partySize)) return message.reply('❌ Party size ต้องเป็น 5 หรือ 10 เท่านั้น');

    const timeParts = args[1].split(':');
    if (timeParts.length !== 2) return message.reply(usage);
    const targetMins = parseInt(timeParts[0]);
    const targetSecs = parseInt(timeParts[1]);
    if (isNaN(targetMins) || isNaN(targetSecs)) return message.reply(usage);

    const runDate = args[2];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) return message.reply('❌ วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD เช่น 2025-06-01');

    const note = args.slice(3).join(' ');
    const name = message.author.username;
    const usedTokens = data.weekTokens[name] || 0;
    if (usedTokens >= 7) return message.reply(`❌ **${name}** Token หมดสัปดาห์นี้แล้ว (7/7)`);

    const id = Date.now().toString().slice(-5);
    const ticket = {
      id, creatorName: name, creatorId: message.author.id,
      partySize, targetMins, targetSecs, runDate, note,
      members: [{ name, cls: 'Warrior', userId: message.author.id }],
      status: 'open', weekKey: data.weekKey,
      createdAt: new Date().toISOString()
    };

    data.tickets.push(ticket);
    data.weekTokens[name] = usedTokens + 1;
    saveData(data);

    const embed = ticketEmbed(ticket);
    const row = ticketButtons(ticket);
    const msg = await message.channel.send({ content: `✅ **${name}** สร้าง Ticket สำเร็จ! Token เหลือ ${7 - data.weekTokens[name]}/7`, embeds: [embed], components: row ? [row] : [] });

    // Store message ID for later update
    data.tickets[data.tickets.length - 1].messageId = msg.id;
    data.tickets[data.tickets.length - 1].channelId = message.channel.id;
    saveData(data);
    return;
  }

  // !tickets [5|10]
  if (cmd === 'tickets') {
    const filterSize = args[0] ? parseInt(args[0]) : null;
    const open = data.tickets.filter(t => t.status === 'open' || t.status === 'full');
    const filtered = filterSize ? open.filter(t => t.partySize === filterSize) : open;

    if (filtered.length === 0) return message.reply('📋 ไม่มี Ticket ที่เปิดอยู่ตอนนี้ ใช้ `!create` เพื่อสร้างใหม่');

    for (const t of filtered.slice(0, 5)) {
      const row = ticketButtons(t);
      await message.channel.send({ embeds: [ticketEmbed(t)], components: row ? [row] : [] });
    }
    return;
  }

  // !leaderboard [5|10]
  if (cmd === 'leaderboard' || cmd === 'lb') {
    const filterSize = args[0] ? parseInt(args[0]) : null;
    return message.channel.send({ embeds: [leaderboardEmbed(data.results, filterSize)] });
  }

  // !tokens
  if (cmd === 'tokens') {
    return message.channel.send({ embeds: [tokenEmbed(data)] });
  }

  // !help
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x7ecfff)
      .setTitle('🌬️ Where Wind Meet — คำสั่ง Bot')
      .addFields(
        { name: '`!create <5|10> <MM:SS> <YYYY-MM-DD> [note]`', value: 'สร้าง Speedrun Ticket\nตัวอย่าง: `!create 5 30:00 2025-06-01 ต้องการ healer`' },
        { name: '`!tickets [5|10]`', value: 'ดู Ticket ที่เปิดอยู่ทั้งหมด' },
        { name: '`!leaderboard [5|10]`', value: 'ดู Leaderboard จัดอันดับเวลา' },
        { name: '`!tokens`', value: 'ดู Token คงเหลือของทุกคนสัปดาห์นี้' },
        { name: 'ปุ่มใต้ Ticket', value: '**+ เข้าร่วม** → เลือกอาชีพแล้วเข้า party\n**🏁 บันทึกผล** → ใส่เวลาและแนบรูป screenshot\n**✕ ปิด** → ปิด Ticket' },
      )
      .setFooter({ text: 'Token รีใหม่ทุกต้นสัปดาห์ · แต่ละคนได้ 7 token/สัปดาห์' });
    return message.channel.send({ embeds: [embed] });
  }
});

// ===== BUTTON & MODAL INTERACTIONS =====
client.on('interactionCreate', async (interaction) => {
  let data = loadData();
  data = checkAndResetWeek(data);

  // ---- BUTTONS ----
  if (interaction.isButton()) {
    const [action, ticketId] = interaction.customId.split('_');
    const ticket = data.tickets.find(t => t.id === ticketId);
    if (!ticket) return interaction.reply({ content: '❌ ไม่พบ Ticket นี้แล้ว', ephemeral: true });

    // JOIN → show class select
    if (action === 'join') {
      if (ticket.status === 'completed' || ticket.status === 'closed') return interaction.reply({ content: '❌ Ticket นี้ปิดแล้ว', ephemeral: true });
      const name = interaction.user.username;
      const usedTokens = data.weekTokens[name] || 0;
      if (usedTokens >= 7) return interaction.reply({ content: `❌ Token ของคุณหมดสัปดาห์นี้แล้ว (7/7)`, ephemeral: true });
      if (ticket.members.some(m => m.userId === interaction.user.id)) return interaction.reply({ content: '❌ คุณอยู่ใน party นี้แล้ว', ephemeral: true });
      if (ticket.members.length >= ticket.partySize) return interaction.reply({ content: '❌ Party เต็มแล้ว', ephemeral: true });

      const select = new StringSelectMenuBuilder()
        .setCustomId(`selectclass_${ticketId}`)
        .setPlaceholder('เลือกอาชีพของคุณ')
        .addOptions([
          { label: '⚔️ Warrior', value: 'Warrior' },
          { label: '🔮 Mage', value: 'Mage' },
          { label: '🏹 Archer', value: 'Archer' },
          { label: '💚 Healer', value: 'Healer' },
          { label: '🗡️ Rogue', value: 'Rogue' },
          { label: '🛡️ Paladin', value: 'Paladin' },
        ]);

      const row = new ActionRowBuilder().addComponents(select);
      return interaction.reply({ content: '**เลือกอาชีพของคุณ:**', components: [row], ephemeral: true });
    }

    // RESULT → show modal
    if (action === 'result') {
      const modal = new ModalBuilder()
        .setCustomId(`resultmodal_${ticketId}`)
        .setTitle('🏁 บันทึกผล Speedrun');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('runner').setLabel('ชื่อผู้รายงาน').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('time').setLabel('เวลาที่ทำได้จริง (MM:SS)').setStyle(TextInputStyle.Short).setPlaceholder('25:30').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('imgurl').setLabel('URL รูป Screenshot (ถ้ามี)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://...')
        ),
      );
      return interaction.showModal(modal);
    }

    // CLOSE
    if (action === 'close') {
      if (interaction.user.id !== ticket.creatorId) return interaction.reply({ content: '❌ เฉพาะผู้สร้าง Ticket เท่านั้นที่ปิดได้', ephemeral: true });
      ticket.status = 'closed';
      saveData(data);
      await interaction.reply({ content: `🔴 Ticket #${ticket.id} ปิดแล้ว` });
      return;
    }
  }

  // ---- SELECT CLASS ----
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('selectclass_')) {
    const ticketId = interaction.customId.split('_')[1];
    const ticket = data.tickets.find(t => t.id === ticketId);
    if (!ticket) return interaction.reply({ content: '❌ ไม่พบ Ticket', ephemeral: true });

    const cls = interaction.values[0];
    const name = interaction.user.username;

    ticket.members.push({ name, cls, userId: interaction.user.id });
    data.weekTokens[name] = (data.weekTokens[name] || 0) + 1;
    if (ticket.members.length >= ticket.partySize) ticket.status = 'full';
    saveData(data);

    await interaction.update({ content: `✅ **${name}** เข้าร่วม party ในฐานะ ${CLASS_ICONS[cls]} ${cls} แล้ว! Token เหลือ ${7 - data.weekTokens[name]}/7`, components: [] });

    // Update original ticket message
    if (ticket.channelId && ticket.messageId) {
      try {
        const ch = await client.channels.fetch(ticket.channelId);
        const msg = await ch.messages.fetch(ticket.messageId);
        const row = ticketButtons(ticket);
        await msg.edit({ embeds: [ticketEmbed(ticket)], components: row ? [row] : [] });
      } catch {}
    }
    return;
  }

  // ---- MODAL SUBMIT (RESULT) ----
  if (interaction.isModalSubmit() && interaction.customId.startsWith('resultmodal_')) {
    const ticketId = interaction.customId.split('_')[1];
    const ticket = data.tickets.find(t => t.id === ticketId);
    if (!ticket) return interaction.reply({ content: '❌ ไม่พบ Ticket', ephemeral: true });

    const runner = interaction.fields.getTextInputValue('runner');
    const timeStr = interaction.fields.getTextInputValue('time');
    const imgUrl = interaction.fields.getTextInputValue('imgurl') || null;

    const parts = timeStr.split(':');
    if (parts.length !== 2 || isNaN(+parts[0]) || isNaN(+parts[1])) {
      return interaction.reply({ content: '❌ รูปแบบเวลาไม่ถูกต้อง ใช้ MM:SS เช่น 25:30', ephemeral: true });
    }
    const mins = parseInt(parts[0]);
    const secs = parseInt(parts[1]);
    const actualTotal = mins * 60 + secs;
    const targetTotal = ticket.targetMins * 60 + ticket.targetSecs;
    const beat = actualTotal <= targetTotal;

    const result = {
      ticketId, runner, mins, secs, imgUrl, beat,
      partySize: ticket.partySize,
      targetMins: ticket.targetMins, targetSecs: ticket.targetSecs,
      runDate: ticket.runDate,
      submittedAt: new Date().toISOString()
    };
    data.results.push(result);
    ticket.status = 'completed';
    saveData(data);

    const embed = new EmbedBuilder()
      .setColor(beat ? 0x3bc48d : 0xe05c5c)
      .setTitle(`${beat ? '✅' : '❌'} ผล Speedrun — Ticket #${ticketId}`)
      .addFields(
        { name: '👤 Runner', value: runner, inline: true },
        { name: '⏱️ เวลาจริง', value: `\`${formatTime(mins, secs)}\``, inline: true },
        { name: '🎯 เวลาเป้า', value: `\`${formatTime(ticket.targetMins, ticket.targetSecs)}\``, inline: true },
        { name: '📊 ผล', value: beat ? '**ทำได้ตามเป้า!** 🎉' : 'ยังไม่ถึงเป้า ลองใหม่ได้!' },
      )
      .setTimestamp();

    if (imgUrl) embed.setImage(imgUrl);

    await interaction.reply({ embeds: [embed] });
    return;
  }
});

// ===== LOGIN =====
client.once('ready', () => {
  console.log(`✅ Bot พร้อมใช้งาน: ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
