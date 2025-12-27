const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, SlashCommandBuilder, REST, Routes, StringSelectMenuBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const tokens = require('./tokens.js');

// إعداد العميل للبوتات
const createBotClient = (intents = []) => {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
            ...intents
        ]
    });
};

// بوت التذاكر (Tickets)
const ticketBot = createBotClient();
ticketBot.commands = new Collection();
ticketBot.activeTickets = new Collection();
ticketBot.adminRoles = new Collection(); // لحفظ رتب مشرفين التذاكر
ticketBot.logChannels = new Collection(); // لحفظ رومز سجلات التذاكر
ticketBot.cooldowns = new Map(); // لمنع الضغط المتكرر
ticketBot.ticketCounters = new Map(); // عداد التذاكر لكل سيرفر
ticketBot.ticketsByType = new Collection(); // لحفظ التذاكر حسب النوع {guildId: {ticketType: [tickets]}}
ticketBot.ticketRoles = new Collection(); // لحفظ رتب كل نوع تذكرة {guildId: {ticketType: [roleIds]}}

// بوت التقييمات
const reviewBot = createBotClient();
reviewBot.reviewStats = new Collection();
reviewBot.reviewChannels = new Map(); // {guildId: Set<channelId>}

// دالة إرسال سجلات التذاكر
const sendTicketLog = async (ticketChannel, closedBy, action) => {
    try {
        const guildId = ticketChannel.guild.id;
        const logChannelId = ticketBot.logChannels.get(guildId);
        
        if (!logChannelId) return; 
        
        const logChannel = ticketChannel.guild.channels.cache.get(logChannelId);
        if (!logChannel) return; 
        
        const messages = await ticketChannel.messages.fetch({ limit: 50 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        let conversation = '';
        sortedMessages.forEach(msg => {
            if (msg.author.bot && msg.embeds.length > 0) return;
            const timestamp = new Date(msg.createdTimestamp).toLocaleString('ar-SA');
            conversation += `[${timestamp}] ${msg.author.username}: ${msg.content || '[مرفق/embed]'}\n`;
        });
        
        if (conversation.length > 4000) {
            conversation = conversation.substring(0, 4000) + '\n... (تم قص الرسائل الطويلة)';
        }
        
        const logEmbed = new EmbedBuilder()
            .setTitle('📋 سجل تذكرة')
            .addFields(
                { name: 'اسم التذكرة:', value: ticketChannel.name, inline: true },
                { name: 'الإجراء:', value: action, inline: true },
                { name: 'تم بواسطة:', value: `<@${closedBy.id}>`, inline: true },
                { name: 'التاريخ والوقت:', value: new Date().toLocaleString('ar-SA'), inline: false },
                { name: 'المحادثة:', value: conversation.length > 0 ? `\`\`\`\n${conversation}\n\`\`\`` : 'لا توجد رسائل', inline: false }
            )
            .setColor(0xe74c3c)
            .setTimestamp();
        
        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error('خطأ في إرسال سجل التذكرة:', error);
    }
};

const createTicketMainEmbed = () => {
    return new EmbedBuilder()
        .setTitle('افتح تذكرتك واختار مايناسبك')
        .setDescription('فتح تذكرة من هنا')
        .setImage('https://cdn.discordapp.com/attachments/1454263579330084970/1454461889567526913/IMG_1134.png')
        .setColor(0x0099ff)
        .setTimestamp();
};

const createTicketOptionsEmbed = () => {
    return new EmbedBuilder()
        .setTitle('فتح تذكرة من هنا')
        .setImage('https://cdn.discordapp.com/attachments/1454263579330084970/1454461889567526913/IMG_1134.png')
        .setColor(0x0099ff);
};

const createTicketEmbed = (ticketType, ticketNumber, user, guild) => {
    const adminRoleIds = ticketBot.adminRoles.get(guild.id) || [];
    const adminRolesMention = adminRoleIds.length > 0 
        ? adminRoleIds.map(id => `<@&${id}>`).join(' ') 
        : 'مسؤول عن النقل';

    return new EmbedBuilder()
        .setAuthor({ 
            name: `👤 | مالك التذكرة: ${user.username}`, 
            iconURL: user.displayAvatarURL({ dynamic: true }) 
        })
        .addFields(
            { name: '🛡️ | مشرفي التذاكر', value: adminRolesMention, inline: true },
            { name: '📅 | تاريخ التذكرة', value: new Date().toLocaleString('en-US', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
                hour: 'numeric', minute: 'numeric', hour12: true 
            }), inline: false },
            { name: '❓ | قسم التذكرة', value: `\` ${ticketType} \``, inline: true },
            { name: '🔢 | رقم التذكرة', value: `\` ${ticketNumber} \``, inline: true }
        )
        .setColor(0x0099ff)
        .setImage('https://cdn.discordapp.com/attachments/1454263579330084970/1454461889567526913/IMG_1134.png')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
};

const createTicketMainButton = () => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_ticket_menu').setLabel('فتح تذكرة من هنا').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );
};

