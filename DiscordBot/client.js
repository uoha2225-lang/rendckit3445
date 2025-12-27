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

// بوت مراقبة النشاط - يتم استيراده في index.js منفصلاً

// دالة إرسال سجلات التذاكر
const sendTicketLog = async (ticketChannel, closedBy, action) => {
    try {
        const guildId = ticketChannel.guild.id;
        const logChannelId = ticketBot.logChannels.get(guildId);
        
        if (!logChannelId) return; // لا يوجد روم سجلات محدد
        
        const logChannel = ticketChannel.guild.channels.cache.get(logChannelId);
        if (!logChannel) return; // روم السجلات غير موجود
        
        // جمع آخر 50 رسالة من التذكرة
        const messages = await ticketChannel.messages.fetch({ limit: 50 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        // إنشاء ملخص المحادثة
        let conversation = '';
        sortedMessages.forEach(msg => {
            if (msg.author.bot && msg.embeds.length > 0) {
                // تخطي رسائل البوت مع embeds
                return;
            }
            const timestamp = new Date(msg.createdTimestamp).toLocaleString('ar-SA');
            conversation += `[${timestamp}] ${msg.author.username}: ${msg.content || '[مرفق/embed]'}\n`;
        });
        
        // قص المحادثة إذا كانت طويلة جداً
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

// وظائف مساعدة للتذاكر
const createTicketMainEmbed = () => {
    return new EmbedBuilder()
        .setTitle('افتح تذكرتك واختار مايناسبك')
        .setDescription('فتح تذكرة من هنا')
        .setImage('https://cdn.discordapp.com/attachments/1454263579330084970/1454461889567526913/IMG_1134.png?ex=69512cb1&is=694fdb31&hm=728a486cae7e848bcc286aa4e3fd37a00ca374d423ad4f2bde1272a945798dc6&')
        .setColor(0x0099ff)
        .setTimestamp();
};

const createTicketOptionsEmbed = () => {
    return new EmbedBuilder()
        .setTitle('فتح تذكرة من هنا')
        .setImage('https://cdn.discordapp.com/attachments/1454263579330084970/1454461889567526913/IMG_1134.png?ex=69512cb1&is=694fdb31&hm=728a486cae7e848bcc286aa4e3fd37a00ca374d423ad4f2bde1272a945798dc6&')
        .setColor(0x0099ff);
};

const createTicketEmbed = (ticketType, ticketNumber, user, guild) => {
    // جلب رتب مشرفين التذاكر (إذا تم تحديدها)
    const adminRoleIds = ticketBot.adminRoles.get(guild.id) || [];
    const adminRolesMention = adminRoleIds.length > 0 
        ? adminRoleIds.map(id => `<@&${id}>`).join(' ') 
        : 'مسؤول عن النقل';

    const embed = new EmbedBuilder()
        .setAuthor({ 
            name: `👤 | مالك التذكرة: ${user.username}`, 
            iconURL: user.displayAvatarURL({ dynamic: true }) 
        })
        .addFields(
            { name: '🛡️ | مشرفي التذاكر', value: adminRolesMention, inline: true },
            { name: '📅 | تاريخ التذكرة', value: new Date().toLocaleString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: 'numeric', 
                hour12: true 
            }), inline: false },
            { name: '❓ | قسم التذكرة', value: `\` ${ticketType} \``, inline: true },
            { name: '🔢 | رقم التذكرة', value: `\` ${ticketNumber} \``, inline: true }
        )
        .setColor(0x0099ff)
        .setImage('https://cdn.discordapp.com/attachments/1454263579330084970/1454461889567526913/IMG_1134.png?ex=69512cb1&is=694fdb31&hm=728a486cae7e848bcc286aa4e3fd37a00ca374d423ad4f2bde1272a945798dc6&')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
    
    return embed;
};

// وظائف مساعدة للتقييمات
const createReviewEmbed = (rating, reviewerUser, reviewId, reviewCount) => {
    const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
    const currentDate = new Date().toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    return new EmbedBuilder()
        .setTitle('شكرًا على التقييم!')
        .addFields(
            { name: 'رسالة التقييم:', value: 'تم', inline: false },
            { name: 'التقييم:', value: stars, inline: false },
            { name: 'رقم التقييم:', value: reviewId.toString(), inline: false },
            { name: 'المقيم:', value: `<@${reviewerUser.id}>`, inline: false },
            { name: 'تاريخ التقييم:', value: currentDate, inline: false }
        )
        .setColor(0x00AE86)
        .setFooter({ 
            text: 'جميع الحقوق محفوظة © The North City', 
            iconURL: 'https://cdn.discordapp.com/attachments/your-attachment-url/nify-logo.png' 
        });
};

// إنشاء embed تقييم مع النص الأصلي
const createReviewEmbedWithText = (rating, reviewerUser, reviewId, reviewCount, originalText) => {
    const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
    const currentDate = new Date().toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    return new EmbedBuilder()
        .setTitle('شكرًا على التقييم!')
        .addFields(
            { name: 'رسالة التقييم:', value: originalText || 'تم', inline: false },
            { name: 'التقييم:', value: stars, inline: false },
            { name: 'رقم التقييم:', value: reviewId.toString(), inline: false },
            { name: 'المقيم:', value: `<@${reviewerUser.id}>`, inline: false },
            { name: 'تاريخ التقييم:', value: currentDate, inline: false }
        )
        .setColor(0x00AE86)
        .setFooter({ 
            text: 'جميع الحقوق محفوظة © The North City', 
            iconURL: 'https://cdn.discordapp.com/attachments/your-attachment-url/nify-logo.png' 
        });
};

// إنشاء الأزرار
const createTicketMainButton = () => {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket_menu')
                .setLabel('فتح تذكرة من هنا')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );
    return row;
};

const createTicketOptionsButtons = () => {
    const select = new StringSelectMenuBuilder()
        .setCustomId('ticket_type_select')
        .setPlaceholder('اختر فئة التذكرة')
        .addOptions([
            {
                label: 'النقل الاداري',
                value: 'ticket_admin_transfer',
                emoji: '⚙️',
            },
            {
                label: 'النقل العسكري',
                value: 'ticket_military_transfer',
                emoji: '⚔️',
            },
            {
                label: 'استرجاع الرتب',
                value: 'ticket_rank_restore',
                emoji: '✈️',
            },
            {
                label: 'نقل رتب بنات',
                value: 'ticket_girls_transfer',
                emoji: '👑',
            },
        ]);

    const row = new ActionRowBuilder().addComponents(select);
    return [row];
};

// إنشاء embed خيارات التذكرة للإدارة
const createTicketAdminOptionsEmbed = () => {
    return new EmbedBuilder()
        .setTitle('⚙️ إدارة التذكرة')
        .setDescription('اختر خيارًا من القائمة المنسدلة أدناه •')
        .setColor(0x0099ff);
};

// إنشاء قائمة خيارات الإدارة
const createTicketAdminOptionsRow = () => {
    const select = new StringSelectMenuBuilder()
        .setCustomId('ticket_admin_options_select')
        .setPlaceholder('اختر خيارًا للتذكرة')
        .addOptions([
            {
                label: 'إلغاء المطالبة',
                description: 'إلغاء المطالبة بالتذكرة',
                value: 'admin_unclaim',
                emoji: '❌',
            },
            {
                label: 'إغلاق بسبب',
                description: 'إغلاق التذكرة بسبب محدد',
                value: 'admin_close_reason',
                emoji: '🔒',
            },
            {
                label: 'إضافة شخص للتذكرة',
                description: 'إضافة شخص إلى هذه التذكرة',
                value: 'admin_add_member',
                emoji: '👥',
            },
            {
                label: 'تذكير العضو',
                description: 'إرسال تنبيه للعضو في الخاص',
                value: 'admin_remind_member',
                emoji: '📧',
            },
            {
                label: 'طلب نسخة من التذكرة',
                description: 'طلب نسخة من التذكرة في الخاص',
                value: 'admin_transcript',
                emoji: '📄',
            },
        ]);

    return new ActionRowBuilder().addComponents(select);
};

// إنشاء أزرار إدارة التذاكر
const createTicketManageButtons = () => {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('استلام')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💼'),
            new ButtonBuilder()
                .setCustomId('ticket_admin_options')
                .setLabel('خيارات التذكرة')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚙️')
        );
    return row;
};

