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

// وظائف مساعدة للتذاكر
const createTicketMainEmbed = () => {
    return new EmbedBuilder()
        .setTitle('أهتم    تذكرتك    واحضر    مايناسبك')
        .setDescription('فتح تذكرة من هنا')
        .setImage('https://i.imgur.com/qren-store-bg.png')
        .setColor(0x2F3136)
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
                .setLabel('للشراء')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛒'),
            new ButtonBuilder()
                .setCustomId('ticket_inquiry')
                .setLabel('للاستفسار')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❓'),
            new ButtonBuilder()
                .setCustomId('ticket_problem')
                .setLabel('لحل مشكلة')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔧')
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
        )
];

// تسجيل slash commands للتذاكر
async function registerTicketCommands() {
    try {
        if (tokens.REMINDER_BOT_TOKEN && ticketBot.user) {
            const rest = new REST({ version: '10' }).setToken(tokens.REMINDER_BOT_TOKEN);
            
            console.log('بدء تسجيل slash commands للتذاكر...');
            await rest.put(
                Routes.applicationCommands(ticketBot.user.id),
                { body: ticketCommands }
            );
            console.log('✅ تم تسجيل slash commands للتذاكر بنجاح');
        }
    } catch (error) {
        console.error('خطأ في تسجيل slash commands للتذاكر:', error);
    }
}

// تسجيل slash commands للتقييمات
async function registerReviewCommands() {
    try {
        if (tokens.REVIEW_BOT_TOKEN && reviewBot.user) {
            const rest = new REST({ version: '10' }).setToken(tokens.REVIEW_BOT_TOKEN);
            
            console.log('بدء تسجيل slash commands للتقييمات...');
            await rest.put(
                Routes.applicationCommands(reviewBot.user.id),
                { body: reviewCommands }
            );
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
                    
                    await interaction.reply({ 
                        embeds: [mainEmbed], 
                        components: [mainButton] 
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
                        'للشراء',
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
                        'للاستفسار',
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
        }
    } catch (error) {
        console.error('خطأ في بوت التقييمات:', error);
        if (!interaction.replied) {
            await interaction.reply({ content: 'حدث خطأ أثناء إرسال التقييم', ephemeral: true });
        }
    }
});

// للاحتفاظ بالطريقة القديمة للتقييم (كتابة رقم في الرسالة)
reviewBot.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // التحقق من وجود أرقام في الرسالة (تقييم من 1-5)
    const ratingMatch = message.content.match(/^[1-5]$/);
    if (!ratingMatch) return;
    
    const rating = parseInt(ratingMatch[0]);
    
    try {
        // حذف الرسالة الأصلية
        await message.delete().catch(() => {});
        
        // الحصول على إحصائيات التقييم للمستخدم
        const userId = message.author.id;
        let userStats = reviewBot.reviewStats.get(userId) || { count: 0, lastReviewId: 2000 };
        userStats.count++;
        userStats.lastReviewId++;
        reviewBot.reviewStats.set(userId, userStats);
        
        // إنشاء embed التقييم
        const reviewEmbed = createReviewEmbed(rating, message.author, userStats.lastReviewId, userStats.count);
        
        // إرسال التقييم
        await message.channel.send({ embeds: [reviewEmbed] });
        
    } catch (error) {
        console.error('خطأ في بوت التقييمات:', error);
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