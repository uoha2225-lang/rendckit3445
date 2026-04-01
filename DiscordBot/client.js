const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, Collection, SlashCommandBuilder,
    REST, Routes, StringSelectMenuBuilder, PermissionFlagsBits,
    ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
    AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const fs   = require('fs');
const tokens  = require('./tokens.js');
const db      = require('./database.js');
const { analyzeMessage } = require('./review-analyzer.js');

/* ═══════════════════════════════════════════════
   عميل عام
   ═══════════════════════════════════════════════ */
const createBotClient = (extraIntents = []) =>
    new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
            ...extraIntents,
        ],
    });

/* ═══════════════════════════════════════════════
   بوت التذاكر
   ═══════════════════════════════════════════════ */
const ticketBot = createBotClient();
ticketBot.commands      = new Collection();
ticketBot.activeTickets = new Collection();
ticketBot.adminRoles    = new Collection();
ticketBot.logChannels   = new Collection();
ticketBot.cooldowns     = new Map();
ticketBot.ticketCounters = new Map();
ticketBot.ticketsByType = new Collection();
ticketBot.ticketRoles   = new Collection();

/* ═══════════════════════════════════════════════
   بوت التقييمات
   ═══════════════════════════════════════════════ */
const reviewBot = createBotClient([GatewayIntentBits.DirectMessages]);
reviewBot.reviewStats    = new Collection();
reviewBot.reviewChannels = new Map(); // { guildId → channelId }

/* ══════════════════════════════════════════════════════
   ثوابت لوحة التذاكر
   ══════════════════════════════════════════════════════ */
const TICKET_EMBED_IMAGE_NAME = 'ticket-embed-unified.webp';
const TICKET_EMBED_IMAGE_PATH = path.join(__dirname, 'assets', TICKET_EMBED_IMAGE_NAME);
const TICKET_EMBED_IMAGE_URL  = `attachment://${TICKET_EMBED_IMAGE_NAME}`;

const createTicketEmbedImageAttachment = () =>
    new AttachmentBuilder(TICKET_EMBED_IMAGE_PATH, { name: TICKET_EMBED_IMAGE_NAME });

/* ── شعار G9 Store للتقييمات ── */
const G9_LOGO_NAME = 'g9-store-logo.png';
const G9_LOGO_PATH = path.join(__dirname, 'assets', G9_LOGO_NAME);
const G9_LOGO_URL  = `attachment://${G9_LOGO_NAME}`;

const hasG9Logo        = () => fs.existsSync(G9_LOGO_PATH);
const createG9LogoAttachment = () =>
    hasG9Logo() ? new AttachmentBuilder(G9_LOGO_PATH, { name: G9_LOGO_NAME }) : null;

const buildTicketMessage = (embed, extra = {}) => ({
    ...extra,
    embeds: [embed],
    files:  [createTicketEmbedImageAttachment()],
});

const isTicketTextCommand = (content = '') => {
    const n = content.trim().toLowerCase();
    return ['تذكرة', '!تذكرة', 'ticket', '!ticket'].includes(n);
};

/* ── سجل التذكرة ── */
const sendTicketLog = async (ticketChannel, closedBy, action) => {
    try {
        const logChannelId = ticketBot.logChannels.get(ticketChannel.guild.id);
        if (!logChannelId) return;
        const logChannel = ticketChannel.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const messages     = await ticketChannel.messages.fetch({ limit: 100 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        let conversation = '';
        sortedMessages.forEach(msg => {
            if (msg.author.bot && msg.embeds.length > 0 && !msg.content) return;
            const ts      = new Date(msg.createdTimestamp).toLocaleString('ar-SA');
            const author  = msg.author.bot ? `[BOT] ${msg.author.username}` : msg.author.username;
            const content = msg.content || (msg.embeds.length > 0 ? '[Embed]' : '[Attachment]');
            conversation += `[${ts}] ${author}: ${content}\n`;
        });
        if (conversation.length > 4000) conversation = conversation.substring(0, 4000) + '\n... (تم القص)';

        const logEmbed = new EmbedBuilder()
            .setTitle('📋 سجل تذكرة')
            .addFields(
                { name: 'اسم التذكرة:',    value: ticketChannel.name,                inline: true  },
                { name: 'الإجراء:',         value: action,                            inline: true  },
                { name: 'تم بواسطة:',       value: `<@${closedBy.id}>`,              inline: true  },
                { name: 'التاريخ والوقت:',  value: new Date().toLocaleString('ar-SA'), inline: false },
                { name: 'المحادثة:',
                  value: conversation.length > 0 ? `\`\`\`\n${conversation}\n\`\`\`` : 'لا توجد رسائل',
                  inline: false }
            )
            .setColor(0xe74c3c)
            .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error('خطأ في إرسال سجل التذكرة:', error);
    }
};

/* ── embeds التذاكر ── */
const createTicketMainEmbed = () =>
    new EmbedBuilder()
        .setTitle('افتح تذكرتك واختار مايناسبك')
        .setDescription('فتح تذكرة من هنا')
        .setImage(TICKET_EMBED_IMAGE_URL)
        .setColor(0x0099ff)
        .setTimestamp();

const createTicketOptionsEmbed = () =>
    new EmbedBuilder()
        .setTitle('فتح تذكرة من هنا')
        .setImage(TICKET_EMBED_IMAGE_URL)
        .setColor(0x0099ff);

const createTicketEmbed = (ticketType, ticketNumber, user, guild) => {
    const adminRoleIds = [
        process.env.TICKET_ADMIN_ROLE_ID_1,
        process.env.TICKET_ADMIN_ROLE_ID_2,
    ].filter(id => id && id.length > 0);

    const adminRolesMention = adminRoleIds.length > 0
        ? adminRoleIds.map(id => `<@&${id}>`).join(' ')
        : 'مسؤول عن النقل';

    return new EmbedBuilder()
        .setAuthor({ name: `👤 | مالك التذكرة: ${user.username}`, iconURL: TICKET_EMBED_IMAGE_URL })
        .addFields(
            { name: '🛡️ | مشرفي التذاكر',  value: adminRolesMention, inline: true  },
            { name: '📅 | تاريخ التذكرة',    value: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true }), inline: false },
            { name: '❓ | قسم التذكرة',      value: `\` ${ticketType} \``, inline: true },
            { name: '🔢 | رقم التذكرة',      value: `\` ${ticketNumber} \``, inline: true },
        )
        .setColor(0x0099ff)
        .setImage(TICKET_EMBED_IMAGE_URL)
        .setThumbnail(TICKET_EMBED_IMAGE_URL)
        .setTimestamp();
};