const createTicketOptionsButtons = () => {
    const select = new StringSelectMenuBuilder()
        .setCustomId('ticket_type_select')
        .setPlaceholder('اختر فئة التذكرة')
        .addOptions([
            { label: 'النقل الاداري', value: 'ticket_admin_transfer', emoji: '⚙️' },
            { label: 'النقل العسكري', value: 'ticket_military_transfer', emoji: '⚔️' },
            { label: 'استرجاع الرتب', value: 'ticket_rank_restore', emoji: '✈️' },
            { label: 'نقل رتب بنات', value: 'ticket_girls_transfer', emoji: '💖' },
        ]);
    return [new ActionRowBuilder().addComponents(select)];
};

const createTicketAdminOptionsEmbed = () => {
    return new EmbedBuilder()
        .setTitle('⚙️ إدارة التذكرة')
        .setDescription('اختر خيارًا من القائمة المنسدلة أدناه •')
        .setColor(0x0099ff);
};

const createTicketAdminOptionsRow = () => {
    const select = new StringSelectMenuBuilder()
        .setCustomId('ticket_admin_options_select')
        .setPlaceholder('اختر خيارًا للتذكرة')
        .addOptions([
            { label: 'إلغاء المطالبة', description: 'إلغاء المطالبة بالتذكرة', value: 'admin_unclaim', emoji: '❌' },
            { label: 'إغلاق بسبب', description: 'إغلاق التذكرة بسبب محدد', value: 'admin_close_reason', emoji: '🔒' },
            { label: 'إضافة شخص للتذكرة', description: 'إضافة شخص إلى هذه التذكرة', value: 'admin_add_member', emoji: '👥' },
            { label: 'تذكير العضو', description: 'إرسال تنبيه للعضو في الخاص', value: 'admin_remind_member', emoji: '📧' },
            { label: 'طلب نسخة من التذكرة', description: 'طلب نسخة من التذكرة في الخاص', value: 'admin_transcript', emoji: '📄' },
        ]);
    return new ActionRowBuilder().addComponents(select);
};

const createTicketManageButtons = () => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام').setStyle(ButtonStyle.Primary).setEmoji('💼'),
        new ButtonBuilder().setCustomId('ticket_admin_options').setLabel('خيارات التذكرة').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );
};

const ticketCommands = [
    new SlashCommandBuilder().setName('تذكرة').setDescription('فتح نظام التذاكر'),
    new SlashCommandBuilder().setName('ticket').setDescription('Open the ticket system'),
    new SlashCommandBuilder().setName('help').setDescription('عرض قائمة الأوامر'),
    new SlashCommandBuilder().setName('مشرفين_التذاكر').setDescription('إدارة رتب مشرفين التذاكر')
        .addStringOption(opt => opt.setName('action').setDescription('إضافة أو إزالة').setRequired(true).addChoices({ name: 'إضافة', value: 'add' }, { name: 'إزالة', value: 'remove' }, { name: 'عرض', value: 'list' }))
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة')),
    new SlashCommandBuilder().setName('سجلات_التذاكر').setDescription('تحديد روم سجلات التذاكر').addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
];

const reviewCommands = [
    new SlashCommandBuilder().setName('تقييم').setDescription('إرسال تقييم').addIntegerOption(opt => opt.setName('rating').setDescription('النجوم').setRequired(true).setMinValue(1).setMaxValue(5)),
    new SlashCommandBuilder().setName('اختيار_روم_تقييم').setDescription('اختيار روم التقييمات').addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
];

async function registerCommands(bot, token, commands) {
    if (!token || !bot.user) return;
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(bot.user.id), { body: commands });
        console.log(`✅ Registered commands for ${bot.user.tag}`);
    } catch (e) { console.error(e); }
}

ticketBot.once('ready', async () => {
    console.log(`Ticket Bot Ready: ${ticketBot.user.tag}`);
    await registerCommands(ticketBot, tokens.REMINDER_BOT_TOKEN, ticketCommands);
});

reviewBot.once('ready', async () => {
    console.log(`Review Bot Ready: ${reviewBot.user.tag}`);
    await registerCommands(reviewBot, tokens.REVIEW_BOT_TOKEN, reviewCommands);
});

const processedInteractions = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [id, time] of processedInteractions) if (now - time > 60000) processedInteractions.delete(id);
}, 60000);