// إعداد slash commands للتذاكر
const ticketCommands = [
    new SlashCommandBuilder()
        .setName('تذكرة')
        .setDescription('فتح نظام التذاكر مع الأزرار التفاعلية'),
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Open the ticket system with interactive buttons'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('عرض قائمة الأوامر المتاحة')
        .setDescriptionLocalizations({
            'en-US': 'Show available commands list'
        }),
    new SlashCommandBuilder()
        .setName('مشرفين_التذاكر')
        .setDescription('إضافة أو إزالة رتب مشرفين التذاكر')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('إضافة أو إزالة رتبة')
                .setRequired(true)
                .addChoices(
                    { name: 'إضافة', value: 'add' },
                    { name: 'إزالة', value: 'remove' },
                    { name: 'عرض القائمة', value: 'list' }
                )
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('الرتبة المراد إضافتها أو إزالتها')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('ticket_admins')
        .setDescription('Add or remove ticket admin roles')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Add or remove role')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' },
                    { name: 'List', value: 'list' }
                )
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to add or remove')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('سجلات_التذاكر')
        .setDescription('تحديد روم سجلات التذاكر')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الروم الذي سيتم إرسال سجلات التذاكر فيه')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('ticket_logs')
        .setDescription('Set the channel for ticket logs')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where ticket logs will be sent')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('ربط_الرتب_بالتذاكر')
        .setDescription('ربط رتب محددة بأنواع تذاكر محددة')
        .addStringOption(option =>
            option.setName('ticket_type')
                .setDescription('نوع التذكرة')
                .setRequired(true)
                .addChoices(
                    { name: 'النقل الاداري', value: 'admin_transfer' },
                    { name: 'النقل العسكري', value: 'military_transfer' },
                    { name: 'استفسار', value: 'inquiry' },
                    { name: 'شكوى على اداري', value: 'admin_complaint' }
                )
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription('إضافة أو إزالة رتبة')
                .setRequired(true)
                .addChoices(
                    { name: 'إضافة', value: 'add' },
                    { name: 'إزالة', value: 'remove' },
                    { name: 'عرض القائمة', value: 'list' }
                )
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('الرتبة (مطلوب للإضافة والحذف)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('ticket_role_assign')
        .setDescription('Assign roles to specific ticket types')
        .addStringOption(option =>
            option.setName('ticket_type')
                .setDescription('Ticket type')
                .setRequired(true)
                .addChoices(
                    { name: 'Admin Transfer', value: 'admin_transfer' },
                    { name: 'Military Transfer', value: 'military_transfer' },
                    { name: 'Inquiry', value: 'inquiry' },
                    { name: 'Admin Complaint', value: 'admin_complaint' }
                )
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Add or remove role')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' },
                    { name: 'List', value: 'list' }
                )
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role (required for add and remove)')
                .setRequired(false)
        )
];

