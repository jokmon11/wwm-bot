const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const DATA_FILE = './data.json';
const LOG_CHANNEL_NAME = 'wwm-log'; // สร้าง channel ชื่อนี้ใน Discord

// ===== DATA =====
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { tickets: [], results: [], weekTokens: {}, weekKey: getWeekKey() };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { tickets: [], results: [], weekTokens: {}, weekKey: getWeekKey() }; }
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

function getWeekKey() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

async function checkAndResetWeek(data, channel) {
  const cur = getWeekKey();
  if (data.weekKey !== cur) {
    data.weekKey = cur;
    data.weekTokens = {};
    saveData(data);
    if (channel) {
      await channel.send({ embeds: [new EmbedBuilder()
        .setColor(0x3bc48d)
        .setTitle('🔄 รีเซ็ต Token ประจำสัปดาห์!')
        .setDescription('สัปดาห์ใหม่เริ่มแล้ว! ทุกคนได้รับ **7 Token**\n\n🪙 Token หักเมื่อ **บันทึกผล Run** เท่านั้น\n🔄 รีเซ็ตทุกวันจันทร์')
        .setFooter({ text: `สัปดาห์ ${cur}` }).setTimestamp()
      ]}).catch(() => {});
    }
  }
  return data;
}

// ===== LOG =====
async function sendLog(guild, embed) {
  try {
    const ch = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME && c.isTextBased());
    if (ch) await ch.send({ embeds: [embed] });
  } catch {}
}
function mkLog(color, title, fields) {
  return new EmbedBuilder().setColor(color).setTitle(title).addFields(fields).setTimestamp();
}