const createTicketMainButton = () =>
    new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_ticket_menu').setLabel('فتح تذكرة من هنا').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );

const createTicketOptionsButtons = () => {
    const select = new StringSelectMenuBuilder()
        .setCustomId('ticket_type_select')
        .setPlaceholder('اختر فئة التذكرة')
        .addOptions([
            { label: 'شراء منتج من المتجر', value: 'ticket_buy_product', emoji: '🛒' },
            { label: 'استفسار',              value: 'ticket_inquiry',      emoji: '❓' },
            { label: 'طلب دعم فني',          value: 'ticket_tech_support', emoji: '🛠️' },
        ]);
    return [new ActionRowBuilder().addComponents(select)];
};

const createTicketAdminOptionsEmbed = () =>
    new EmbedBuilder()
        .setTitle('⚙️ إدارة التذكرة')
        .setDescription('اختر خيارًا من القائمة المنسدلة أدناه •')
        .setColor(0x0099ff);

const createTicketAdminOptionsRow = () => {
    const select = new StringSelectMenuBuilder()
        .setCustomId('ticket_admin_options_select')
        .setPlaceholder('اختر خيارًا للتذكرة')
        .addOptions([
            { label: 'إلغاء المطالبة',         description: 'إلغاء المطالبة بالتذكرة',       value: 'admin_unclaim',       emoji: '❌' },
            { label: 'إغلاق بسبب',             description: 'إغلاق التذكرة بسبب محدد',      value: 'admin_close_reason',  emoji: '🔒' },
            { label: 'إضافة شخص للتذكرة',      description: 'إضافة شخص إلى هذه التذكرة',    value: 'admin_add_member',    emoji: '👥' },
            { label: 'تذكير العضو',             description: 'إرسال تنبيه للعضو في الخاص',   value: 'admin_remind_member', emoji: '📧' },
            { label: 'طلب نسخة من التذكرة',    description: 'طلب نسخة من التذكرة في الخاص', value: 'admin_transcript',    emoji: '📄' },
        ]);
    return new ActionRowBuilder().addComponents(select);
};

const createTicketManageButtons = () =>
    new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام').setStyle(ButtonStyle.Primary).setEmoji('💼'),
        new ButtonBuilder().setCustomId('ticket_admin_options').setLabel('خيارات التذكرة').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
    );

/* ══════════════════════════════════════════════════════
   أوامر Slash
   ══════════════════════════════════════════════════════ */
const ticketCommands = [
    new SlashCommandBuilder().setName('تذكرة').setDescription('فتح نظام التذاكر'),
    new SlashCommandBuilder().setName('ticket').setDescription('Open the ticket system'),
    new SlashCommandBuilder().setName('help').setDescription('عرض قائمة الأوامر'),
    new SlashCommandBuilder()
        .setName('سجلات_التذاكر').setDescription('تحديد روم سجلات التذاكر')
        .addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true)),
];

const reviewCommands = [
    /* ── أوامر التقييم الأساسية ── */
    new SlashCommandBuilder()
        .setName('تقييم').setDescription('إرسال تقييم')
        .addIntegerOption(opt => opt.setName('rating').setDescription('النجوم').setRequired(true).setMinValue(1).setMaxValue(5)),

    new SlashCommandBuilder()
        .setName('اختيار_روم_تقييم').setDescription('تحديد روم التقييمات الذكي (يُحلّل الرسائل ويحذفها تلقائياً)')
        .addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('ارسل_لوحة_التقييمات').setDescription('إرسال لوحة تقييمات بأزرار النجوم'),

    /* ── إدارة التقييمات ── */
    new SlashCommandBuilder()
        .setName('إحصائيات_التقييمات').setDescription('عرض إحصائيات وتقارير التقييمات')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('مسح_التقييمات').setDescription('مسح جميع التقييمات المخزنة في هذا السيرفر')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('إعدادات_التقييم').setDescription('ضبط معايير نظام التقييم الذكي والخصوصية')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];

/* ══════════════════════════════════════════════════════
   تسجيل الأوامر
   ══════════════════════════════════════════════════════ */
async function registerCommands(bot, token, commands) {
    if (!token || !bot.user) return;
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(bot.user.id), { body: commands.map(c => c.toJSON()) });
        console.log(`✅ Registered commands for ${bot.user.tag}`);
    } catch (e) {
        console.error('خطأ في تسجيل الأوامر:', e);
    }
}

ticketBot.once('ready', async () => {
    console.log(`Ticket Bot Ready: ${ticketBot.user.tag}`);
    await registerCommands(ticketBot, tokens.REMINDER_BOT_TOKEN, ticketCommands);
});

