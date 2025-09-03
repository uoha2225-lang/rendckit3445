const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');
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

// بوت التذكيرات
const reminderBot = createBotClient();
reminderBot.commands = new Collection();

// بوت التقييمات
const reviewBot = createBotClient();
reviewBot.reviewStats = new Collection(); // لحفظ إحصائيات التقييمات

// وظائف مساعدة للتذكيرات
const createReminderEmbed = (title, description, imageUrl = null, color = 0x00AE86) => {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'بوت التذكيرات' });
    
    if (imageUrl) {
        embed.setImage(imageUrl);
    }
    
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

// أوامر بوت التذكيرات
reminderBot.on('ready', () => {
    console.log(`بوت التذكيرات جاهز! مسجل باسم ${reminderBot.user.tag}`);
});

reminderBot.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(tokens.PREFIX)) return;

    const args = message.content.slice(tokens.PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'تذكير':
                if (args.length < 1) {
                    return message.reply('استخدم: `!تذكير [النص]` لإنشاء تذكير');
                }
                
                const reminderText = args.join(' ');
                const reminderEmbed = createReminderEmbed('🔔 تذكير', reminderText);
                
                await message.channel.send({ embeds: [reminderEmbed] });
                await message.delete().catch(() => {});
                break;

            case 'تذكير_صورة':
                if (args.length < 2) {
                    return message.reply('استخدم: `!تذكير_صورة [رابط الصورة] [النص]`');
                }
                
                const imageUrl = args[0];
                const reminderWithImageText = args.slice(1).join(' ');
                const imageReminderEmbed = createReminderEmbed('🔔 تذكير مع صورة', reminderWithImageText, imageUrl);
                
                await message.channel.send({ embeds: [imageReminderEmbed] });
                await message.delete().catch(() => {});
                break;

            case 'اوامر_التذكير':
                const helpEmbed = createReminderEmbed(
                    '📋 أوامر بوت التذكيرات',
                    `**الأوامر المتاحة:**\n\n` +
                    `\`!تذكير [النص]\` - إنشاء تذكير عادي\n` +
                    `\`!تذكير_صورة [رابط] [النص]\` - تذكير مع صورة\n` +
                    `\`!اوامر_التذكير\` - عرض هذه القائمة`,
                    null,
                    0x3498db
                );
                
                await message.channel.send({ embeds: [helpEmbed] });
                break;
        }
    } catch (error) {
        console.error('خطأ في بوت التذكيرات:', error);
        message.reply('حدث خطأ أثناء تنفيذ الأمر.');
    }
});

// بوت التقييمات
reviewBot.on('ready', () => {
    console.log(`بوت التقييمات جاهز! مسجل باسم ${reviewBot.user.tag}`);
});

reviewBot.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // التحقق من وجود أرقام في الرسالة (تقييم من 1-5)
    const ratingMatch = message.content.match(/[1-5]/);
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
    reminderBot,
    reviewBot,
    createReminderEmbed,
    createReviewEmbed
};