// ===== FORMAT =====
function ft(m, s) { return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

// ===== TICKET EMBED =====
function ticketEmbed(t) {
  const filled = t.members.length;
  const statusMap = { open: '🟢 OPEN', full: '🔒 FULL', completed: '✅ DONE', closed: '🔴 CLOSED' };
  const memberList = t.members.map(m => `👤 **${m.name}**${m.cls ? ` · ${m.cls}` : ''}`).join('\n')
    + '\n' + Array(Math.max(0, t.partySize - filled)).fill('— ว่าง —').join('\n');

  return new EmbedBuilder()
    .setColor(t.status === 'completed' ? 0x3bc48d : t.status === 'full' ? 0xf0c040 : 0x1a6aff)
    .setTitle(`🎫 ${t.partyName || 'Party'} #${t.id}`)
    .setDescription(`สร้างโดย **${t.creatorName}**`)
    .addFields(
      { name: '👥 Party', value: `${t.partySize} คน`, inline: true },
      { name: '🎯 เป้าหมาย', value: ft(t.targetMins, t.targetSecs), inline: true },
      { name: '📅 วันที่', value: t.runDate, inline: true },
      { name: `📋 สมาชิก (${filled}/${t.partySize})`, value: memberList || '—' },
      { name: '📊 สถานะ', value: statusMap[t.status] || t.status, inline: true },
      ...(t.note ? [{ name: '📝 Note', value: t.note, inline: true }] : []),
    )
    .setFooter({ text: `Where Wind Meet · สัปดาห์ ${t.weekKey}` })
    .setTimestamp();
}

// ===== BUTTONS =====
function ticketButtons(t) {
  if (t.status !== 'open' && t.status !== 'full') return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join_${t.id}`).setLabel('+ เข้าร่วม').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`leave_${t.id}`).setLabel('↩ ออก').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`result_${t.id}`).setLabel('🏁 บันทึกผล').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`close_${t.id}`).setLabel('✕ ปิด').setStyle(ButtonStyle.Danger),
  );
}

// ===== UPDATE TICKET MESSAGE =====
async function updateMsg(ticket) {
  if (!ticket.channelId || !ticket.messageId) return;
  try {
    const ch = await client.channels.fetch(ticket.channelId);
    const msg = await ch.messages.fetch(ticket.messageId);
    const row = ticketButtons(ticket);
    await msg.edit({ embeds: [ticketEmbed(ticket)], components: row ? [row] : [] });
  } catch {}
}

// ===== COMMANDS =====
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;
  const [cmd, ...args] = message.content.trim().slice(1).split(' ');
  let data = loadData();
  data = await checkAndResetWeek(data, message.channel);

  // !create <5|10> <MM:SS> <YYYY-MM-DD> <ชื่อparty> [note]
  if (cmd === 'create') {
    const usage = '❌ ใช้: `!create <5|10> <MM:SS> <YYYY-MM-DD> <ชื่อparty> [note]`\nเช่น: `!create 5 30:00 2026-05-10 SwordTrial ต้องการ healer`';
    if (args.length < 4) return message.reply(usage);
    const partySize = parseInt(args[0]);
    if (![5,10].includes(partySize)) return message.reply('❌ ขนาด Party ต้องเป็น 5 หรือ 10');
    const [tm, ts] = args[1].split(':').map(Number);
    if (isNaN(tm) || isNaN(ts)) return message.reply(usage);
    const runDate = args[2];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) return message.reply('❌ วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD');
    const partyName = args[3].slice(0, 30);
    const note = args.slice(4).join(' ').slice(0, 50);
    const name = message.author.username;
    const id = Date.now().toString().slice(-5);

    const ticket = {
      id, partyName, creatorName: name, creatorId: message.author.id,
      partySize, targetMins: tm, targetSecs: ts, runDate, note,
      members: [], status: 'open', weekKey: data.weekKey,
      createdAt: new Date().toISOString()
    };
    data.tickets.push(ticket);
    saveData(data);

    const row = ticketButtons(ticket);
    const msg = await message.channel.send({ embeds: [ticketEmbed(ticket)], components: row ? [row] : [] });
    ticket.messageId = msg.id;
    ticket.channelId = message.channel.id;
    saveData(data);

    await sendLog(message.guild, mkLog(0x1a6aff, '📋 สร้าง Party ใหม่', [
      { name: 'Party', value: `**${partyName}** #${id}`, inline: true },
      { name: 'ผู้สร้าง', value: name, inline: true },
      { name: 'ขนาด / เป้า / วันที่', value: `${partySize}P · ${ft(tm,ts)} · ${runDate}`, inline: false },
    ]));
    return;
  }

  if (cmd === 'tickets') {
    const sz = args[0] ? parseInt(args[0]) : null;
    const list = data.tickets.filter(t => ['open','full'].includes(t.status) && (!sz || t.partySize === sz));
    if (!list.length) return message.reply('📋 ไม่มี Party ที่เปิดอยู่ ใช้ `!create` เพื่อสร้าง');
    for (const t of list.slice(0,5)) {
      const row = ticketButtons(t);
      await message.channel.send({ embeds: [ticketEmbed(t)], components: row ? [row] : [] });
    }
    return;
  }

  if (cmd === 'leaderboard' || cmd === 'lb') {
    const sz = args[0] ? parseInt(args[0]) : null;
    const medals = ['🥇','🥈','🥉'];
    const filtered = sz ? data.results.filter(r => r.partySize === sz) : data.results;
    const sorted = [...filtered].sort((a,b) => (a.mins*60+a.secs)-(b.mins*60+b.secs));
    const rows = sorted.slice(0,10).map((r,i) =>
      `${medals[i]||`**#${i+1}**`} ${r.beat?'✅':'❌'} \`${ft(r.mins,r.secs)}\` — **${r.runner}** (${r.partySize}P) · ${r.runDate}`
    ).join('\n') || 'ยังไม่มีผล';
    return message.channel.send({ embeds: [new EmbedBuilder().setColor(0xf0c040).setTitle(`🏆 Leaderboard${sz?` — ${sz}P`:''}`).setDescription(rows).setTimestamp()] });
  }

  if (cmd === 'tokens') {
    const entries = Object.entries(data.weekTokens);
    const rows = entries.length
      ? entries.map(([n,u]) => `**${n}** \`${'█'.repeat(u)}${'░'.repeat(Math.max(0,7-u))}\` เหลือ ${Math.max(0,7-u)}/7`).join('\n')
      : 'ยังไม่มีการใช้ Token สัปดาห์นี้';
    return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7ecfff)
      .setTitle(`🪙 Token สัปดาห์ ${data.weekKey}`)
      .setDescription(rows + '\n\n🔄 Token หักเมื่อบันทึกผล · รีเซ็ตทุกวันจันทร์')] });
  }

  if (cmd === 'help') {
    return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7ecfff)
      .setTitle('🌬️ Where Wind Meet — คำสั่ง Bot')
      .addFields(
        { name: '`!create <5|10> <MM:SS> <วันที่> <ชื่อparty> [note]`', value: 'สร้าง Party\nเช่น: `!create 5 30:00 2026-05-10 SwordTrial ต้องการ healer`' },
        { name: '`!tickets [5|10]`', value: 'ดู Party ที่เปิดอยู่' },
        { name: '`!leaderboard [5|10]`', value: 'ดู Leaderboard' },
        { name: '`!tokens`', value: 'ดู Token คงเหลือ' },
        { name: '🔘 ปุ่มใต้ Party', value: '**+ เข้าร่วม** → กรอกชื่อ + อาชีพ (ข้อความ)\n**↩ ออก** → ออกจาก party ได้ตลอด\n**🏁 บันทึกผล** → ใส่เวลา + URL รูป\n**✕ ปิด** → ปิด Party (เฉพาะผู้สร้าง)' },
        { name: `📋 Activity Log`, value: `ดูประวัติทุกกิจกรรมได้ใน **#${LOG_CHANNEL_NAME}**` },
      )
      .setFooter({ text: '🪙 Token หักเมื่อบันทึกผล · รีเซ็ตทุกวันจันทร์ · 7 Token/สัปดาห์' })] });
  }
});