reviewBot.once('ready', async () => {
    console.log(`Review Bot Ready: ${reviewBot.user.tag}`);
    await registerCommands(reviewBot, tokens.REVIEW_BOT_TOKEN, reviewCommands);
});

/* ══════════════════════════════════════════════════════
   مُساعِدات لوحة الإعدادات
   ══════════════════════════════════════════════════════ */
function buildSettingsComponents(settings) {
    const on  = '✅';
    const off = '❌';

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rev_setting_anonymize')
            .setLabel(`${settings.anonymize ? on : off} إخفاء الهوية`)
            .setStyle(settings.anonymize ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('rev_setting_notify')
            .setLabel(`${settings.notifyUser ? on : off} تنبيه DM`)
            .setStyle(settings.notifyUser ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('rev_setting_storetext')
            .setLabel(`${settings.storeOriginalText ? on : off} حفظ النص`)
            .setStyle(settings.storeOriginalText ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );

    const confOptions = [
        { label: 'منخفض جداً  (10%)',  value: '0.1', description: 'قبول كل الرسائل تقريباً' },
        { label: 'منخفض  (30%)',        value: '0.3', description: 'قبول معظم التقييمات'      },
        { label: 'متوسط  (50%)',         value: '0.5', description: 'توازن دقة / شمولية'        },
        { label: 'عالٍ  (70%)',          value: '0.7', description: 'تقييمات واضحة فقط'         },
        { label: 'عالٍ جداً  (90%)',    value: '0.9', description: 'أرقام مباشرة فقط'           },
    ].map(o => ({ ...o, default: Math.abs(parseFloat(o.value) - settings.minConfidence) < 0.05 }));

    const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('rev_setting_confidence')
            .setPlaceholder(`الحد الأدنى للثقة: ${(settings.minConfidence * 100).toFixed(0)}%`)
            .addOptions(confOptions),
    );

    return [row1, row2];
}

function buildSettingsEmbed(settings) {
    return new EmbedBuilder()
        .setTitle('⚙️ إعدادات نظام التقييم الذكي')
        .setDescription('اضغط الأزرار أو اختر من القائمة لتعديل الإعدادات')
        .addFields(
            { name: '🔒 إخفاء هوية المستخدم',   value: settings.anonymize          ? '✅ مفعّل' : '❌ معطّل', inline: true },
            { name: '🔔 تنبيه المستخدم (DM)',    value: settings.notifyUser         ? '✅ مفعّل' : '❌ معطّل', inline: true },
            { name: '📝 حفظ النص الأصلي',        value: settings.storeOriginalText  ? '✅ مفعّل' : '❌ معطّل', inline: true },
            { name: '🎯 الحد الأدنى للثقة',      value: `${(settings.minConfidence * 100).toFixed(0)}%`, inline: true },
        )
        .setColor(0x5865f2)
        .setFooter({ text: 'إعدادات التقييم الذكي — G9 Store' })
        .setTimestamp();
}

/* ── إرسال / تحديث embed الإعدادات ── */
async function replySettings(interaction, isUpdate = false) {
    const settings = db.getSettings(interaction.guildId);
    const payload  = {
        embeds:     [buildSettingsEmbed(settings)],
        components: buildSettingsComponents(settings),
        ephemeral:  true,
    };
    return isUpdate ? interaction.update(payload) : interaction.reply(payload);
}

/* ══════════════════════════════════════════════════════
   بناء Embed التقييم الدائم (يُستخدم في كل مسارات التقييم)
   - اليسار: اسم المقيِّم + صورته الشخصية (setAuthor)
   - اليمين: شعار G9 Store (setThumbnail)
   ══════════════════════════════════════════════════════ */
const buildReviewEmbed = ({ displayName, userAvatarURL, rating, comment, logoURL, timestamp }) => {
    const stars      = '⭐'.repeat(rating);
    const embedColor = rating >= 4 ? 0x1ABC9C
                     : rating === 3 ? 0xF39C12
                     :                0xE74C3C;

    const embed = new EmbedBuilder()
        .setAuthor({ name: displayName, iconURL: userAvatarURL })
        .setTitle('⭐ تقييم الخدمة')
        .setColor(embedColor)
        .setTimestamp(timestamp ? new Date(timestamp) : new Date());

    if (comment && comment !== 'بدون تعليق' && comment !== null) {
        embed.setDescription(comment);
    }

    const emptyStars  = '☆'.repeat(5 - rating);
    embed.addFields({ name: `التقييم  ·  ${rating}/5`, value: `${stars}${emptyStars}`, inline: false });

    if (logoURL) {
        embed.setThumbnail(logoURL);
        embed.setFooter({ text: 'شكراً لتقييمك ❤️', iconURL: logoURL });
    } else {
        embed.setFooter({ text: 'شكراً لتقييمك ❤️' });
    }

    return embed;
};

/**
 * يبني رسالة Discord جاهزة للإرسال تحتوي على Embed التقييم
 *ويُرفق ملف شعار G9 Store تلقائياً إن كان موجوداً
 */
const buildReviewMessage = ({ displayName, userAvatarURL, rating, comment, fallbackLogoURL, timestamp }) => {
    const logoAttachment = createG9LogoAttachment();
    const logoURL        = logoAttachment ? G9_LOGO_URL : (fallbackLogoURL || '');
    const embed          = buildReviewEmbed({ displayName, userAvatarURL, rating, comment, logoURL, timestamp });
    const msg            = { embeds: [embed] };
    if (logoAttachment) msg.files = [logoAttachment];
    return msg;
};

/* ══════════════════════════════════════════════════════
   مُساعِد إرسال التقييم (Modal → روم التقييمات)
   ══════════════════════════════════════════════════════ */
const submitReview = async (interaction, rating, comment) => {
    const guildId   = interaction.guildId;
    const channelId = reviewBot.reviewChannels.get(guildId);

    if (!channelId) {
        return interaction.reply({ content: '❌ لم يتم تحديد روم التقييمات. استخدم `/اختيار_روم_تقييم` أولاً.', ephemeral: true });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        return interaction.reply({ content: '❌ روم التقييمات غير موجود أو تم حذفه.', ephemeral: true });
    }

    const stars    = '⭐'.repeat(rating);
    const settings = db.getSettings(guildId);

    /* ── الاسم الكامل (الاسم المعروض في السيرفر أو الاسم العام) ── */
    const displayName   = settings.anonymize ? 'مجهول'
                        : (interaction.member?.displayName || interaction.user.displayName || interaction.user.username);

    /* ── صور المستخدم مع صور احتياطية ── */
    const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(interaction.user.id) % 6n)}.png`;
    const userAvatarURL = settings.anonymize ? defaultAvatar
                        : (interaction.user.displayAvatarURL({ dynamic: true, size: 256 }) || defaultAvatar);

    /* ── حفظ في قاعدة البيانات (بدون messageId مؤقتاً) ── */
    const saved = db.saveReview({
        guildId,
        userId:       settings.anonymize ? 'anonymous' : interaction.user.id,
        username:     settings.anonymize ? 'مجهول'     : interaction.user.username,
        displayName,
        channelId,
        rating,
        originalText: settings.storeOriginalText ? (comment || null) : null,
        confidence:   1.0,
        category:     rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative',
        avatarURL:    settings.anonymize ? null : userAvatarURL,
    });

    /* ── بناء وإرسال Embed التقييم الدائم ── */
    const guildIconURL = interaction.guild?.iconURL({ dynamic: true, size: 256 }) || '';
    const reviewMsg = await channel.send(
        buildReviewMessage({ displayName, userAvatarURL, rating, comment, fallbackLogoURL: guildIconURL })
    ).catch(() => null);

    /* ── تخزين messageId في قاعدة البيانات للحماية من الحذف ── */
    if (reviewMsg) {
        db.updateReviewMessage(saved.id, reviewMsg.id);
        await reviewMsg.react('✅').catch(() => {});
    }

    /* ── تنبيه DM إن كان الإعداد مفعّلاً ── */
    if (settings.notifyUser && interaction.user.id !== 'anonymous') {
        const catLabel = rating >= 4 ? '😊 إيجابي' : rating === 3 ? '😐 محايد' : '😞 سلبي';
        const dmEmbed  = new EmbedBuilder()
            .setTitle('✅ تم إرسال تقييمك بنجاح')
            .setDescription(`شكراً لمشاركتك في **${interaction.guild.name}**!`)
            .addFields(
                { name: '⭐ تقييمك',    value: `${rating}/5  ${stars}`, inline: true },
                { name: '📊 التصنيف',   value: catLabel,                inline: true },
            )
            .setColor(rating >= 4 ? 0x1ABC9C : rating === 3 ? 0xF39C12 : 0xE74C3C)
            .setFooter({ text: '© G9 Store' })
            .setTimestamp();
        await interaction.user.send({ embeds: [dmEmbed] }).catch(() => {});
    }

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setDescription(`✅ شكراً **${displayName}**! تم إرسال تقييمك ${stars} بنجاح.`)
            .setColor(0x1ABC9C)],
        ephemeral: true,
    });
};

/* ══════════════════════════════════════════════════════
   مُساعِد: شريط التوزيع في الإحصائيات
   ══════════════════════════════════════════════════════ */
const ratingBar = (count, total) => {
    const pct    = total > 0 ? count / total : 0;
    const filled = Math.round(pct * 10);
    return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.round(pct * 100)}% (${count})`;
};

