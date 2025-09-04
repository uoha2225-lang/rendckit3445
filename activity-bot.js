const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, ChannelType } = require('discord.js');
const tokens = require('./tokens');

// بوت مراقبة النشاط
const activityBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// تخزين بيانات النشاط
activityBot.voiceActivity = new Map(); // {userId: {channelId, joinTime, totalTime, sessions: []}}
activityBot.selectedChannels = new Map(); // {guildId: [channelIds]}
activityBot.trackingActive = new Map(); // {guildId: boolean}

// دالة لحساب الوقت المنقضي
const formatDuration = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}س ${minutes % 60}د ${seconds % 60}ث`;
    } else if (minutes > 0) {
        return `${minutes}د ${seconds % 60}ث`;
    } else {
        return `${seconds}ث`;
    }
};

// دالة لإنشاء قائمة اختيار الرومات
const createChannelSelectMenu = (channels, guildId) => {
    const selectedChannels = activityBot.selectedChannels.get(guildId) || [];
    
    // أخذ أول 25 روم فقط (حد Discord الأقصى)
    const limitedChannels = Array.from(channels.values()).slice(0, 25);
    
    const options = limitedChannels.map(channel => ({
        label: channel.name.length > 100 ? channel.name.substring(0, 97) + '...' : channel.name,
        value: channel.id,
        description: `${channel.members?.size || 0} عضو متصل`,
        default: selectedChannels.includes(channel.id)
    }));

    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_voice_channels')
                .setPlaceholder('اختر الرومات الصوتية للمراقبة (أول 25 روم)')
                .setMinValues(0)
                .setMaxValues(Math.min(options.length, 25))
                .addOptions(options)
        );
};

// دالة لإنشاء أزرار التحكم
const createControlButtons = (guildId) => {
    const isTracking = activityBot.trackingActive.get(guildId) || false;
    
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('start_tracking')
                .setLabel(isTracking ? 'إيقاف المراقبة' : 'بدء المراقبة')
                .setStyle(isTracking ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji(isTracking ? '⏹️' : '▶️'),
            new ButtonBuilder()
                .setCustomId('show_activity_report')
                .setLabel('عرض تقرير النشاط')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📊'),
            new ButtonBuilder()
                .setCustomId('clear_activity_data')
                .setLabel('مسح البيانات')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🗑️')
        );
};

// أوامر البوت
const activityCommands = [
    new SlashCommandBuilder()
        .setName('مراقبة_النشاط')
        .setDescription('فتح لوحة مراقبة نشاط الأعضاء في الرومات الصوتية'),
    new SlashCommandBuilder()
        .setName('activity_monitor')
        .setDescription('Open activity monitoring panel for voice channels'),
    new SlashCommandBuilder()
        .setName('تقرير_النشاط')
        .setDescription('عرض تقرير مفصل عن نشاط الأعضاء'),
    new SlashCommandBuilder()
        .setName('activity_report')
        .setDescription('Show detailed activity report')
];

// تسجيل الأوامر
async function registerActivityCommands() {
    try {
        if (tokens.ACTIVITY_BOT_TOKEN && activityBot.user) {
            const rest = new REST({ version: '10' }).setToken(tokens.ACTIVITY_BOT_TOKEN);
            
            console.log('بدء تسجيل أوامر بوت مراقبة النشاط...');
            
            await rest.put(
                Routes.applicationCommands(activityBot.user.id),
                { body: activityCommands }
            );
            
            console.log('✅ تم تسجيل أوامر بوت مراقبة النشاط بنجاح');
        }
    } catch (error) {
        console.error('خطأ في تسجيل أوامر بوت مراقبة النشاط:', error);
    }
}

// حدث جاهزية البوت
activityBot.once('ready', async () => {
    console.log(`بوت مراقبة النشاط جاهز! مسجل باسم ${activityBot.user.tag}`);
    await registerActivityCommands();
});

// مراقبة دخول وخروج الأعضاء من الرومات الصوتية
activityBot.on('voiceStateUpdate', (oldState, newState) => {
    const guildId = newState.guild.id;
    const isTracking = activityBot.trackingActive.get(guildId);
    
    if (!isTracking) return;
    
    const selectedChannels = activityBot.selectedChannels.get(guildId) || [];
    const userId = newState.id;
    const currentTime = Date.now();
    
    // التأكد من وجود بيانات المستخدم
    if (!activityBot.voiceActivity.has(userId)) {
        activityBot.voiceActivity.set(userId, {
            totalTime: 0,
            sessions: [],
            currentSession: null
        });
    }
    
    const userActivity = activityBot.voiceActivity.get(userId);
    
    // دخول إلى روم صوتي
    if (!oldState.channelId && newState.channelId && selectedChannels.includes(newState.channelId)) {
        userActivity.currentSession = {
            channelId: newState.channelId,
            channelName: newState.channel.name,
            joinTime: currentTime,
            leaveTime: null,
            duration: 0
        };
    }
    
    // خروج من روم صوتي
    if (oldState.channelId && !newState.channelId && selectedChannels.includes(oldState.channelId)) {
        if (userActivity.currentSession && userActivity.currentSession.channelId === oldState.channelId) {
            const duration = currentTime - userActivity.currentSession.joinTime;
            userActivity.currentSession.leaveTime = currentTime;
            userActivity.currentSession.duration = duration;
            userActivity.totalTime += duration;
            
            userActivity.sessions.push({...userActivity.currentSession});
            userActivity.currentSession = null;
        }
    }
    
    // التنقل بين الرومات
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // خروج من الروم القديم
        if (selectedChannels.includes(oldState.channelId) && userActivity.currentSession) {
            const duration = currentTime - userActivity.currentSession.joinTime;
            userActivity.currentSession.leaveTime = currentTime;
            userActivity.currentSession.duration = duration;
            userActivity.totalTime += duration;
            
            userActivity.sessions.push({...userActivity.currentSession});
            userActivity.currentSession = null;
        }
        
        // دخول إلى الروم الجديد
        if (selectedChannels.includes(newState.channelId)) {
            userActivity.currentSession = {
                channelId: newState.channelId,
                channelName: newState.channel.name,
                joinTime: currentTime,
                leaveTime: null,
                duration: 0
            };
        }
    }
    
    activityBot.voiceActivity.set(userId, userActivity);
});

// معالجة التفاعلات
activityBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        
        try {
            if (commandName === 'مراقبة_النشاط' || commandName === 'activity_monitor') {
                const guild = interaction.guild;
                const voiceChannels = guild.channels.cache
                    .filter(channel => channel.type === ChannelType.GuildVoice)
                    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
                
                if (voiceChannels.size === 0) {
                    await interaction.reply({ 
                        content: 'لا توجد رومات صوتية في هذا السيرفر!', 
                        flags: [64] 
                    });
                    return;
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('🎤 لوحة مراقبة نشاط الرومات الصوتية')
                    .setDescription(
                        'استخدم القائمة المنسدلة لاختيار الرومات التي تريد مراقبتها\n' +
                        'يمكنك اختيار أكثر من روم واحد (حتى 25 روم)\n\n' +
                        '**الميزات:**\n' +
                        '• مراقبة وقت دخول وخروج الأعضاء\n' +
                        '• حساب إجمالي الوقت المقضي\n' +
                        '• تقارير مفصلة عن النشاط\n' +
                        '• عرض أكثر الأعضاء نشاطاً'
                    )
                    .setColor(0x00AE86)
                    .setTimestamp();
                
                const selectMenu = createChannelSelectMenu(voiceChannels, guild.id);
                const controlButtons = createControlButtons(guild.id);
                
                await interaction.reply({
                    embeds: [embed],
                    components: [selectMenu, controlButtons]
                });
            }
            
            if (commandName === 'تقرير_النشاط' || commandName === 'activity_report') {
                const guildId = interaction.guild.id;
                const selectedChannels = activityBot.selectedChannels.get(guildId) || [];
                
                if (selectedChannels.length === 0) {
                    await interaction.reply({
                        content: 'لم يتم اختيار أي رومات للمراقبة! استخدم `/مراقبة_النشاط` أولاً.',
                        flags: [64]
                    });
                    return;
                }
                
                // إنشاء تقرير النشاط
                const activityData = Array.from(activityBot.voiceActivity.entries())
                    .filter(([userId, data]) => data.totalTime > 0 || data.currentSession)
                    .sort(([, a], [, b]) => {
                        const aTotal = a.totalTime + (a.currentSession ? Date.now() - a.currentSession.joinTime : 0);
                        const bTotal = b.totalTime + (b.currentSession ? Date.now() - b.currentSession.joinTime : 0);
                        return bTotal - aTotal;
                    });
                
                if (activityData.length === 0) {
                    await interaction.reply({
                        content: 'لا توجد بيانات نشاط حتى الآن!',
                        flags: [64]
                    });
                    return;
                }
                
                // أكثر الأعضاء نشاطاً (أول 10)
                const topActive = activityData.slice(0, 10);
                let reportText = '**🏆 أكثر الأعضاء نشاطاً:**\n\n';
                
                for (let i = 0; i < topActive.length; i++) {
                    const [userId, data] = topActive[i];
                    const currentTime = data.currentSession ? Date.now() - data.currentSession.joinTime : 0;
                    const totalTime = data.totalTime + currentTime;
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    
                    reportText += `${medal} <@${userId}> - ${formatDuration(totalTime)}\n`;
                    
                    if (data.currentSession) {
                        reportText += `   📍 متصل حالياً في: ${data.currentSession.channelName}\n`;
                    }
                    reportText += '\n';
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('📊 تقرير نشاط الرومات الصوتية')
                    .setDescription(reportText)
                    .addFields({
                        name: 'إجمالي الأعضاء المتفاعلين',
                        value: activityData.length.toString(),
                        inline: true
                    }, {
                        name: 'الرومات تحت المراقبة',
                        value: selectedChannels.length.toString(),
                        inline: true
                    })
                    .setColor(0x3498db)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('خطأ في معالجة أمر مراقبة النشاط:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'حدث خطأ أثناء معالجة الأمر!',
                    flags: [64]
                });
            }
        }
    }
    
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_voice_channels') {
        const guildId = interaction.guild.id;
        const selectedChannelIds = interaction.values;
        
        activityBot.selectedChannels.set(guildId, selectedChannelIds);
        
        const channelNames = selectedChannelIds.map(id => {
            const channel = interaction.guild.channels.cache.get(id);
            return channel ? channel.name : 'روم غير معروف';
        });
        
        const embed = new EmbedBuilder()
            .setTitle('✅ تم تحديث اختيار الرومات')
            .setDescription(
                selectedChannelIds.length > 0 
                    ? `**الرومات المختارة (${selectedChannelIds.length}):**\n${channelNames.map(name => `• ${name}`).join('\n')}`
                    : 'لم يتم اختيار أي رومات'
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        const controlButtons = createControlButtons(guildId);
        
        await interaction.update({
            embeds: [embed],
            components: [controlButtons]
        });
    }
    
    if (interaction.isButton()) {
        const guildId = interaction.guild.id;
        
        try {
            switch (interaction.customId) {
                case 'start_tracking':
                    const selectedChannels = activityBot.selectedChannels.get(guildId) || [];
                    
                    if (selectedChannels.length === 0) {
                        await interaction.reply({
                            content: 'يجب اختيار روم واحد على الأقل قبل بدء المراقبة!',
                            flags: [64]
                        });
                        return;
                    }
                    
                    const isCurrentlyTracking = activityBot.trackingActive.get(guildId) || false;
                    activityBot.trackingActive.set(guildId, !isCurrentlyTracking);
                    
                    const newStatus = !isCurrentlyTracking;
                    const statusEmbed = new EmbedBuilder()
                        .setTitle(newStatus ? '▶️ تم بدء المراقبة' : '⏹️ تم إيقاف المراقبة')
                        .setDescription(
                            newStatus 
                                ? `بدأت مراقبة النشاط في ${selectedChannels.length} روم صوتي`
                                : 'تم إيقاف مراقبة النشاط'
                        )
                        .setColor(newStatus ? 0x00AE86 : 0xe74c3c)
                        .setTimestamp();
                    
                    const updatedButtons = createControlButtons(guildId);
                    
                    await interaction.update({
                        embeds: [statusEmbed],
                        components: [updatedButtons]
                    });
                    break;
                    
                case 'show_activity_report':
                    // عرض تقرير مفصل
                    const selectedChannelsForReport = activityBot.selectedChannels.get(guildId) || [];
                    
                    if (selectedChannelsForReport.length === 0) {
                        await interaction.reply({
                            content: 'لم يتم اختيار أي رومات للمراقبة!',
                            flags: [64]
                        });
                        return;
                    }
                    
                    const detailedActivityData = Array.from(activityBot.voiceActivity.entries())
                        .filter(([userId, data]) => data.sessions.length > 0 || data.currentSession)
                        .sort(([, a], [, b]) => {
                            const aTotal = a.totalTime + (a.currentSession ? Date.now() - a.currentSession.joinTime : 0);
                            const bTotal = b.totalTime + (b.currentSession ? Date.now() - b.currentSession.joinTime : 0);
                            return bTotal - aTotal;
                        });
                    
                    if (detailedActivityData.length === 0) {
                        await interaction.reply({
                            content: 'لا توجد بيانات نشاط مفصلة حتى الآن!',
                            flags: [64]
                        });
                        return;
                    }
                    
                    // تقرير مفصل لأول 5 أعضاء
                    const topUsers = detailedActivityData.slice(0, 5);
                    let detailedReport = '';
                    
                    for (const [userId, data] of topUsers) {
                        const currentTime = data.currentSession ? Date.now() - data.currentSession.joinTime : 0;
                        const totalTime = data.totalTime + currentTime;
                        
                        detailedReport += `**<@${userId}>** - إجمالي: ${formatDuration(totalTime)}\n`;
                        
                        if (data.currentSession) {
                            detailedReport += `📍 متصل حالياً: ${data.currentSession.channelName} (منذ ${formatDuration(currentTime)})\n`;
                        }
                        
                        // آخر 3 جلسات
                        const recentSessions = data.sessions.slice(-3);
                        if (recentSessions.length > 0) {
                            detailedReport += '📝 الجلسات الأخيرة:\n';
                            recentSessions.forEach(session => {
                                const joinDate = new Date(session.joinTime).toLocaleString('ar-SA');
                                detailedReport += `  • ${session.channelName}: ${formatDuration(session.duration)} (${joinDate})\n`;
                            });
                        }
                        detailedReport += '\n';
                    }
                    
                    const detailedEmbed = new EmbedBuilder()
                        .setTitle('📋 تقرير النشاط المفصل')
                        .setDescription(detailedReport)
                        .setColor(0x9b59b6)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [detailedEmbed], flags: [64] });
                    break;
                    
                case 'clear_activity_data':
                    activityBot.voiceActivity.clear();
                    
                    const clearEmbed = new EmbedBuilder()
                        .setTitle('🗑️ تم مسح البيانات')
                        .setDescription('تم مسح جميع بيانات النشاط المحفوظة')
                        .setColor(0x95a5a6)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [clearEmbed], flags: [64] });
                    break;
            }
        } catch (error) {
            console.error('خطأ في معالجة أزرار مراقبة النشاط:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'حدث خطأ أثناء معالجة العملية!',
                    flags: [64]
                });
            }
        }
    }
});

module.exports = {
    activityBot,
    registerActivityCommands
};