// إعداد slash commands للتقييمات
const reviewCommands = [
    new SlashCommandBuilder()
        .setName('تقييم')
        .setDescription('إرسال تقييم بالنجوم')
        .addIntegerOption(option =>
            option.setName('rating')
                .setDescription('التقييم من 1 إلى 5 نجوم')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5)
        ),
    new SlashCommandBuilder()
        .setName('review')
        .setDescription('Send a star rating')
        .addIntegerOption(option =>
            option.setName('rating')
                .setDescription('Rating from 1 to 5 stars')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5)
        ),
    new SlashCommandBuilder()
        .setName('اختيار_روم_تقييم')
        .setDescription('اختيار الروم المخصص للتقييمات')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الروم الذي سيتم تحويل الرسائل فيه إلى تقييمات')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('set_review_room')
        .setDescription('Set the room for automatic reviews')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where messages will be converted to reviews')
                .setRequired(true)
        )
];

// تسجيل slash commands للتذاكر (للعمل في جميع السيرفرات)
async function registerTicketCommands() {
    try {
        if (tokens.REMINDER_BOT_TOKEN && ticketBot.user) {
            const rest = new REST({ version: '10' }).setToken(tokens.REMINDER_BOT_TOKEN);
            
            console.log('بدء تسجيل slash commands للتذاكر...');
            
            // تسجيل الأوامر عالمياً
            await rest.put(
                Routes.applicationCommands(ticketBot.user.id),
                { body: ticketCommands }
            );
            
            // تسجيل الأوامر لكل سيرفر موجود (لظهور فوري)
            const guilds = ticketBot.guilds.cache;
            for (const [guildId, guild] of guilds) {
                try {
                    await rest.put(
                        Routes.applicationGuildCommands(ticketBot.user.id, guildId),
                        { body: ticketCommands }
                    );
                    console.log(`✅ تم تسجيل slash commands للتذاكر في ${guild.name}`);
                } catch (guildError) {
                    console.error(`خطأ في تسجيل commands لسيرفر ${guild.name}:`, guildError.message);
                }
            }
            
            console.log('✅ تم تسجيل slash commands للتذاكر بنجاح');
        }
    } catch (error) {
        console.error('خطأ في تسجيل slash commands للتذاكر:', error);
    }
}

// تسجيل slash commands للتقييمات (للعمل في جميع السيرفرات)
async function registerReviewCommands() {
    try {
        if (tokens.REVIEW_BOT_TOKEN && reviewBot.user) {
            const rest = new REST({ version: '10' }).setToken(tokens.REVIEW_BOT_TOKEN);
            
            console.log('بدء تسجيل slash commands للتقييمات...');
            
            // تسجيل الأوامر عالمياً
            await rest.put(
                Routes.applicationCommands(reviewBot.user.id),
                { body: reviewCommands }
            );
            
            // تسجيل الأوامر لكل سيرفر موجود (لظهور فوري)
            const guilds = reviewBot.guilds.cache;
            for (const [guildId, guild] of guilds) {
                try {
                    await rest.put(
                        Routes.applicationGuildCommands(reviewBot.user.id, guildId),
                        { body: reviewCommands }
                    );
                    console.log(`✅ تم تسجيل slash commands للتقييمات في ${guild.name}`);
                } catch (guildError) {
                    console.error(`خطأ في تسجيل commands لسيرفر ${guild.name}:`, guildError.message);
                }
            }
            
            console.log('✅ تم تسجيل slash commands للتقييمات بنجاح');
        }
    } catch (error) {
        console.error('خطأ في تسجيل slash commands للتقييمات:', error);
    }
}

// بوت التذاكر
ticketBot.once('clientReady', async () => {
    console.log(`بوت التذاكر جاهز! مسجل باسم ${ticketBot.user.tag}`);
    await registerTicketCommands();
});

// معالجة slash commands للتذاكر
// منع معالجة interactions متعددة  
const processedInteractions = new Map();

// تنظيف المعرفات القديمة كل دقيقة
setInterval(() => {
    const oneMinuteAgo = Date.now() - 60000;
    for (const [interactionId, timestamp] of processedInteractions.entries()) {
        if (timestamp < oneMinuteAgo) {
            processedInteractions.delete(interactionId);
        }
    }
}, 60000);