/* ══════════════════════════════════════════════════════
   خريطة تكرار التفاعلات (anti-spam)
   ══════════════════════════════════════════════════════ */
const processedInteractions = new Map();
const processedInteractionsGcInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, t] of processedInteractions) if (now - t > 60000) processedInteractions.delete(id);
}, 60000);
processedInteractionsGcInterval.unref?.();

/* ══════════════════════════════════════════════════════════════════════════
   ██████████████████  بوت التذاكر — تفاعلات  ██████████████████
   ══════════════════════════════════════════════════════════════════════════ */
ticketBot.on('interactionCreate', async interaction => {
    if (processedInteractions.has(interaction.id)) return;
    processedInteractions.set(interaction.id, Date.now());

    try {
        /* ── Modal ── */
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'close_ticket_reason_modal') {
                const reason = interaction.fields.getTextInputValue('close_reason_input');
                await interaction.reply({ content: `🔒 يتم إغلاق التذكرة بسبب: ${reason}` });
                await sendTicketLog(interaction.channel, interaction.user, `إغلاق التذكرة (السبب: ${reason})`);
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

        /* ── Buttons ── */
        if (interaction.isButton()) {
            if (interaction.customId === 'open_ticket_menu') {
                await interaction.deferReply({ ephemeral: true });
                return interaction.editReply(buildTicketMessage(createTicketOptionsEmbed(), { components: createTicketOptionsButtons() }));
            }

            const adminRoleIds = [process.env.TICKET_ADMIN_ROLE_ID_1, process.env.TICKET_ADMIN_ROLE_ID_2].filter(Boolean);
            const isAdmin = interaction.member.roles.cache.some(r => adminRoleIds.includes(r.id))
                || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

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

        /* ── Select Menus ── */
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_type_select') {
                const type = interaction.values[0];
                const typeNames = {
                    ticket_buy_product: 'شراء منتج من المتجر',
                    ticket_inquiry:     'استفسار',
                    ticket_tech_support:'طلب دعم فني',
                };
                await interaction.deferReply({ ephemeral: true });

                let counter = (ticketBot.ticketCounters.get(interaction.guildId) || 0) + 1;
                ticketBot.ticketCounters.set(interaction.guildId, counter);

                const categoryId = process.env.TICKET_CATEGORY_ID || tokens.TICKET_CATEGORY_ID;
                const channel = await interaction.guild.channels.create({
                    name: `🎫・${counter}`,
                    type: ChannelType.GuildText,
                    parent: categoryId || null,
                    topic: `Owner: ${interaction.user.id}`,
                    permissionOverwrites: [
                        { id: interaction.guild.id,  deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: ticketBot.user.id,     allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
                    ],
                });

                const adminRoleIds = [process.env.TICKET_ADMIN_ROLE_ID_1, process.env.TICKET_ADMIN_ROLE_ID_2].filter(Boolean);
                for (const rId of adminRoleIds) await channel.permissionOverwrites.edit(rId, { ViewChannel: true, SendMessages: true });

                await channel.send(buildTicketMessage(createTicketEmbed(typeNames[type], counter, interaction.user, interaction.guild), {
                    content: `<@${interaction.user.id}> | فريق الدعم`,
                    components: [createTicketManageButtons()],
                }));

                await sendTicketLog(channel, interaction.user, `فتح تذكرة (${typeNames[type]})`);
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
                    m.addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('close_reason_input').setLabel('السبب').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    return interaction.showModal(m);
                }
                if (opt === 'admin_add_member') {
                    const m = new ModalBuilder().setCustomId('add_member_modal').setTitle('إضافة عضو');
                    m.addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('member_id_input').setLabel('معرف العضو (ID) أو منشن').setStyle(TextInputStyle.Short).setRequired(true)));
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
                    const msgs    = await interaction.channel.messages.fetch({ limit: 100 });
                    const content = msgs.map(m => `${m.author.tag}: ${m.content}`).reverse().join('\n');
                    await interaction.user.send({ content: `📄 نسخة تذكرة: ${interaction.channel.name}`, files: [{ attachment: Buffer.from(content), name: 'transcript.txt' }] }).catch(() => {});
                    return interaction.reply({ content: '✅ أرسلت للخاص.', ephemeral: true });
                }
            }
        }

        /* ── Slash Commands ── */
        if (interaction.isChatInputCommand()) {
            const { commandName: cmd } = interaction;
            if (cmd === 'تذكرة' || cmd === 'ticket')
                return interaction.reply(buildTicketMessage(createTicketMainEmbed(), { components: createTicketOptionsButtons() }));
            if (cmd === 'سجلات_التذاكر') {
                const channel = interaction.options.getChannel('channel');
                ticketBot.logChannels.set(interaction.guildId, channel.id);
                return interaction.reply({ content: `✅ تم تحديد روم السجلات: ${channel}`, ephemeral: true });
            }
        }
    } catch (error) {
        console.error('خطأ في معالجة تفاعل التذاكر:', error);
        const msg = '❌ حدث خطأ:\n```JS\n' + (error.message || error) + '\n```';
        if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
        else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
});

