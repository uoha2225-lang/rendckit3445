const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, SlashCommandBuilder, REST, Routes } = require('discord.js');
const tokens = require('./tokens.js');

// إعداد العميل للبوتات
const createBotClient = (intents = []) => {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            ...intents
        ]
    });
};

const ticketBot = createBotClient();
const reviewBot = createBotClient();

ticketBot.ticketRoles = new Collection();

// دالة إرسال سجل التذاكر
async function sendTicketLog(guild, user, type, ticketChannel) {
    try {
        const logChannelId = '1341793744654536704'; // قم بتغيير هذا المعرف لقناة السجلات الخاصة بك
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const messages = await ticketChannel.messages.fetch({ limit: 50 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        let transcript = sortedMessages.map(m => `[${m.createdAt.toLocaleString('ar-SA')}] ${m.author.tag}: ${m.content}`).join('\n');

        const logEmbed = new EmbedBuilder()
            .setTitle('سجل إغلاق تذكرة')
            .addFields(
                { name: 'صاحب التذكرة', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'نوع التذكرة', value: type, inline: true },
                { name: 'القناة', value: ticketChannel.name, inline: true }
            )
            .setColor(0xff0000)
            .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
        // يمكن إرسال الترانسكربت كملف إذا كان طويلاً
    } catch (error) {
        console.error('خطأ في إرسال سجل التذكرة:', error);
    }
}

// معالجة أوامر بوت التذاكر
ticketBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'تذكرة' || interaction.commandName === 'ticket') {
            const embed = new EmbedBuilder()
                .setTitle('نظام التذاكر | Ticket System')
                .setDescription('يرجى اختيار القسم المناسب لفتح تذكرة:')
                .setColor(0x00ff00);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('high_admin_complaint').setLabel('شكوى على إدارة عليا').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('compensation').setLabel('تعويض').setStyle(ButtonStyle.Success)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('transfer').setLabel('نقل').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('admin_complaint').setLabel('شكوى على إداري').setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({ embeds: [embed], components: [row1, row2] });
        }
    }

    if (interaction.isButton()) {
        const { customId, guild, user } = interaction;
        let type = '';
        if (customId === 'high_admin_complaint') type = 'شكوى-إدارة-عليا';
        else if (customId === 'compensation') type = 'تعويض';
        else if (customId === 'transfer') type = 'نقل';
        else if (customId === 'admin_complaint') type = 'شكوى-إداري';

        if (type) {
            const channel = await guild.channels.create({
                name: `${type}-${user.username}`,
                permissionOverwrites: [
                    { id: guild.id, deny: [GatewayIntentBits.ViewChannel] },
                    { id: user.id, allow: [GatewayIntentBits.ViewChannel, GatewayIntentBits.SendMessages] }
                ]
            });

            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`تذكرة ${type}`)
                .setDescription(`أهلاً بك ${user}، يرجى كتابة تفاصيل طلبك هنا.`)
                .setColor(0x00ff00);

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger)
            );

            await channel.send({ embeds: [welcomeEmbed], components: [closeRow] });
            await interaction.reply({ content: `تم فتح التذكرة في ${channel}`, ephemeral: true });
        }

        if (customId === 'close_ticket') {
            await interaction.reply('سيتم إغلاق التذكرة خلال 5 ثوانٍ...');
            setTimeout(() => interaction.channel.delete(), 5000);
        }
    }
});

// معالجة بوت التقييمات
reviewBot.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const rating = parseInt(message.content);
    if (!isNaN(rating) && rating >= 1 && rating <= 5) {
        const stars = '⭐'.repeat(rating);
        const embed = new EmbedBuilder()
            .setTitle('تقييم جديد')
            .setDescription(`قام ${message.author} بتقييمنا بـ ${rating} نجوم\n${stars}`)
            .setColor(0xffff00)
            .setTimestamp();
        
        await message.channel.send({ embeds: [embed] });
        await message.delete();
    }
});

module.exports = { ticketBot, reviewBot };