ticketBot.on('interactionCreate', async (interaction) => {
    // منع معالجة نفس interaction
    if (processedInteractions.has(interaction.id) || interaction.replied || interaction.deferred) {
        return;
    }
    
    processedInteractions.set(interaction.id, Date.now());
    
    // معالجة المودال (Modals)
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'close_ticket_reason_modal') {
            const reason = interaction.fields.getTextInputValue('close_reason_input');
            await interaction.reply({ content: `🔒 يتم إغلاق التذكرة بسبب: ${reason}` });
            setTimeout(() => {
                if (interaction.channel) interaction.channel.delete().catch(() => {});
            }, 5000);
        }
        
        if (interaction.customId === 'add_member_modal') {
            const memberId = interaction.fields.getTextInputValue('member_id_input').replace(/[<@!>]/g, '');
            try {
                const member = await interaction.guild.members.fetch(memberId);
                await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
                await interaction.reply({ content: `✅ تم إضافة ${member.user.username} إلى التذكرة.` });
            } catch (err) {
                await interaction.reply({ content: '❌ تعذر العثور على العضو، تأكد من الـ ID الصحيح.', ephemeral: true });
            }
        }
        return;
    }

    // تسجيل التفاعل للتشخيص
    console.log('🔔 تفاعل جديد:', {
        type: interaction.type,
        customId: interaction.customId || 'N/A',
        commandName: interaction.commandName || 'N/A',
        user: interaction.user.username,
        guild: interaction.guild?.name || 'DM'
    });

    // معالجة اختيار خيارات الإدارة
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_admin_options_select') {
        const selectedOption = interaction.values[0];
        const channel = interaction.channel;
        
        const adminRoleIds = ticketBot.adminRoles.get(interaction.guildId) || [];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoleIds.includes(role.id)) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!hasAdminRole) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام خيارات الإدارة.', ephemeral: true });
        }

        switch (selectedOption) {
            case 'admin_unclaim':
                await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: null });
                await interaction.reply({ content: '✅ تم إلغاء المطالبة بالتذكرة.' });
                break;
            case 'admin_close_reason':
                const modal = new ModalBuilder().setCustomId('close_ticket_reason_modal').setTitle('إغلاق التذكرة لسبب');
                const reasonInput = new TextInputBuilder().setCustomId('close_reason_input').setLabel('سبب الإغلاق').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                await interaction.showModal(modal);
                break;
            case 'admin_add_member':
                const addMemberModal = new ModalBuilder().setCustomId('add_member_modal').setTitle('إضافة عضو للتذكرة');
                const memberInput = new TextInputBuilder().setCustomId('member_id_input').setLabel('معرف العضو (ID) أو منشن').setStyle(TextInputStyle.Short).setRequired(true);
                addMemberModal.addComponents(new ActionRowBuilder().addComponents(memberInput));
                await interaction.showModal(addMemberModal);
                break;
            case 'admin_remind_member':
                try {
                    const ticketOwnerId = channel.topic?.split(': ')[1];
                    if (ticketOwnerId) {
                        const owner = await interaction.guild.members.fetch(ticketOwnerId);
                        await owner.send(`🔔 تذكير: تذكرتك المفتوحة في **${interaction.guild.name}** بانتظار ردك في <#${channel.id}>`).catch(() => {});
                        await interaction.reply({ content: '✅ تم إرسال تذكير للعضو في الخاص.', ephemeral: true });
                    } else {
                        await interaction.reply({ content: '❌ لم يتم العثور على مالك التذكرة.', ephemeral: true });
                    }
                } catch (err) {
                    await interaction.reply({ content: '❌ تعذر إرسال رسالة خاصة للعضو.', ephemeral: true });
                }
                break;
            case 'admin_transcript':
                await interaction.reply({ content: '⏳ يتم تجهيز نسخة التذكرة وإرسالها لخاصك...', ephemeral: true });
                try {
                    const messages = await channel.messages.fetch({ limit: 100 });
                    const transcript = messages.map(m => `${m.author.tag}: ${m.content}`).reverse().join('\n');
                    const buffer = Buffer.from(transcript, 'utf-8');
                    await interaction.user.send({ 
                        content: `📄 نسخة تذكرة: **${channel.name}**`,
                        files: [{ attachment: buffer, name: `transcript-${channel.name}.txt` }] 
                    }).catch(() => {});
                } catch (err) {
                    await interaction.followUp({ content: '❌ تعذر إرسال النسخة لخاصك، تأكد من فتح الخاص.', ephemeral: true });
                }
                break;
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_admin_options') {
        const adminRoleIds = ticketBot.adminRoles.get(interaction.guildId) || [];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoleIds.includes(role.id)) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!hasAdminRole) {
            return interaction.reply({ content: '❌ هذا الخيار مخصص للإدارة فقط.', ephemeral: true });
        }
        
        const embed = createTicketAdminOptionsEmbed();
        const row = createTicketAdminOptionsRow();
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        return;
    }

    if (interaction.isButton() && interaction.customId === 'claim_ticket') {
        const adminRoleIds = ticketBot.adminRoles.get(interaction.guildId) || [];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoleIds.includes(role.id)) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!hasAdminRole) {
            return interaction.reply({ content: '❌ هذا الخيار مخصص للإدارة فقط.', ephemeral: true });
        }

        await interaction.reply({ content: `✅ تم استلام التذكرة بواسطة ${interaction.user}.` });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
            
            // خريطة لأسماء الأنواع باللغة العربية للرسائل
            const typeNames = {
                'ticket_admin_transfer': 'النقل الاداري',
                'ticket_military_transfer': 'النقل العسكري',
                'ticket_rank_restore': 'استرجاع الرتب',
                'ticket_girls_transfer': 'نقل رتب بنات'
            };

            const ticketTypeName = typeNames[selectedType] || 'عام';
            
            try {
                // منع التكرار (cooldown)
                const cooldownKey = `${interaction.guild.id}-${interaction.user.id}`;
                if (ticketBot.cooldowns.has(cooldownKey)) {
                    const expirationTime = ticketBot.cooldowns.get(cooldownKey);
                    if (Date.now() < expirationTime) {
                        const timeLeft = ((expirationTime - Date.now()) / 1000).toFixed(1);
                        await interaction.reply({ content: `يرجى الانتظار ${timeLeft} ثانية قبل فتح تذكرة أخرى.`, ephemeral: true });
                        return;
                    }
                }

                await interaction.deferReply({ ephemeral: true });

                // تحديث العداد
                let currentCounter = ticketBot.ticketCounters.get(interaction.guild.id) || 0;
                currentCounter++;
                ticketBot.ticketCounters.set(interaction.guild.id, currentCounter);

                // تحديد الكاتيجوري
                const categoryId = process.env.TICKET_CATEGORY_ID || tokens.TICKET_CATEGORY_ID;
                const category = categoryId ? interaction.guild.channels.cache.get(categoryId) : null;

                if (categoryId && !category) {
                    console.error(`⚠️ الكاتيجوري ${categoryId} غير موجود في السيرفر`);
                }

                // إنشاء الروم
                const channelName = `🎫・${currentCounter}`;
                const ticketChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: category || null,
                    permissionOverwrites: [
                        { 
                            id: interaction.guild.id, 
                            deny: [PermissionFlagsBits.ViewChannel] 
                        },
                        { 
                            id: interaction.user.id, 
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] 
                        },
                        { 
                            id: ticketBot.user.id, 
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] 
                        }
                    ]
                });

                const embed = createTicketEmbed(ticketTypeName, currentCounter, interaction.user, interaction.guild);
                const buttons = createTicketManageButtons();

                await ticketChannel.send({
                    content: `<@${interaction.user.id}> | فريق الدعم`,
                    embeds: [embed],
                    components: [buttons]
                });

                // إضافة المشرفين
                const adminRoleIds = ticketBot.adminRoles.get(interaction.guild.id) || [];
                for (const roleId of adminRoleIds) {
                    await ticketChannel.permissionOverwrites.edit(roleId, { 0x400: true, 0x800: true, 0x10000: true });
                }

                // إضافة الرتب المرتبطة بنوع التذكرة
                const typeKey = selectedType.replace('ticket_', '');
                const typeSpecificRoles = ticketBot.ticketRoles.get(interaction.guild.id)?.[typeKey] || [];
                for (const roleId of typeSpecificRoles) {
                    await ticketChannel.permissionOverwrites.edit(roleId, { 0x400: true, 0x800: true, 0x10000: true });
                }

                // تعيين Cooldown (30 ثانية)
                ticketBot.cooldowns.set(cooldownKey, Date.now() + 30000);

                await interaction.editReply({ content: `تم فتح تذكرتك بنجاح: ${ticketChannel}` });

            } catch (error) {
                console.error('خطأ في إنشاء التذكرة:', error);
                if (interaction.deferred) {
                    await interaction.editReply({ content: 'حدث خطأ أثناء محاولة فتح التذكرة.' });
                } else {
                    await interaction.reply({ content: 'حدث خطأ أثناء محاولة فتح التذكرة.', ephemeral: true });
                }
            }
            return;
        }
    }
}