/* ── أوامر التذاكر النصية ── */
ticketBot.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!isTicketTextCommand(message.content)) return;
    try {
        await message.channel.send(buildTicketMessage(createTicketMainEmbed(), { components: createTicketOptionsButtons() }));
    } catch (error) {
        console.error('خطأ في أمر التذكرة النصي:', error);
        await message.reply(`❌ خطأ: \`${error.message || error}\``).catch(() => {});
    }
});

/* ══════════════════════════════════════════════════════════════════════════
   ██████████████████  بوت التقييمات — تفاعلات  ██████████████████
   ══════════════════════════════════════════════════════════════════════════ */
reviewBot.on('interactionCreate', async interaction => {
    try {
        /* ═══ Slash Commands ═══ */
        if (interaction.isChatInputCommand()) {
            const { commandName: cmd } = interaction;

            /* ── تحديد روم التقييم ── */
            if (cmd === 'اختيار_روم_تقييم') {
                const channel = interaction.options.getChannel('channel');
                reviewBot.reviewChannels.set(interaction.guildId, channel.id);
                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setDescription(`✅ تم بنجاح تحديد روم التقييمات: ${channel}\n\n📌 سيتم **حذف جميع الرسائل** الواردة في هذا الروم وتحليلها كتقييمات فورية.`)
                        .setColor(0x2ecc71)],
                    ephemeral: true,
                });
            }

            /* ── إرسال لوحة التقييمات ── */
            if (cmd === 'ارسل_لوحة_التقييمات') {
                const botAvatarURL = interaction.client.user?.displayAvatarURL({ dynamic: true, size: 256 })
                                  || interaction.guild.iconURL({ dynamic: true });
                const embed = new EmbedBuilder()
                    .setTitle('⭐ قيم تجربتك معنا فى G9 Store')
                    .setDescription('رأيك يهمنا ويساعدنا على التحسن دائماً.\nفضلاً قم باختيار عدد النجوم التى تعبر عن تجربتك:')
                    .setColor(0x1ABC9C)
                    .setThumbnail(botAvatarURL)
                    .setFooter({ text: '© G9 Store', iconURL: botAvatarURL })
                    .setTimestamp();

                const buttons = new ActionRowBuilder().addComponents(
                    [1, 2, 3, 4, 5].map(r =>
                        new ButtonBuilder()
                            .setCustomId(`confirm_review_${r}`)
                            .setLabel(`${r} ⭐`)
                            .setStyle(ButtonStyle.Secondary)
                    )
                );
                return interaction.reply({ embeds: [embed], components: [buttons] });
            }

            /* ── تقييم بالأمر ── */
            if (cmd === 'تقييم' || cmd === 'review') {
                const rating = interaction.options.getInteger('rating');
                const modal  = new ModalBuilder()
                    .setCustomId(`review_modal_${rating}`)
                    .setTitle(`إرسال تقييم ${rating} نجوم`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('comment_input')
                        .setLabel('اكتب تعليقك هنا')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('رأيك يهمنا...')
                        .setRequired(false)
                ));
                return interaction.showModal(modal);
            }

            /* ══════════════════════════════════
               أوامر الإدارة
               ══════════════════════════════════ */

            /* ── إحصائيات ── */
            if (cmd === 'إحصائيات_التقييمات') {
                const stats = db.getGuildStats(interaction.guildId);

                if (!stats) {
                    return interaction.reply({ content: '📊 لا توجد تقييمات مسجّلة بعد في هذا السيرفر.', ephemeral: true });
                }

                const avgStars   = Math.round(stats.average);
                const starFull   = '⭐'.repeat(Math.max(0, avgStars));
                const starEmpty  = '☆'.repeat(Math.max(0, 5 - avgStars));

                const statsBotAvatar = interaction.client.user?.displayAvatarURL({ dynamic: true, size: 256 })
                                    || interaction.guild.iconURL({ dynamic: true });
                const statsEmbed = new EmbedBuilder()
                    .setTitle('📊 إحصائيات التقييمات — G9 Store')
                    .setDescription(`**متوسط التقييم:** ${stats.average.toFixed(2)} / 5   ${starFull}${starEmpty}`)
                    .addFields(
                        { name: '📈 إجمالي التقييمات', value: `**${stats.total}**`,                                  inline: true },
                        { name: '😊 إيجابي',            value: `**${stats.categories.positive || 0}**`,              inline: true },
                        { name: '😐 محايد',             value: `**${stats.categories.neutral  || 0}**`,              inline: true },
                        { name: '😞 سلبي',              value: `**${stats.categories.negative || 0}**`,              inline: true },
                        { name: '\u200B', value: '\u200B' }, // فاصل
                        { name: '⭐⭐⭐⭐⭐  5 نجوم', value: ratingBar(stats.distribution[5] || 0, stats.total), inline: false },
                        { name: '⭐⭐⭐⭐    4 نجوم', value: ratingBar(stats.distribution[4] || 0, stats.total), inline: false },
                        { name: '⭐⭐⭐      3 نجوم', value: ratingBar(stats.distribution[3] || 0, stats.total), inline: false },
                        { name: '⭐⭐        2 نجوم', value: ratingBar(stats.distribution[2] || 0, stats.total), inline: false },
                        { name: '⭐          1 نجمة', value: ratingBar(stats.distribution[1] || 0, stats.total), inline: false },
                    )
                    .setColor(0x1ABC9C)
                    .setThumbnail(statsBotAvatar)
                    .setFooter({ text: '© G9 Store — آخر تحديث', iconURL: statsBotAvatar })
                    .setTimestamp();

                /* أحدث التقييمات */
                if (stats.recent.length > 0) {
                    const recentText = stats.recent.map(r => {
                        const s    = '⭐'.repeat(r.rating);
                        const user = r.username || 'مجهول';
                        const date = new Date(r.timestamp).toLocaleDateString('ar-SA');
                        return `${s} **${user}** — *${r.originalText ? r.originalText.substring(0, 40) : 'بدون نص'}* (${date})`;
                    }).join('\n');
                    statsEmbed.addFields({ name: '🕐 آخر التقييمات', value: recentText, inline: false });
                }

                return interaction.reply({ embeds: [statsEmbed] });
            }

            /* ── مسح التقييمات ── */
            if (cmd === 'مسح_التقييمات') {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('rev_confirm_clear').setLabel('تأكيد المسح').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('rev_cancel_clear').setLabel('إلغاء').setStyle(ButtonStyle.Secondary),
                );
                return interaction.reply({
                    content: '⚠️ هل أنت متأكد من مسح **جميع** التقييمات المخزنة؟ لا يمكن التراجع عن هذه العملية.',
                    components: [row],
                    ephemeral: true,
                });
            }

            /* ── إعدادات ── */
            if (cmd === 'إعدادات_التقييم') {
                return replySettings(interaction, false);
            }
        }

        /* ═══ Modal Submits ═══ */
        if (interaction.isModalSubmit() && interaction.customId.startsWith('review_modal_')) {
            const rating  = parseInt(interaction.customId.split('_').pop(), 10);
            const comment = interaction.fields.getTextInputValue('comment_input') || 'بدون تعليق';
            return await submitReview(interaction, rating, comment);
        }

        /* ═══ Buttons ═══ */
        if (interaction.isButton()) {

            /* لوحة التقييمات بالنجوم → modal */
            if (interaction.customId.startsWith('confirm_review_')) {
                const rating = parseInt(interaction.customId.split('_').pop(), 10);
                const modal  = new ModalBuilder()
                    .setCustomId(`review_modal_${rating}`)
                    .setTitle(`إرسال تقييم ${rating} نجوم`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('comment_input')
                        .setLabel('اكتب تعليقك هنا')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('رأيك يهمنا...')
                        .setRequired(false)
                ));
                return interaction.showModal(modal);
            }

            /* تأكيد مسح التقييمات */
            if (interaction.customId === 'rev_confirm_clear') {
                const count = db.clearGuildReviews(interaction.guildId);
                return interaction.update({ content: `✅ تم مسح **${count}** تقييم بنجاح.`, components: [] });
            }
            if (interaction.customId === 'rev_cancel_clear') {
                return interaction.update({ content: '❌ تم إلغاء عملية المسح.', components: [] });
            }

            /* أزرار الإعدادات */
            if (interaction.customId === 'rev_setting_anonymize') {
                const s = db.getSettings(interaction.guildId);
                db.saveSettings(interaction.guildId, { anonymize: !s.anonymize });
                return replySettings(interaction, true);
            }
            if (interaction.customId === 'rev_setting_notify') {
                const s = db.getSettings(interaction.guildId);
                db.saveSettings(interaction.guildId, { notifyUser: !s.notifyUser });
                return replySettings(interaction, true);
            }
            if (interaction.customId === 'rev_setting_storetext') {
                const s = db.getSettings(interaction.guildId);
                db.saveSettings(interaction.guildId, { storeOriginalText: !s.storeOriginalText });
                return replySettings(interaction, true);
            }
        }

        /* ═══ Select Menus ═══ */
        if (interaction.isStringSelectMenu()) {
            /* قائمة اختيار درجة الثقة */
            if (interaction.customId === 'rev_setting_confidence') {
                const confidence = parseFloat(interaction.values[0]);
                db.saveSettings(interaction.guildId, { minConfidence: confidence });
                return replySettings(interaction, true);
            }
        }

    } catch (error) {
        console.error('خطأ في بوت التقييمات:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ حدث خطأ داخلي.', ephemeral: true }).catch(() => {});
        }
    }
});

