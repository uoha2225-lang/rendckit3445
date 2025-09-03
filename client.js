const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, SlashCommandBuilder, REST, Routes } = require('discord.js');
const tokens = require('./tokens');

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

// بوت التقييمات
const reviewBot = createBotClient();
reviewBot.reviewStats = new Collection();
reviewBot.reviewChannels = new Collection(); // لحفظ الرومز المخصصة للتقييم

// وظائف مساعدة للتذاكر
const createTicketMainEmbed = () => {
    return new EmbedBuilder()
        .setTitle('افتح تذكرتك واختار مايناسبك')
        .setDescription('فتح تذكرة من هنا')
        .setImage('attachment://qren-store-logo.png')
        .setColor(0x000000)
        .setTimestamp();
};

const createTicketOptionsEmbed = () => {
    return new EmbedBuilder()
        .setTitle('فتح تذكرة من هنا')
        .setColor(0x2F3136);
};

const createTicketEmbed = (ticketType, description, user) => {
    const embed = new EmbedBuilder()
        .setTitle(`🎫 تذكرة جديدة - ${ticketType}`)
        .setDescription(description)
        .addFields(
            { name: 'نوع التذكرة:', value: ticketType, inline: true },
            { name: 'المستخدم:', value: `<@${user.id}>`, inline: true },
            { name: 'التاريخ:', value: new Date().toLocaleString('ar-SA'), inline: true }
        )
        .setColor(0x00AE86)
        .setImage('https://i.imgur.com/qren-store-logo.png')
        .setTimestamp()
        .setFooter({ text: 'نظام التذاكر' });
    
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
            text: 'جميع الحقوق محفوظة © NiFy', 
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
            text: 'جميع الحقوق محفوظة © NiFy', 
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
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_buy')
                .setLabel('شراء منتج')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('ticket_inquiry')
                .setLabel('استفسار')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('ticket_problem')
                .setLabel('لحل مشكلة')
                .setStyle(ButtonStyle.Secondary)
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
        })
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
ticketBot.once('ready', async () => {
    console.log(`بوت التذاكر جاهز! مسجل باسم ${ticketBot.user.tag}`);
    await registerTicketCommands();
});

// معالجة slash commands للتذاكر
ticketBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'تذكرة':
                case 'ticket':
                    const mainEmbed = createTicketMainEmbed();
                    const mainButton = createTicketMainButton();
                    
                    // إرسال الصورة مع الembed
                    const { AttachmentBuilder } = require('discord.js');
                    const attachment = new AttachmentBuilder('images/qren-store-logo.png', { name: 'qren-store-logo.png' });
                    
                    await interaction.reply({ 
                        embeds: [mainEmbed], 
                        components: [mainButton],
                        files: [attachment]
                    });
                    break;

                case 'help':
                    const helpEmbed = new EmbedBuilder()
                        .setTitle('📋 أوامر بوت التذاكر')
                        .setDescription(
                            `**الأوامر المتاحة:**\n\n` +
                            `\`/تذكرة\` - فتح نظام التذاكر\n` +
                            `\`/ticket\` - Open ticket system (English)\n` +
                            `\`/help\` - عرض هذه القائمة`
                        )
                        .setColor(0x3498db);
                    
                    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
                    break;
            }
        } catch (error) {
            console.error('خطأ في معالجة slash command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'حدث خطأ أثناء تنفيذ الأمر', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        try {
            switch (interaction.customId) {
                case 'open_ticket_menu':
                    const optionsEmbed = createTicketOptionsEmbed();
                    const optionsButtons = createTicketOptionsButtons();
                    
                    await interaction.update({ 
                        embeds: [optionsEmbed], 
                        components: [optionsButtons] 
                    });
                    break;

                case 'ticket_buy':
                    const buyEmbed = createTicketEmbed(
                        'شراء منتج',
                        'هذه التذكرة مخصصة لشراء المنتجات',
                        interaction.user
                    );
                    
                    await interaction.reply({ 
                        embeds: [buyEmbed], 
                        ephemeral: false 
                    });
                    break;

                case 'ticket_inquiry':
                    const inquiryEmbed = createTicketEmbed(
                        'استفسار',
                        'هذه التذكرة مخصصة للإجابة على استفساراتكم',
                        interaction.user
                    );
                    
                    await interaction.reply({ 
                        embeds: [inquiryEmbed], 
                        ephemeral: false 
                    });
                    break;

                case 'ticket_problem':
                    const problemEmbed = createTicketEmbed(
                        'لحل مشكلة',
                        'هذه التذكرة مخصصة في حال كان لديك مشكلة',
                        interaction.user
                    );
                    
                    await interaction.reply({ 
                        embeds: [problemEmbed], 
                        ephemeral: false 
                    });
                    break;
            }
        } catch (error) {
            console.error('خطأ في معالجة الأزرار:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'حدث خطأ أثناء معالجة طلبك', ephemeral: true });
            }
        }
    }
});

// بوت التقييمات
reviewBot.once('ready', async () => {
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
            
            // حفظ الروم المخصص للتقييم
            reviewBot.reviewChannels.set(guildId, channel.id);
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تم تحديد روم التقييم')
                .setDescription(`تم تحديد ${channel} كروم للتقييمات.\nالآن أي رسالة ترسل في هذا الروم ستتحول تلقائياً إلى تقييم.`)
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
    const selectedReviewChannel = reviewBot.reviewChannels.get(guildId);
    const isSelectedChannel = selectedReviewChannel === channelId;
    
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