ticketBot.on('interactionCreate', async (interaction) => {
    // منع معالجة نفس interaction
    if (processedInteractions.has(interaction.id) || interaction.replied || interaction.deferred) {
        return;
    }
    
    processedInteractions.set(interaction.id, Date.now());
    
    // معالجة المودال (Modals)
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'close_ticket_reason_modal') {
            const reason = interaction.fields.getTextInputValue('close_reason_input');
            await interaction.reply({ content: `🔒 يتم إغلاق التذكرة بسبب: ${reason}` });
            setTimeout(() => {
                if (interaction.channel) interaction.channel.delete().catch(() => {});
            }, 5000);
        }
        
        if (interaction.customId === 'add_member_modal') {
            const memberId = interaction.fields.getTextInputValue('member_id_input').replace(/[<@!>]/g, '');
            try {
                const member = await interaction.guild.members.fetch(memberId);
                await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
                await interaction.reply({ content: `✅ تم إضافة ${member.user.username} إلى التذكرة.` });
            } catch (err) {
                await interaction.reply({ content: '❌ تعذر العثور على العضو، تأكد من الـ ID الصحيح.', ephemeral: true });
            }
        }
        return;
    }

    // تسجيل التفاعل للتشخيص
    console.log('🔔 تفاعل جديد:', {
        type: interaction.type,
        customId: interaction.customId || 'N/A',
        commandName: interaction.commandName || 'N/A',
        user: interaction.user.username,
        guild: interaction.guild?.name || 'DM'
    });

    // معالجة اختيار خيارات الإدارة
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_admin_options_select') {
        const selectedOption = interaction.values[0];
        const channel = interaction.channel;
        
        const adminRoleIds = ticketBot.adminRoles.get(interaction.guildId) || [];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoleIds.includes(role.id)) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!hasAdminRole) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام خيارات الإدارة.', ephemeral: true });
        }

        switch (selectedOption) {
            case 'admin_unclaim':
                await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: null });
                await interaction.reply({ content: '✅ تم إلغاء المطالبة بالتذكرة.' });
                break;
            case 'admin_close_reason':
                const modal = new ModalBuilder().setCustomId('close_ticket_reason_modal').setTitle('إغلاق التذكرة لسبب');
                const reasonInput = new TextInputBuilder().setCustomId('close_reason_input').setLabel('سبب الإغلاق').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                await interaction.showModal(modal);
                break;
            case 'admin_add_member':
                const addMemberModal = new ModalBuilder().setCustomId('add_member_modal').setTitle('إضافة عضو للتذكرة');
                const memberInput = new TextInputBuilder().setCustomId('member_id_input').setLabel('معرف العضو (ID) أو منشن').setStyle(TextInputStyle.Short).setRequired(true);
                addMemberModal.addComponents(new ActionRowBuilder().addComponents(memberInput));
                await interaction.showModal(addMemberModal);
                break;
            case 'admin_remind_member':
                try {
                    const ticketOwnerId = channel.topic?.split(': ')[1];
                    if (ticketOwnerId) {
                        const owner = await interaction.guild.members.fetch(ticketOwnerId);
                        await owner.send(`🔔 تذكير: تذكرتك المفتوحة في **${interaction.guild.name}** بانتظار ردك في <#${channel.id}>`).catch(() => {});
                        await interaction.reply({ content: '✅ تم إرسال تذكير للعضو في الخاص.', ephemeral: true });
                    } else {
                        await interaction.reply({ content: '❌ لم يتم العثور على مالك التذكرة.', ephemeral: true });
                    }
                } catch (err) {
                    await interaction.reply({ content: '❌ تعذر إرسال رسالة خاصة للعضو.', ephemeral: true });
                }
                break;
            case 'admin_transcript':
                await interaction.reply({ content: '⏳ يتم تجهيز نسخة التذكرة وإرسالها لخاصك...', ephemeral: true });
                try {
                    const messages = await channel.messages.fetch({ limit: 100 });
                    const transcript = messages.map(m => `${m.author.tag}: ${m.content}`).reverse().join('\n');
                    const buffer = Buffer.from(transcript, 'utf-8');
                    await interaction.user.send({ 
                        content: `📄 نسخة تذكرة: **${channel.name}**`,
                        files: [{ attachment: buffer, name: `transcript-${channel.name}.txt` }] 
                    }).catch(() => {});
                } catch (err) {
                    await interaction.followUp({ content: '❌ تعذر إرسال النسخة لخاصك، تأكد من فتح الخاص.', ephemeral: true });
                }
                break;
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_admin_options') {
        const adminRoleIds = ticketBot.adminRoles.get(interaction.guildId) || [];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoleIds.includes(role.id)) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!hasAdminRole) {
            return interaction.reply({ content: '❌ هذا الخيار مخصص للإدارة فقط.', ephemeral: true });
        }
        
        const embed = createTicketAdminOptionsEmbed();
        const row = createTicketAdminOptionsRow();
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        return;
    }

    if (interaction.isButton() && interaction.customId === 'claim_ticket') {
        const adminRoleIds = ticketBot.adminRoles.get(interaction.guildId) || [];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoleIds.includes(role.id)) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!hasAdminRole) {
            return interaction.reply({ content: '❌ هذا الخيار مخصص للإدارة فقط.', ephemeral: true });
        }

        await interaction.reply({ content: `✅ تم استلام التذكرة بواسطة ${interaction.user}.` });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
        const selectedType = interaction.values[0];
        // ... بقية منطق إنشاء التذكرة
    }

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        // ... منطق أوامر الـ Slash
    }
});
                        const militaryTransferExpirationTime = ticketBot.cooldowns.get(militaryTransferCooldownKey) + militaryTransferCooldownAmount;
                        if (militaryTransferNow < militaryTransferExpirationTime) {
                            const militaryTransferTimeLeft = (militaryTransferExpirationTime - militaryTransferNow) / 1000;
                            await interaction.reply({ content: `يجب الانتظار ${militaryTransferTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, ephemeral: true });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(militaryTransferCooldownKey, militaryTransferNow);
                    setTimeout(() => ticketBot.cooldowns.delete(militaryTransferCooldownKey), militaryTransferCooldownAmount);
                    
                    const militaryTransferAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const militaryTransferPermissionOverwrites = [
                        { id: interaction.guild.id, deny: ['ViewChannel'] },
                        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    ];
                    
                    militaryTransferAdminRoles.forEach(roleId => {
                        militaryTransferPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const militaryTransferChannel = await interaction.guild.channels.create({
                        name: `النقل-العسكري-${interaction.user.username}`,
                        type: 0,
                        parent: tokens.TICKET_CATEGORY_ID || null,
                        permissionOverwrites: militaryTransferPermissionOverwrites,
                    });
                    
                    const militaryTransferEmbed = createTicketEmbed(
                        'النقل العسكري',
                        `تذكرة نقل عسكري من ${interaction.user}`,
                        interaction.user
                    );
                    
                    const militaryTransferManageButtons = createTicketManageButtons();
                    await militaryTransferChannel.send({ embeds: [militaryTransferEmbed], components: [militaryTransferManageButtons] });
                    await interaction.reply({ content: `تم إنشاء تذكرة النقل العسكري في ${militaryTransferChannel}`, ephemeral: true });
                    break;

                case 'ticket_inquiry':
                    // فحص cooldown
                    const inquiryUserId = interaction.user.id;
                    const inquiryCooldownKey = `${inquiryUserId}-ticket`;
                    const inquiryNow = Date.now();
                    const inquiryCooldownAmount = 10000;
                    
                    if (ticketBot.cooldowns.has(inquiryCooldownKey)) {
                        const inquiryExpirationTime = ticketBot.cooldowns.get(inquiryCooldownKey) + inquiryCooldownAmount;
                        if (inquiryNow < inquiryExpirationTime) {
                            const inquiryTimeLeft = (inquiryExpirationTime - inquiryNow) / 1000;
                            await interaction.reply({ content: `يجب الانتظار ${inquiryTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, ephemeral: true });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(inquiryCooldownKey, inquiryNow);
                    setTimeout(() => ticketBot.cooldowns.delete(inquiryCooldownKey), inquiryCooldownAmount);
                    
                    const inquiryAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const inquiryPermissionOverwrites = [
                        { id: interaction.guild.id, deny: ['ViewChannel'] },
                        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    ];
                    
                    inquiryAdminRoles.forEach(roleId => {
                        inquiryPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const inquiryChannel = await interaction.guild.channels.create({
                        name: `استفسار-${interaction.user.username}`,
                        type: 0,
                        parent: tokens.TICKET_CATEGORY_ID || null,
                        permissionOverwrites: inquiryPermissionOverwrites,
                    });
                    
                    const inquiryEmbed = createTicketEmbed(
                        'استفسار',
                        `استفسار من ${interaction.user}`,
                        interaction.user
                    );
                    
                    const inquiryManageButtons = createTicketManageButtons();
                    await inquiryChannel.send({ embeds: [inquiryEmbed], components: [inquiryManageButtons] });
                    await interaction.reply({ content: `تم إنشاء تذكرة الاستفسار في ${inquiryChannel}`, ephemeral: true });
                    break;

                case 'ticket_admin_complaint':
                    // فحص cooldown
                    const complaintUserId = interaction.user.id;
                    const complaintCooldownKey = `${complaintUserId}-ticket`;
                    const complaintNow = Date.now();
                    const complaintCooldownAmount = 10000;
                    
                    if (ticketBot.cooldowns.has(complaintCooldownKey)) {
                        const complaintExpirationTime = ticketBot.cooldowns.get(complaintCooldownKey) + complaintCooldownAmount;
                        if (complaintNow < complaintExpirationTime) {
                            const complaintTimeLeft = (complaintExpirationTime - complaintNow) / 1000;
                            await interaction.reply({ content: `يجب الانتظار ${complaintTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, ephemeral: true });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(complaintCooldownKey, complaintNow);
                    setTimeout(() => ticketBot.cooldowns.delete(complaintCooldownKey), complaintCooldownAmount);
                    
                    const complaintAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const complaintPermissionOverwrites = [
                        { id: interaction.guild.id, deny: ['ViewChannel'] },
                        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    ];
                    
                    complaintAdminRoles.forEach(roleId => {
                        complaintPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const complaintChannel = await interaction.guild.channels.create({
                        name: `شكوى-اداري-${interaction.user.username}`,
                        type: 0,
                        parent: tokens.TICKET_CATEGORY_ID || null,
                        permissionOverwrites: complaintPermissionOverwrites,
                    });
                    
                    const complaintEmbed = createTicketEmbed(
                        'شكوى على اداري',
                        `شكوى على اداري من ${interaction.user}`,
                        interaction.user
                    );
                    
                    const complaintManageButtons = createTicketManageButtons();
                    await complaintChannel.send({ embeds: [complaintEmbed], components: [complaintManageButtons] });
                    await interaction.reply({ content: `تم إنشاء تذكرة الشكوى في ${complaintChannel}`, ephemeral: true });
                    break;

                case 'claim_ticket':
                    // التحقق من أن المستخدم مشرف تذاكر
                    const claimGuildId = interaction.guild.id;
                    const claimAdminRoles = ticketBot.adminRoles.get(claimGuildId) || [];
                    const claimUserRoles = interaction.member.roles.cache.map(role => role.id);
                    const claimIsAdmin = claimAdminRoles.some(roleId => claimUserRoles.includes(roleId)) || interaction.member.permissions.has('ManageChannels');
                    
                    if (!claimIsAdmin) {
                        await interaction.reply({ content: 'لا يمكنك استلام التذاكر. هذه الميزة مخصصة للمشرفين فقط.', ephemeral: true });
                        break;
                    }
                    
                    const claimEmbed = new EmbedBuilder()
                        .setTitle('👤 تم استلام التذكرة')
                        .setDescription(`تم استلام هذه التذكرة من قبل ${interaction.user}\nسيتم التعامل معها في أقرب وقت.`)
                        .setColor(0x3498db)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [claimEmbed] });
                    break;
                    
                case 'close_ticket':
                    // التحقق من أن المستخدم مشرف تذاكر
                    const closeGuildId = interaction.guild.id;
                    const closeAdminRoles = ticketBot.adminRoles.get(closeGuildId) || [];
                    const closeUserRoles = interaction.member.roles.cache.map(role => role.id);
                    const closeIsAdmin = closeAdminRoles.some(roleId => closeUserRoles.includes(roleId)) || interaction.member.permissions.has('ManageChannels');
                    
                    if (!closeIsAdmin) {
                        await interaction.reply({ content: 'لا يمكنك قفل التذكرة. هذه الميزة مخصصة للمشرفين فقط.', ephemeral: true });
                        break;
                    }
                    
                    const closeEmbed = new EmbedBuilder()
                        .setTitle('🔒 جاري قفل التذكرة')
                        .setDescription('سيتم قفل هذه التذكرة في غضون 10 ثوان...')
                        .setColor(0xe74c3c)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [closeEmbed] });
                    
                    // إرسال السجل قبل الحذف
                    try {
                        await sendTicketLog(interaction.channel, interaction.user, 'قفل التذكرة');
                    } catch (logError) {
                        console.error('خطأ في إرسال سجل التذكرة:', logError);
                    }
                    
                    // حذف القناة بعد 10 ثوان
                    setTimeout(async () => {
                        try {
                            await interaction.channel.delete();
                        } catch (error) {
                            console.error('خطأ في حذف قناة التذكرة:', error);
                        }
                    }, 10000);
                    break;
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة الأزرار:', {
                error: error.message || error,
                customId: interaction.customId,
                user: interaction.user.username,
                guild: interaction.guild?.name,
                stack: error.stack
            });
            
            // محاولة الرد على الأخطاء إذا لم يتم الرد بعد
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'حدث خطأ أثناء معالجة طلبك. حاول مرة أخرى.', 
                        ephemeral: true 
                    });
                } catch (replyError) {
                    console.error('❌ فشل في الرد على خطأ الزر:', replyError.message);
                }
            }
        }
    }
});

// بوت التقييمات
reviewBot.once('clientReady', async () => {
    console.log(`بوت التقييمات جاهز! مسجل باسم ${reviewBot.user.tag}`);
    await registerReviewCommands();
});

// معالجة slash commands للتقييمات
reviewBot.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === 'تقييم' || commandName === 'review') {
            const rating = interaction.options.getInteger('rating');
            
            // الحصول على إحصائيات التقييم للمستخدم
            const userId = interaction.user.id;
            let userStats = reviewBot.reviewStats.get(userId) || { count: 0, lastReviewId: 2000 };
            userStats.count++;
            userStats.lastReviewId++;
            reviewBot.reviewStats.set(userId, userStats);
            
            // إنشاء embed التقييم
            const reviewEmbed = createReviewEmbed(rating, interaction.user, userStats.lastReviewId, userStats.count);
            
            // إرسال التقييم
            await interaction.reply({ embeds: [reviewEmbed] });
        } else if (commandName === 'اختيار_روم_تقييم' || commandName === 'set_review_room') {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guild.id;
            
            if (!reviewBot.reviewChannels.has(guildId)) {
                reviewBot.reviewChannels.set(guildId, new Set());
            }
            
            const channels = reviewBot.reviewChannels.get(guildId);
            let responseMsg = '';
            
            if (channels.has(channel.id)) {
                channels.delete(channel.id);
                responseMsg = `❌ تم إزالة ${channel} من قائمة رومات التقييم.`;
            } else {
                channels.add(channel.id);
                responseMsg = `✅ تم إضافة ${channel} إلى قائمة رومات التقييم.`;
            }
            
            const successEmbed = new EmbedBuilder()
                .setTitle('إعدادات رومات التقييم')
                .setDescription(`${responseMsg}\n\n**الرومات الحالية:**\n${Array.from(channels).map(id => `<#${id}>`).join('\n') || 'لا يوجد'}`)
                .setColor(0x00AE86);
            
            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        }
    } catch (error) {
        console.error('خطأ في بوت التقييمات:', error);
        if (!interaction.replied) {
            await interaction.reply({ content: 'حدث خطأ أثناء إرسال التقييم', ephemeral: true });
        }
    }
});

// بوت التقييم يعمل في الروم المحددة أو القنوات المسماة للتقييم
reviewBot.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const guildId = message.guild?.id;
    const channelId = message.channel.id;
    
    // التحقق إذا كان هذا الروم محدد للتقييمات
    const guildChannels = reviewBot.reviewChannels.get(guildId);
    const isSelectedChannel = guildChannels && guildChannels.has(channelId);
    
    // أو التحقق إذا كانت القناة تحتوي على كلمة "تقييم" أو "review" في الاسم
    const channelName = message.channel.name ? message.channel.name.toLowerCase() : '';
    const isReviewChannel = channelName.includes('تقييم') || 
                           channelName.includes('review') || 
                           channelName.includes('rating') ||
                           channelName.includes('feedback');
    
    // أو إذا كانت الرسالة تحتوي على رقم من 1-5 فقط
    const isRatingMessage = /^[1-5]$/.test(message.content.trim());
    
    if (isSelectedChannel || isReviewChannel || isRatingMessage) {
        try {
            // حذف الرسالة الأصلية
            await message.delete().catch(() => {});
            
            // استخراج التقييم
            let rating;
            const ratingMatch = message.content.match(/[1-5]/);
            if (ratingMatch) {
                rating = parseInt(ratingMatch[0]);
            } else {
                // إذا لم يكن هناك رقم محدد، أعطي تقييم حسب طول النص
                const textLength = message.content.length;
                if (textLength > 50) rating = 5;
                else if (textLength > 30) rating = 4;
                else if (textLength > 15) rating = 3;
                else if (textLength > 5) rating = 2;
                else rating = 1;
            }
            
            // الحصول على إحصائيات التقييم للمستخدم
            const userId = message.author.id;
            let userStats = reviewBot.reviewStats.get(userId) || { count: 0, lastReviewId: 2000 };
            userStats.count++;
            userStats.lastReviewId++;
            reviewBot.reviewStats.set(userId, userStats);
            
            // إنشاء embed التقييم مع النص الأصلي
            const reviewEmbed = createReviewEmbedWithText(rating, message.author, userStats.lastReviewId, userStats.count, message.content);
            
            // إرسال التقييم
            await message.channel.send({ embeds: [reviewEmbed] });
            
        } catch (error) {
            console.error('خطأ في بوت التقييمات:', error);
        }
    }
});

module.exports = {
    ticketBot,
    reviewBot,
    createTicketMainEmbed,
    createTicketOptionsEmbed,
    createTicketEmbed,
    createReviewEmbed,
    registerTicketCommands,
    registerReviewCommands
};