// ===== INTERACTIONS =====
client.on('interactionCreate', async (interaction) => {
  let data = loadData();
  data = await checkAndResetWeek(data, null);

  if (interaction.isButton()) {
    const [action, ticketId] = interaction.customId.split('_');
    const ticket = data.tickets.find(t => t.id === ticketId);
    if (!ticket) return interaction.reply({ content: '❌ ไม่พบ Party นี้', ephemeral: true });

    // JOIN → modal
    if (action === 'join') {
      if (['completed','closed'].includes(ticket.status)) return interaction.reply({ content: '❌ Party ปิดแล้ว', ephemeral: true });
      if (ticket.members.some(m => m.userId === interaction.user.id)) return interaction.reply({ content: '❌ คุณอยู่ใน party นี้แล้ว กด **↩ ออก** ถ้าอยากออก', ephemeral: true });
      if (ticket.members.length >= ticket.partySize) return interaction.reply({ content: '❌ Party เต็มแล้ว', ephemeral: true });

      const modal = new ModalBuilder().setCustomId(`joinmodal_${ticketId}`).setTitle(`เข้าร่วม ${ticket.partyName || 'Party'}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('jname').setLabel('ชื่อ In-game ของคุณ').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('jclass').setLabel('อาชีพ / Build (ไม่บังคับ, ≤50 ตัวอักษร)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50).setPlaceholder('เช่น Warrior Tank, Mage AOE, Healer...')
        ),
      );
      return interaction.showModal(modal);
    }

    // LEAVE
    if (action === 'leave') {
      if (['completed','closed'].includes(ticket.status)) return interaction.reply({ content: '❌ Party ปิดแล้ว', ephemeral: true });
      const idx = ticket.members.findIndex(m => m.userId === interaction.user.id);
      if (idx === -1) return interaction.reply({ content: '❌ คุณไม่ได้อยู่ใน party นี้', ephemeral: true });
      if (ticket.creatorId === interaction.user.id) return interaction.reply({ content: '❌ ผู้สร้างออกไม่ได้ ใช้ **✕ ปิด** แทน', ephemeral: true });
      const { name: ln, cls: lc } = ticket.members[idx];
      ticket.members.splice(idx, 1);
      ticket.status = ticket.members.length >= ticket.partySize ? 'full' : 'open';
      saveData(data);
      await interaction.reply({ content: `↩ **${ln}** ออกจาก **${ticket.partyName || '#'+ticket.id}** แล้ว` });
      await updateMsg(ticket);
      await sendLog(interaction.guild, mkLog(0xf0c040, '↩ ออกจาก Party', [
        { name: 'Party', value: `${ticket.partyName} #${ticket.id}`, inline: true },
        { name: 'ผู้ออก', value: `${ln}${lc ? ` · ${lc}` : ''}`, inline: true },
        { name: 'สมาชิกเหลือ', value: `${ticket.members.length}/${ticket.partySize}`, inline: true },
      ]));
      return;
    }

    // RESULT → modal
    if (action === 'result') {
      const modal = new ModalBuilder().setCustomId(`resultmodal_${ticketId}`).setTitle('🏁 บันทึกผล Speedrun');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('runner').setLabel('ชื่อผู้รายงาน').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel('เวลาที่ทำได้จริง (MM:SS)').setStyle(TextInputStyle.Short).setPlaceholder('25:30').setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imgurl').setLabel('URL รูป Screenshot (ถ้ามี)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://...')),
      );
      return interaction.showModal(modal);
    }

    // CLOSE
    if (action === 'close') {
      if (interaction.user.id !== ticket.creatorId) return interaction.reply({ content: '❌ เฉพาะผู้สร้างเท่านั้นที่ปิดได้', ephemeral: true });
      ticket.status = 'closed';
      saveData(data);
      await interaction.reply({ content: `🔴 Party **${ticket.partyName || '#'+ticket.id}** ปิดแล้ว` });
      await updateMsg(ticket);
      await sendLog(interaction.guild, mkLog(0xe05c5c, '🔴 ปิด Party', [
        { name: 'Party', value: `${ticket.partyName} #${ticket.id}`, inline: true },
        { name: 'ปิดโดย', value: interaction.user.username, inline: true },
        { name: 'สมาชิกตอนปิด', value: `${ticket.members.length}/${ticket.partySize}`, inline: true },
      ]));
      return;
    }
  }

  // JOIN MODAL
  if (interaction.isModalSubmit() && interaction.customId.startsWith('joinmodal_')) {
    const ticketId = interaction.customId.split('_')[1];
    const ticket = data.tickets.find(t => t.id === ticketId);
    if (!ticket) return interaction.reply({ content: '❌ ไม่พบ Party', ephemeral: true });
    if (ticket.members.some(m => m.userId === interaction.user.id)) return interaction.reply({ content: '❌ คุณอยู่ใน party นี้แล้ว', ephemeral: true });
    if (ticket.members.length >= ticket.partySize) return interaction.reply({ content: '❌ Party เต็มแล้ว', ephemeral: true });

    const jname = interaction.fields.getTextInputValue('jname').trim();
    const jclass = interaction.fields.getTextInputValue('jclass').trim().slice(0,50) || null;

    ticket.members.push({ name: jname, cls: jclass, userId: interaction.user.id });
    ticket.status = ticket.members.length >= ticket.partySize ? 'full' : 'open';
    saveData(data);

    await interaction.reply({ content: `✅ **${jname}**${jclass ? ` · ${jclass}` : ''} เข้าร่วม **${ticket.partyName}** แล้ว! (${ticket.members.length}/${ticket.partySize})` });
    await updateMsg(ticket);
    await sendLog(interaction.guild, mkLog(0x3bc48d, '✅ เข้าร่วม Party', [
      { name: 'Party', value: `${ticket.partyName} #${ticket.id}`, inline: true },
      { name: 'ผู้เข้าร่วม', value: `${jname}${jclass ? ` · ${jclass}` : ''}`, inline: true },
      { name: 'สมาชิก', value: `${ticket.members.length}/${ticket.partySize}`, inline: true },
    ]));
    return;
  }

  // RESULT MODAL
  if (interaction.isModalSubmit() && interaction.customId.startsWith('resultmodal_')) {
    const ticketId = interaction.customId.split('_')[1];
    const ticket = data.tickets.find(t => t.id === ticketId);
    if (!ticket) return interaction.reply({ content: '❌ ไม่พบ Party', ephemeral: true });

    const runner = interaction.fields.getTextInputValue('runner');
    const timeStr = interaction.fields.getTextInputValue('time');
    const imgUrl = interaction.fields.getTextInputValue('imgurl') || null;
    const parts = timeStr.split(':');
    if (parts.length !== 2 || isNaN(+parts[0]) || isNaN(+parts[1]))
      return interaction.reply({ content: '❌ รูปแบบเวลาไม่ถูกต้อง ใช้ MM:SS เช่น 25:30', ephemeral: true });

    const mins = parseInt(parts[0]), secs = parseInt(parts[1]);
    const beat = (mins*60+secs) <= (ticket.targetMins*60+ticket.targetSecs);

    data.results.push({ ticketId, partyName: ticket.partyName, runner, mins, secs, imgUrl, beat, partySize: ticket.partySize, targetMins: ticket.targetMins, targetSecs: ticket.targetSecs, runDate: ticket.runDate, submittedAt: new Date().toISOString() });
    ticket.status = 'completed';

    const members = ticket.members || [];
    for (const m of members) data.weekTokens[m.name] = (data.weekTokens[m.name] || 0) + 1;
    saveData(data);

    const tokenSummary = members.length
      ? members.map(m => `**${m.name}**${m.cls ? ` · ${m.cls}` : ''} — เหลือ ${Math.max(0,7-(data.weekTokens[m.name]||0))}/7 🪙`).join('\n')
      : '—';

    const embed = new EmbedBuilder()
      .setColor(beat ? 0x3bc48d : 0xe05c5c)
      .setTitle(`${beat ? '✅ สำเร็จ!' : '❌ ยังไม่ถึงเป้า'} — ${ticket.partyName} #${ticketId}`)
      .addFields(
        { name: '👤 ผู้รายงาน', value: runner, inline: true },
        { name: '⏱️ เวลาจริง', value: `\`${ft(mins,secs)}\``, inline: true },
        { name: '🎯 เวลาเป้า', value: `\`${ft(ticket.targetMins,ticket.targetSecs)}\``, inline: true },
        { name: '📊 ผล', value: beat ? '**ทำได้ตามเป้า!** 🎉' : 'ลองใหม่ได้เลย!' },
        { name: '🪙 Token คงเหลือ', value: tokenSummary },
        { name: '🔄 รีเซ็ต Token', value: 'ทุกวันจันทร์ · 7 Token/สัปดาห์' },
      ).setTimestamp();
    if (imgUrl) embed.setImage(imgUrl);

    await interaction.reply({ embeds: [embed] });
    await updateMsg(ticket);
    await sendLog(interaction.guild, mkLog(beat ? 0x3bc48d : 0xe05c5c, `🏁 บันทึกผล — ${beat ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}`, [
      { name: 'Party', value: `${ticket.partyName} #${ticketId}`, inline: true },
      { name: 'เวลาจริง / เป้า', value: `${ft(mins,secs)} / ${ft(ticket.targetMins,ticket.targetSecs)}`, inline: true },
      { name: 'สมาชิก', value: members.map(m => m.name).join(', ') || '—', inline: false },
    ]));
    return;
  }
});

client.once('ready', () => console.log(`✅ Bot พร้อมใช้งาน: ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