ticketBot.on('interactionCreate', async interaction => {
    if (processedInteractions.has(interaction.id)) return;
    processedInteractions.set(interaction.id, Date.now());

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'close_ticket_reason_modal') {
            const reason = interaction.fields.getTextInputValue('close_reason_input');
            await interaction.reply({ content: `🔒 يتم إغلاق التذكرة بسبب: ${reason}` });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        } else if (interaction.customId === 'add_member_modal') {
            const memberId = interaction.fields.getTextInputValue('member_id_input').replace(/[<@!>]/g, '');
            try {
                const member = await interaction.guild.members.fetch(memberId);
                await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
                await interaction.reply({ content: `✅ تم إضافة ${member.user.username} إلى التذكرة.` });
            } catch { await interaction.reply({ content: '❌ عضو غير موجود.', ephemeral: true }); }
        }
        return;
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'open_ticket_menu') {
            return interaction.reply({ embeds: [createTicketOptionsEmbed()], components: createTicketOptionsButtons(), ephemeral: true });
        }
        
        const adminRoles = ticketBot.adminRoles.get(interaction.guildId) || [];
        const isAdmin = interaction.member.roles.cache.some(r => adminRoles.includes(r.id)) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (interaction.customId === 'claim_ticket') {
            if (!isAdmin) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
            await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true });
            return interaction.reply({ content: `✅ تم استلام التذكرة بواسطة ${interaction.user}.` });
        }

        if (interaction.customId === 'ticket_admin_options') {
            if (!isAdmin) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
            return interaction.reply({ embeds: [createTicketAdminOptionsEmbed()], components: [createTicketAdminOptionsRow()], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_type_select') {
            const type = interaction.values[0];
            const typeNames = { 
                ticket_admin_transfer: 'النقل الاداري', 
                ticket_military_transfer: 'النقل العسكري', 
                ticket_rank_restore: 'استرجاع الرتب', 
                ticket_girls_transfer: 'نقل رتب بنات' 
            };
            await interaction.deferReply({ ephemeral: true });
            
            let counter = (ticketBot.ticketCounters.get(interaction.guildId) || 0) + 1;
            ticketBot.ticketCounters.set(interaction.guildId, counter);

            const channel = await interaction.guild.channels.create({
                name: `🎫・${counter}`,
                type: ChannelType.GuildText,
                topic: `Owner: ${interaction.user.id}`,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: ticketBot.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
                ]
            });
            
            const adminRoles = ticketBot.adminRoles.get(interaction.guildId) || [];
            for (const rId of adminRoles) await channel.permissionOverwrites.edit(rId, { ViewChannel: true, SendMessages: true });

            await channel.send({ content: `<@${interaction.user.id}> | فريق الدعم`, embeds: [createTicketEmbed(typeNames[type], counter, interaction.user, interaction.guild)], components: [createTicketManageButtons()] });
            return interaction.editReply(`تم فتح تذكرتك: ${channel}`);
        }

        if (interaction.customId === 'ticket_admin_options_select') {
            const opt = interaction.values[0];
            if (opt === 'admin_unclaim') {
                await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: null });
                return interaction.reply({ content: '✅ تم إلغاء المطالبة.' });
            }
            if (opt === 'admin_close_reason') {
                const m = new ModalBuilder().setCustomId('close_ticket_reason_modal').setTitle('سبب الإغلاق');
                m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason_input').setLabel('السبب').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                return interaction.showModal(m);
            }
            if (opt === 'admin_add_member') {
                const m = new ModalBuilder().setCustomId('add_member_modal').setTitle('إضافة عضو');
                m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('member_id_input').setLabel('المعرف').setStyle(TextInputStyle.Short).setRequired(true)));
                return interaction.showModal(m);
            }
            if (opt === 'admin_remind_member') {
                const ownerId = interaction.channel.topic?.split('Owner: ')[1];
                if (ownerId) {
                    const owner = await interaction.guild.members.fetch(ownerId).catch(() => null);
                    if (owner) await owner.send(`🔔 تذكير بتذكرتك في **${interaction.guild.name}**: <#${interaction.channel.id}>`).catch(() => {});
                    return interaction.reply({ content: '✅ تم التذكير.', ephemeral: true });
                }
            }
            if (opt === 'admin_transcript') {
                const msgs = await interaction.channel.messages.fetch({ limit: 100 });
                const content = msgs.map(m => `${m.author.tag}: ${m.content}`).reverse().join('\n');
                await interaction.user.send({ content: `📄 نسخة تذكرة: ${interaction.channel.name}`, files: [{ attachment: Buffer.from(content), name: 'transcript.txt' }] }).catch(() => {});
                return interaction.reply({ content: '✅ أرسلت للخاص.', ephemeral: true });
            }
        }
    }

    if (interaction.isChatInputCommand()) {
        const { commandName: cmd } = interaction;
        if (cmd === 'تذكرة' || cmd === 'ticket') {
            return interaction.reply({ embeds: [createTicketMainEmbed()], components: [createTicketMainButton()] });
        }
        if (cmd === 'مشرفين_التذاكر') {
            const act = interaction.options.getString('action');
            const role = interaction.options.getRole('role');
            let roles = ticketBot.adminRoles.get(interaction.guildId) || [];
            if (act === 'add') {
                if (roles.length >= 5) return interaction.reply({ content: '❌ الحد الأقصى 5.', ephemeral: true });
                if (role && !roles.includes(role.id)) roles.push(role.id);
            } else if (act === 'remove' && role) {
                roles = roles.filter(id => id !== role.id);
            }
            ticketBot.adminRoles.set(interaction.guildId, roles);
            return interaction.reply({ content: `✅ تم التحديث. القائمة: ${roles.map(id => `<@&${id}>`).join(', ') || 'خالية'}`, ephemeral: true });
        }
    }
});

module.exports = { ticketBot, reviewBot };
