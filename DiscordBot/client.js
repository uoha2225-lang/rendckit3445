const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, SlashCommandBuilder, REST, Routes, StringSelectMenuBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
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
        .setImage('https://replit.com/attached_assets/IMG_223223424_1766852684390.png')
        .setColor(0x0099ff)
        .setTimestamp();
};

const createTicketOptionsEmbed = () => {
    return new EmbedBuilder()
        .setTitle('فتح تذكرة من هنا')
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
        .setTitle('🎫 تفاصيل التذكرة الجديدة')
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
        .setImage('https://replit.com/attached_assets/IMG_223223424_1766852684390.png')
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

// إنشاء أزرار إدارة التذاكر
const createTicketManageButtons = () => {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('استلام التذكرة')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('قفل التذكرة')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
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
    
    // تسجيل التفاعل للتشخيص
    console.log('🔔 تفاعل جديد:', {
        type: interaction.type,
        customId: interaction.customId || 'N/A',
        commandName: interaction.commandName || 'N/A',
        user: interaction.user.username,
        guild: interaction.guild?.name || 'DM'
    });
    
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_type_select') {
            const selectedType = interaction.values[0];
            
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

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'تذكرة':
                case 'ticket':
                    const mainEmbed = createTicketMainEmbed();
                    const mainButton = createTicketMainButton();
                    
                    try {
                        await interaction.reply({ 
                            embeds: [mainEmbed], 
                            components: [mainButton]
                        });
                        console.log('✅ تم إرسال نظام التذاكر بنجاح');
                        
                    } catch (replyError) {
                        console.error('❌ خطأ في الرد على أمر التذكرة:', replyError.message);
                        if (!interaction.replied && !interaction.deferred) {
                            try {
                                await interaction.reply({ 
                                    content: 'حدث خطأ في عرض نظام التذاكر. حاول مرة أخرى.', 
                                    ephemeral: true 
                                });
                            } catch (fallbackError) {
                                console.error('❌ فشل في الرد الاحتياطي:', fallbackError.message);
                            }
                        }
                    }
                    break;

                case 'help':
                    const helpEmbed = new EmbedBuilder()
                        .setTitle('📋 أوامر بوت التذاكر')
                        .setDescription(
                            `**الأوامر المتاحة:**\n\n` +
                            `\`/تذكرة\` - فتح نظام التذاكر\n` +
                            `\`/ticket\` - Open ticket system (English)\n` +
                            `\`/مشرفين_التذاكر\` - إدارة رتب مشرفين التذاكر\n` +
                            `\`/ticket_admins\` - Manage ticket admin roles (English)\n` +
                            `\`/سجلات_التذاكر\` - تحديد روم سجلات التذاكر\n` +
                            `\`/ticket_logs\` - Set ticket logs channel (English)\n` +
                            `\`/help\` - عرض هذه القائمة`
                        )
                        .setColor(0x3498db);
                    
                    try {
                        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
                    } catch (replyError) {
                        console.error('خطأ في الرد على أمر المساعدة:', replyError.message);
                    }
                    break;
                    
                case 'مشرفين_التذاكر':
                case 'ticket_admins':
                    const action = interaction.options.getString('action');
                    const role = interaction.options.getRole('role');
                    const guildId = interaction.guild.id;
                    
                    // الحصول على قائمة الرتب المحفوظة للسيرفر
                    let adminRoles = ticketBot.adminRoles.get(guildId) || [];
                    
                    if (action === 'add') {
                        if (!role) {
                            await interaction.reply({ content: 'يجب تحديد الرتبة المراد إضافتها', ephemeral: true });
                            break;
                        }
                        
                        if (adminRoles.includes(role.id)) {
                            try {
                                await interaction.reply({ content: `الرتبة ${role.name} موجودة بالفعل في قائمة مشرفين التذاكر`, ephemeral: true });
                            } catch (e) { console.log('خطأ في الرد'); }
                            break;
                        }
                        
                        adminRoles.push(role.id);
                        ticketBot.adminRoles.set(guildId, adminRoles);
                        
                        const addEmbed = new EmbedBuilder()
                            .setTitle('✅ تم إضافة رتبة مشرف تذاكر')
                            .setDescription(`تم إضافة الرتبة ${role} إلى قائمة مشرفين التذاكر`)
                            .setColor(0x00AE86);
                        
                        try {
                            await interaction.reply({ embeds: [addEmbed], ephemeral: true });
                        } catch (e) { console.log('خطأ في الرد'); }
                        
                    } else if (action === 'remove') {
                        if (!role) {
                            await interaction.reply({ content: 'يجب تحديد الرتبة المراد إزالتها', ephemeral: true });
                            break;
                        }
                        
                        const roleIndex = adminRoles.indexOf(role.id);
                        if (roleIndex === -1) {
                            await interaction.reply({ content: `الرتبة ${role.name} غير موجودة في قائمة مشرفين التذاكر`, ephemeral: true });
                            break;
                        }
                        
                        adminRoles.splice(roleIndex, 1);
                        ticketBot.adminRoles.set(guildId, adminRoles);
                        
                        const removeEmbed = new EmbedBuilder()
                            .setTitle('❌ تم إزالة رتبة مشرف تذاكر')
                            .setDescription(`تم إزالة الرتبة ${role} من قائمة مشرفين التذاكر`)
                            .setColor(0xe74c3c);
                        
                        try {
                            await interaction.reply({ embeds: [removeEmbed], ephemeral: true });
                        } catch (e) { console.log('خطأ في الرد'); }
                        
                    } else if (action === 'list') {
                        if (adminRoles.length === 0) {
                            await interaction.reply({ content: 'لا توجد رتب مشرفين تذاكر محددة حالياً', ephemeral: true });
                            break;
                        }
                        
                        const rolesList = adminRoles.map(roleId => {
                            const roleObj = interaction.guild.roles.cache.get(roleId);
                            return roleObj ? roleObj.toString() : `رتبة محذوفة (${roleId})`;
                        }).join('\n');
                        
                        const listEmbed = new EmbedBuilder()
                            .setTitle('👥 قائمة مشرفين التذاكر')
                            .setDescription(rolesList)
                            .setColor(0x3498db);
                        
                        try {
                            await interaction.reply({ embeds: [listEmbed], ephemeral: true });
                        } catch (e) { console.log('خطأ في الرد'); }
                    }
                    break;
                    
                case 'سجلات_التذاكر':
                case 'ticket_logs':
                    const logChannel = interaction.options.getChannel('channel');
                    const logGuildId = interaction.guild.id;
                    
                    // حفظ الروم المخصص للسجلات
                    ticketBot.logChannels.set(logGuildId, logChannel.id);
                    
                    const logEmbed = new EmbedBuilder()
                        .setTitle('✅ تم تحديد روم سجلات التذاكر')
                        .setDescription(`تم تحديد ${logChannel} كروم لسجلات التذاكر.\nسيتم إرسال جميع سجلات التذاكر إلى هذا الروم.`)
                        .setColor(0x00AE86);
                    
                    try {
                        await interaction.reply({ embeds: [logEmbed], ephemeral: true });
                    } catch (e) { console.log('خطأ في الرد'); }
                    break;
                    
                case 'ربط_الرتب_بالتذاكر':
                case 'ticket_role_assign':
                    const ticketType = interaction.options.getString('ticket_type');
                    const roleAction = interaction.options.getString('action');
                    const targetRole = interaction.options.getRole('role');
                    const roleGuildId = interaction.guild.id;
                    
                    // إنشاء بيانات الملكية إذا لم تكن موجودة
                    if (!ticketBot.ticketRoles.has(roleGuildId)) {
                        ticketBot.ticketRoles.set(roleGuildId, {});
                    }
                    
                    const guildRoles = ticketBot.ticketRoles.get(roleGuildId);
                    
                    if (!guildRoles[ticketType]) {
                        guildRoles[ticketType] = [];
                    }
                    
                    if (roleAction === 'add') {
                        if (!targetRole) {
                            await interaction.reply({ content: 'يجب تحديد الرتبة المراد إضافتها', ephemeral: true });
                            break;
                        }
                        
                        if (guildRoles[ticketType].includes(targetRole.id)) {
                            await interaction.reply({ content: `الرتبة ${targetRole} موجودة بالفعل لهذا النوع من التذاكر`, ephemeral: true });
                            break;
                        }
                        
                        guildRoles[ticketType].push(targetRole.id);
                        ticketBot.ticketRoles.set(roleGuildId, guildRoles);
                        
                        const addEmbed = new EmbedBuilder()
                            .setTitle('✅ تم إضافة رتبة')
                            .setDescription(`تم ربط الرتبة ${targetRole} بنوع التذكرة "${ticketType}"`)
                            .setColor(0x00AE86);
                        
                        await interaction.reply({ embeds: [addEmbed], ephemeral: true });
                    } else if (roleAction === 'remove') {
                        if (!targetRole) {
                            await interaction.reply({ content: 'يجب تحديد الرتبة المراد حذفها', ephemeral: true });
                            break;
                        }
                        
                        const roleIndex = guildRoles[ticketType].indexOf(targetRole.id);
                        if (roleIndex === -1) {
                            await interaction.reply({ content: `الرتبة ${targetRole} غير مرتبطة بهذا النوع من التذاكر`, ephemeral: true });
                            break;
                        }
                        
                        guildRoles[ticketType].splice(roleIndex, 1);
                        ticketBot.ticketRoles.set(roleGuildId, guildRoles);
                        
                        const removeEmbed = new EmbedBuilder()
                            .setTitle('❌ تم إزالة رتبة')
                            .setDescription(`تم إزالة الرتبة ${targetRole} من نوع التذكرة "${ticketType}"`)
                            .setColor(0xe74c3c);
                        
                        await interaction.reply({ embeds: [removeEmbed], ephemeral: true });
                    } else if (roleAction === 'list') {
                        const typeRoles = guildRoles[ticketType];
                        if (!typeRoles || typeRoles.length === 0) {
                            await interaction.reply({ content: `لا توجد رتب مرتبطة بنوع التذكرة "${ticketType}"`, ephemeral: true });
                            break;
                        }
                        
                        const rolesList = typeRoles.map(roleId => {
                            const roleObj = interaction.guild.roles.cache.get(roleId);
                            return roleObj ? roleObj.toString() : `رتبة محذوفة (${roleId})`;
                        }).join('\n');
                        
                        const listEmbed = new EmbedBuilder()
                            .setTitle(`📋 الرتب المرتبطة بـ "${ticketType}"`)
                            .setDescription(rolesList)
                            .setColor(0x3498db);
                        
                        await interaction.reply({ embeds: [listEmbed], ephemeral: true });
                    }
                    break;
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة slash command:', {
                error: error.message || error,
                commandName: interaction.commandName,
                user: interaction.user.username,
                guild: interaction.guild?.name
            });
            
            // محاولة الرد على الأخطاء إذا لم يتم الرد بعد
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'حدث خطأ أثناء تنفيذ الأمر. حاول مرة أخرى.', 
                        ephemeral: true 
                    });
                } catch (replyError) {
                    console.error('❌ فشل في الرد على الخطأ:', replyError.message);
                }
            }
        }
    } else if (interaction.isButton()) {
        try {
            switch (interaction.customId) {
                case 'open_ticket_menu':
                    try {
                        const optionsEmbed = createTicketOptionsEmbed();
                        const optionsButtons = createTicketOptionsButtons();
                        
                        await interaction.update({ 
                            embeds: [optionsEmbed], 
                            components: optionsButtons 
                        });
                    } catch (updateError) {
                        console.error('خطأ في تحديث قائمة التذاكر:', updateError.message);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ 
                                content: 'حدث خطأ في عرض قائمة التذاكر. حاول مرة أخرى.', 
                                ephemeral: true 
                            }).catch(() => {});
                        }
                    }
                    break;

                case 'ticket_type_select':
                    // تم التعامل معه في الجزء العلوي
                    break;

                case 'ticket_admin_transfer':
                    // فحص cooldown
                    const adminTransferUserId = interaction.user.id;
                    const adminTransferCooldownKey = `${adminTransferUserId}-ticket`;
                    const adminTransferNow = Date.now();
                    const adminTransferCooldownAmount = 10000;
                    
                    if (ticketBot.cooldowns.has(adminTransferCooldownKey)) {
                        const adminTransferExpirationTime = ticketBot.cooldowns.get(adminTransferCooldownKey) + adminTransferCooldownAmount;
                        if (adminTransferNow < adminTransferExpirationTime) {
                            const adminTransferTimeLeft = (adminTransferExpirationTime - adminTransferNow) / 1000;
                            await interaction.reply({ content: `يجب الانتظار ${adminTransferTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, ephemeral: true });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(adminTransferCooldownKey, adminTransferNow);
                    setTimeout(() => ticketBot.cooldowns.delete(adminTransferCooldownKey), adminTransferCooldownAmount);
                    
                    const adminTransferAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const adminTransferPermissionOverwrites = [
                        { id: interaction.guild.id, deny: ['ViewChannel'] },
                        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    ];
                    
                    adminTransferAdminRoles.forEach(roleId => {
                        adminTransferPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const adminTransferChannel = await interaction.guild.channels.create({
                        name: `النقل-الاداري-${interaction.user.username}`,
                        type: 0,
                        parent: tokens.TICKET_CATEGORY_ID || null,
                        permissionOverwrites: adminTransferPermissionOverwrites,
                    });
                    
                    const adminTransferEmbed = createTicketEmbed(
                        'النقل الاداري',
                        `تذكرة نقل اداري من ${interaction.user}`,
                        interaction.user
                    );
                    
                    const adminTransferManageButtons = createTicketManageButtons();
                    await adminTransferChannel.send({ embeds: [adminTransferEmbed], components: [adminTransferManageButtons] });
                    await interaction.reply({ content: `تم إنشاء تذكرة النقل الاداري في ${adminTransferChannel}`, ephemeral: true });
                    break;

                case 'ticket_military_transfer':
                    // فحص cooldown
                    const militaryTransferUserId = interaction.user.id;
                    const militaryTransferCooldownKey = `${militaryTransferUserId}-ticket`;
                    const militaryTransferNow = Date.now();
                    const militaryTransferCooldownAmount = 10000;
                    
                    if (ticketBot.cooldowns.has(militaryTransferCooldownKey)) {
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