/* ══════════════════════════════════════════════════════════════════════════
   ██████  نظام التقييم الذكي — تحليل الرسائل وتحويلها لتقييمات  ██████
   ══════════════════════════════════════════════════════════════════════════ */
reviewBot.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const guildId       = message.guildId;
    const reviewChId    = reviewBot.reviewChannels.get(guildId);

    /* ════════════════════════════════════════════════════
       الروم المحدد للتقييمات:
       حلّل الرسالة → خزّنها → أرسل Embed التقييم
       (الرسالة الأصلية تبقى في الروم ولا تُحذف)
       ════════════════════════════════════════════════════ */
    if (reviewChId && message.channelId === reviewChId) {

        /* 1. تحليل لغوي */
        const analysis = analyzeMessage(message.content);
        const settings = db.getSettings(guildId);

        /* 2. معلومات المرسل */
        const senderName      = settings.anonymize ? 'مجهول'
            : (message.member?.displayName || message.author.displayName || message.author.username);
        const senderAvatarURL = settings.anonymize
            ? `https://cdn.discordapp.com/embed/avatars/0.png`
            : message.author.displayAvatarURL({ dynamic: true, size: 256 });

        /* 3. حفظ في قاعدة البيانات إذا تجاوز الحد الأدنى للثقة */
        let saved = null;
        if (analysis.rating !== null && analysis.confidence >= settings.minConfidence) {
            saved = db.saveReview({
                guildId,
                userId:       settings.anonymize ? 'anonymous' : message.author.id,
                username:     settings.anonymize ? 'مجهول'     : message.author.username,
                displayName:  senderName,
                channelId:    message.channelId,
                rating:       analysis.rating,
                originalText: settings.storeOriginalText ? message.content : null,
                confidence:   analysis.confidence,
                category:     analysis.category,
                avatarURL:    settings.anonymize ? null : senderAvatarURL,
            });

            /* 3a. إرسال DM للمستخدم إن كان الإعداد مفعّلاً */
            if (settings.notifyUser) {
                const stars = '⭐'.repeat(analysis.rating);
                const catLabel = analysis.category === 'positive' ? '😊 إيجابي'
                               : analysis.category === 'neutral'  ? '😐 محايد'
                               :                                    '😞 سلبي';
                const dmBotAvatar = message.client.user?.displayAvatarURL({ dynamic: true, size: 256 }) || undefined;
                const dmColor = analysis.category === 'positive' ? 0x1ABC9C
                              : analysis.category === 'neutral'  ? 0xF39C12
                              :                                    0xE74C3C;
                const dmEmbed = new EmbedBuilder()
                    .setTitle('✅ تم تسجيل تقييمك بنجاح')
                    .setDescription(`شكراً لمشاركتك في **${message.guild.name}**!`)
                    .addFields(
                        { name: '⭐ تقييمك',      value: `${analysis.rating}/5  ${stars}`,     inline: true  },
                        { name: '📊 التصنيف',     value: catLabel,                              inline: true  },
                        { name: '🎯 درجة الثقة', value: `${(analysis.confidence * 100).toFixed(0)}%`, inline: true },
                    )
                    .setColor(dmColor)
                    .setFooter({ text: '© G9 Store — نظام التقييم الذكي', ...(dmBotAvatar && { iconURL: dmBotAvatar }) })
                    .setTimestamp();
                await message.author.send({ embeds: [dmEmbed] }).catch(() => {}); // DM قد يكون مغلقاً
            }
        }

        /* 4. إرسال Embed التقييم — دائماً لكل رسالة في روم التقييمات */
        if (analysis.rating !== null && saved) {
            /* ── تقييم بنجوم تم تسجيله → Embed دائم مع النجوم ── */
            const guildIconFallback = message.guild?.iconURL({ dynamic: true, size: 256 }) || '';
            const permanentMsg = await message.channel.send(
                buildReviewMessage({
                    displayName:     senderName,
                    userAvatarURL:   senderAvatarURL,
                    rating:          analysis.rating,
                    comment:         settings.storeOriginalText ? message.content : null,
                    fallbackLogoURL: guildIconFallback,
                })
            ).catch(() => null);
            if (permanentMsg) {
                db.updateReviewMessage(saved.id, permanentMsg.id);
                await message.react('✅').catch(() => {});
            }

        } else {
            /* ── لم يُتعرَّف على نجوم → اعرض نص الشخص كـ Embed تعليق دائم ── */
            const logoAttachment  = createG9LogoAttachment();
            const guildIconFB     = message.guild?.iconURL({ dynamic: true, size: 256 }) || '';
            const logoURL         = logoAttachment ? G9_LOGO_URL : (guildIconFB || undefined);

            const feedbackEmbed = new EmbedBuilder()
                .setAuthor({ name: senderName, iconURL: senderAvatarURL })
                .setTitle('⭐ تقييم الخدمة')
                .setDescription(message.content)
                .setColor(0x1ABC9C)
                .setTimestamp();

            if (logoURL) {
                feedbackEmbed.setThumbnail(logoURL);
                feedbackEmbed.setFooter({ text: 'شكراً لتعليقك ❤️', iconURL: logoURL });
            } else {
                feedbackEmbed.setFooter({ text: 'شكراً لتعليقك ❤️' });
            }

            const feedbackMsg = { embeds: [feedbackEmbed] };
            if (logoAttachment) feedbackMsg.files = [logoAttachment];

            await message.channel.send(feedbackMsg).catch(() => null);
        }

        return; // انتهى المعالجة لرسائل روم التقييم
    }

    /* ════════════════════════════════════════════════════
       خارج روم التقييمات: الكشف الكلاسيكي بالكلمات المفتاحية
       (يقترح إرسال تقييم دون حذف الرسالة)
       ════════════════════════════════════════════════════ */
    const content = message.content.trim();
    const analysis = analyzeMessage(content);

    if (analysis.rating !== null && analysis.confidence >= 0.5) {
        const suggestBotAvatar = message.client.user?.displayAvatarURL({ dynamic: true, size: 256 })
                               || message.guild.iconURL({ dynamic: true });
        const suggestUserAvatar = message.author.displayAvatarURL({ dynamic: true, size: 64 });
        const suggestName = message.member?.displayName || message.author.displayName || message.author.username;
        const suggestStars = '⭐'.repeat(analysis.rating);
        const suggestColor = analysis.rating >= 4 ? 0x1ABC9C : analysis.rating === 3 ? 0xF39C12 : 0xE74C3C;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_review_${analysis.rating}`)
                .setLabel(`إرسال تقييم ${analysis.rating} نجوم ⭐`)
                .setStyle(ButtonStyle.Success)
        );

        const embed = new EmbedBuilder()
            .setAuthor({ name: suggestName, iconURL: suggestUserAvatar })
            .setTitle('تقييم الخدمة')
            .setDescription(
                `**"${content.length > 60 ? content.substring(0, 60) + '...' : content}"**\n\n` +
                `${suggestStars}\n\nهل تود إرسال هذا التقييم **${analysis.rating}/5** للمتجر؟`
            )
            .setColor(suggestColor)
            .setThumbnail(suggestBotAvatar)
            .setFooter({ text: '© G9 Store', iconURL: suggestBotAvatar });

        await message.reply({ embeds: [embed], components: [row] }).catch(() => {});
    }
});

/* ══════════════════════════════════════════════════════════════════════════
   ██████  حماية Embeds التقييمات من الحذف — إعادة الإنشاء فوراً  ██████
   ══════════════════════════════════════════════════════════════════════════ */
reviewBot.on('messageDelete', async message => {
    if (!message.guildId) return;

    /* تحقق من أن الرسالة المحذوفة كانت في روم التقييمات */
    const reviewChId = reviewBot.reviewChannels.get(message.guildId);
    if (!reviewChId || message.channelId !== reviewChId) return;

    /* ابحث عن التقييم المرتبط بهذه الرسالة */
    const review = db.getReviewByMessageId(message.id);
    if (!review) return;

    /* احصل على القناة */
    const channel = message.channel
                 || message.client.channels.cache.get(message.channelId)
                 || await message.client.channels.fetch(message.channelId).catch(() => null);
    if (!channel) return;

    /* أعد بناء الـ Embed من بيانات قاعدة البيانات باستخدام شعار G9 Store المحلي */
    const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/0.png`;
    const guildIconRebuild = channel?.guild?.iconURL({ dynamic: true, size: 256 }) || '';
    const newMsg = await channel.send(
        buildReviewMessage({
            displayName:     review.displayName || review.username || 'مجهول',
            userAvatarURL:   review.avatarURL || defaultAvatar,
            rating:          review.rating,
            comment:         review.originalText,
            timestamp:       review.timestamp,
            fallbackLogoURL: guildIconRebuild,
        })
    ).catch(() => null);

    if (newMsg) {
        db.updateReviewMessage(review.id, newMsg.id);
        await newMsg.react('✅').catch(() => {});
    }
});

module.exports = {
    ticketBot,
    reviewBot,
    __ticketEmbedTestables: {
        createTicketMainEmbed,
        createTicketOptionsEmbed,
        createTicketEmbed,
        buildTicketMessage,
        TICKET_EMBED_IMAGE_NAME,
        TICKET_EMBED_IMAGE_URL,
    },
};
