const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, ChannelType } = require('discord.js');
const tokens = require('./tokens.js');

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

// دالة لإنشاء قائمة اختيار الرومات مع صفحات
const createChannelSelectMenu = (channels, guildId, page = 0) => {
    const selectedChannels = activityBot.selectedChannels.get(guildId) || [];
    const channelsArray = Array.from(channels.values());
    const pageSize = 25;
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;
    const pageChannels = channelsArray.slice(startIndex, endIndex);
    
    if (pageChannels.length === 0) {
        return null;
    }
    
    const options = pageChannels.map(channel => ({
        label: channel.name.length > 100 ? channel.name.substring(0, 97) + '...' : channel.name,
        value: channel.id,
        description: `${channel.members?.size || 0} عضو متصل`,
        default: selectedChannels.includes(channel.id)
    }));

    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`select_voice_channels_${page}`)
                .setPlaceholder(`اختر الرومات (صفحة ${page + 1}/${Math.ceil(channelsArray.length / pageSize)})`)
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

// دالة لإنشاء أزرار التحكم المتقدم
const createAdvancedControlButtons = (guildId, channelsCount, currentPage = 0) => {
    const selectedChannels = activityBot.selectedChannels.get(guildId) || [];
    const totalPages = Math.ceil(channelsCount / 25);
    
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('select_all_channels')
                .setLabel(`مراقبة جميع الرومات (${channelsCount})`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎤'),
            new ButtonBuilder()
                .setCustomId('deselect_all_channels')
                .setLabel('إلغاء تحديد الكل')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌')
        );
    
    const row2 = new ActionRowBuilder();
    
    // أزرار التنقل بين الصفحات
    if (totalPages > 1) {
        if (currentPage > 0) {
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_prev_${currentPage - 1}`)
                    .setLabel('الصفحة السابقة')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('◀️')
            );
        }
        
        if (currentPage < totalPages - 1) {
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_next_${currentPage + 1}`)
                    .setLabel('الصفحة التالية')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('▶️')
            );
        }
    }
    
    // عرض عدد الرومات المختارة
    row2.addComponents(
        new ButtonBuilder()
            .setCustomId('show_selected_count')
            .setLabel(`المختار: ${selectedChannels.length}`)
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true)
    );
    
    return row2.components.length > 0 ? [row1, row2] : [row1];
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
activityBot.once('clientReady', async () => {
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
                        ephemeral: true 
                    });
                    return;
                }
                
                const selectedChannels = activityBot.selectedChannels.get(guild.id) || [];
                
                const embed = new EmbedBuilder()
                    .setTitle('🎤 لوحة مراقبة نشاط الرومات الصوتية المحدثة')
                    .setDescription(
                        `**إجمالي الرومات الصوتية:** ${voiceChannels.size}\n` +
                        `**المختار حالياً:** ${selectedChannels.length}\n\n` +
                        '**الخيارات المتاحة:**\n' +
                        '🎤 **مراقبة جميع الرومات** - لمراقبة جميع الرومات تلقائياً\n' +
                        '📝 **اختيار محدد** - اختيار رومات معينة (مع التنقل بين الصفحات)\n' +
                        '❌ **إلغاء تحديد الكل** - لمسح الاختيارات\n\n' +
                        '**الميزات:**\n' +
                        '• مراقبة وقت دخول وخروج الأعضاء\n' +
                        '• حساب إجمالي الوقت المقضي\n' +
                        '• تقارير مفصلة عن النشاط\n' +
                        '• عرض أكثر الأعضاء نشاطاً\n' +
                        '• دعم أكثر من 200+ روم صوتي'
                    )
                    .setColor(0x00AE86)
                    .setTimestamp();
                
                const components = [];
                
                // إضافة قائمة الاختيار للصفحة الأولى
                const selectMenu = createChannelSelectMenu(voiceChannels, guild.id, 0);
                if (selectMenu) {
                    components.push(selectMenu);
                }
                
                // إضافة أزرار التحكم المتقدم
                const advancedButtons = createAdvancedControlButtons(guild.id, voiceChannels.size, 0);
                components.push(...advancedButtons);
                
                // إضافة أزرار التحكم الأساسية
                const controlButtons = createControlButtons(guild.id);
                components.push(controlButtons);
                
                await interaction.reply({
                    embeds: [embed],
                    components: components
                });
            }
            
            if (commandName === 'تقرير_النشاط' || commandName === 'activity_report') {
                const guildId = interaction.guild.id;
                const selectedChannels = activityBot.selectedChannels.get(guildId) || [];
                
                if (selectedChannels.length === 0) {
                    await interaction.reply({
                        content: 'لم يتم اختيار أي رومات للمراقبة! استخدم `/مراقبة_النشاط` أولاً.',
                        ephemeral: true
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
                        ephemeral: true
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
                    ephemeral: true
                });
            }
        }
    }
    
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_voice_channels')) {
        const guildId = interaction.guild.id;
        const selectedChannelIds = interaction.values;
        const currentPage = parseInt(interaction.customId.split('_').pop()) || 0;
        
        // دمج الاختيارات الجديدة مع الاختيارات السابقة
        let existingSelections = activityBot.selectedChannels.get(guildId) || [];
        
        // إزالة الاختيارات من هذه الصفحة أولاً
        const voiceChannels = interaction.guild.channels.cache
            .filter(channel => channel.type === ChannelType.GuildVoice);
        const channelsArray = Array.from(voiceChannels.values());
        const pageChannels = channelsArray.slice(currentPage * 25, (currentPage + 1) * 25);
        const pageChannelIds = pageChannels.map(c => c.id);
        
        existingSelections = existingSelections.filter(id => !pageChannelIds.includes(id));
        
        // إضافة الاختيارات الجديدة
        const updatedSelections = [...existingSelections, ...selectedChannelIds];
        activityBot.selectedChannels.set(guildId, updatedSelections);
        
        const channelNames = updatedSelections.map(id => {
            const channel = interaction.guild.channels.cache.get(id);
            return channel ? channel.name : 'روم غير معروف';
        });
        
        const embed = new EmbedBuilder()
            .setTitle('✅ تم تحديث اختيار الرومات')
            .setDescription(
                updatedSelections.length > 0 
                    ? `**إجمالي الرومات المختارة: ${updatedSelections.length}**\n\n${channelNames.slice(0, 20).map(name => `• ${name}`).join('\n')}${updatedSelections.length > 20 ? `\n... و ${updatedSelections.length - 20} روم آخر` : ''}`
                    : 'لم يتم اختيار أي رومات'
            )
            .setColor(0x00AE86)
            .setTimestamp();
        
        const components = [];
        
        // إضافة قائمة الاختيار للصفحة الحالية
        const selectMenu = createChannelSelectMenu(voiceChannels, guildId, currentPage);
        if (selectMenu) {
            components.push(selectMenu);
        }
        
        // إضافة أزرار التحكم المتقدم
        const advancedButtons = createAdvancedControlButtons(guildId, voiceChannels.size, currentPage);
        components.push(...advancedButtons);
        
        // إضافة أزرار التحكم الأساسية
        const controlButtons = createControlButtons(guildId);
        components.push(controlButtons);
        
        await interaction.update({
            embeds: [embed],
            components: components
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
                            ephemeral: true
                        });
                        return;
                    }
                    
                    const isCurrentlyTracking = activityBot.trackingActive.get(guildId) || false;
                    const newStatus = !isCurrentlyTracking;
                    activityBot.trackingActive.set(guildId, newStatus);
                    
                    // إذا بدأت المراقبة، سجل الأعضاء الموجودين حالياً في الرومات
                    if (newStatus) {
                        const currentTime = Date.now();
                        selectedChannels.forEach(channelId => {
                            const channel = interaction.guild.channels.cache.get(channelId);
                            if (channel && channel.members) {
                                channel.members.forEach(member => {
                                    if (!member.user.bot) {
                                        const userId = member.user.id;
                                        
                                        if (!activityBot.voiceActivity.has(userId)) {
                                            activityBot.voiceActivity.set(userId, {
                                                totalTime: 0,
                                                sessions: [],
                                                currentSession: null
                                            });
                                        }
                                        
                                        const userActivity = activityBot.voiceActivity.get(userId);
                                        
                                        // بدء جلسة جديدة للأعضاء الموجودين
                                        userActivity.currentSession = {
                                            channelId: channelId,
                                            channelName: channel.name,
                                            joinTime: currentTime,
                                            leaveTime: null,
                                            duration: 0
                                        };
                                        
                                        activityBot.voiceActivity.set(userId, userActivity);
                                    }
                                });
                            }
                        });
                        console.log(`تم تسجيل الأعضاء الموجودين حالياً في ${selectedChannels.length} روم للمراقبة`);
                    }
                    
                    const statusEmbed = new EmbedBuilder()
                        .setTitle(newStatus ? '▶️ تم بدء المراقبة' : '⏹️ تم إيقاف المراقبة')
                        .setDescription(
                            newStatus 
                                ? `بدأت مراقبة النشاط في ${selectedChannels.length} روم صوتي\n✅ تم تسجيل الأعضاء الموجودين حالياً`
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
                            ephemeral: true
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
                            ephemeral: true
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
                    
                    await interaction.reply({ embeds: [detailedEmbed], ephemeral: true });
                    break;
                    
                case 'clear_activity_data':
                    activityBot.voiceActivity.clear();
                    
                    const clearEmbed = new EmbedBuilder()
                        .setTitle('🗑️ تم مسح البيانات')
                        .setDescription('تم مسح جميع بيانات النشاط المحفوظة')
                        .setColor(0x95a5a6)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [clearEmbed], ephemeral: true });
                    break;
                    
                case 'select_all_channels':
                    const guildIdForAll = interaction.guild.id;
                    const allVoiceChannels = interaction.guild.channels.cache
                        .filter(channel => channel.type === ChannelType.GuildVoice);
                    const allChannelIds = Array.from(allVoiceChannels.keys());
                    
                    activityBot.selectedChannels.set(guildIdForAll, allChannelIds);
                    
                    const allSelectedEmbed = new EmbedBuilder()
                        .setTitle('✅ تم اختيار جميع الرومات الصوتية')
                        .setDescription(`تم اختيار جميع الرومات الصوتية (${allChannelIds.length} روم) للمراقبة.\n\nيمكنك الآن بدء المراقبة لتتبع نشاط جميع الأعضاء في كل الرومات الصوتية.`)
                        .setColor(0x00AE86)
                        .setTimestamp();
                    
                    const allControlButtons = createControlButtons(guildIdForAll);
                    
                    await interaction.update({
                        embeds: [allSelectedEmbed],
                        components: [allControlButtons]
                    });
                    break;
                    
                case 'deselect_all_channels':
                    const guildIdForNone = interaction.guild.id;
                    activityBot.selectedChannels.set(guildIdForNone, []);
                    
                    const noSelectionEmbed = new EmbedBuilder()
                        .setTitle('❌ تم إلغاء تحديد جميع الرومات')
                        .setDescription('تم إلغاء تحديد جميع الرومات الصوتية.\nيمكنك اختيار رومات محددة أو اختيار جميع الرومات مرة أخرى.')
                        .setColor(0xe74c3c)
                        .setTimestamp();
                    
                    // إعادة عرض قائمة الاختيار
                    const voiceChannelsForDeselect = interaction.guild.channels.cache
                        .filter(channel => channel.type === ChannelType.GuildVoice)
                        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
                    
                    const componentsForDeselect = [];
                    
                    const selectMenuForDeselect = createChannelSelectMenu(voiceChannelsForDeselect, guildIdForNone, 0);
                    if (selectMenuForDeselect) {
                        componentsForDeselect.push(selectMenuForDeselect);
                    }
                    
                    const advancedButtonsForDeselect = createAdvancedControlButtons(guildIdForNone, voiceChannelsForDeselect.size, 0);
                    componentsForDeselect.push(...advancedButtonsForDeselect);
                    
                    const controlButtonsForDeselect = createControlButtons(guildIdForNone);
                    componentsForDeselect.push(controlButtonsForDeselect);
                    
                    await interaction.update({
                        embeds: [noSelectionEmbed],
                        components: componentsForDeselect
                    });
                    break;
                    
                default:
                    // التعامل مع أزرار التنقل بين الصفحات
                    if (interaction.customId.startsWith('page_')) {
                        const parts = interaction.customId.split('_');
                        const direction = parts[1]; // 'prev' أو 'next'
                        const targetPage = parseInt(parts[2]);
                        
                        const guildIdForPage = interaction.guild.id;
                        const voiceChannelsForPage = interaction.guild.channels.cache
                            .filter(channel => channel.type === ChannelType.GuildVoice)
                            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
                        
                        const selectedChannelsForPage = activityBot.selectedChannels.get(guildIdForPage) || [];
                        
                        const pageEmbed = new EmbedBuilder()
                            .setTitle(`🎤 صفحة ${targetPage + 1} - اختيار الرومات الصوتية`)
                            .setDescription(`**إجمالي الرومات:** ${voiceChannelsForPage.size}\n**المختار حالياً:** ${selectedChannelsForPage.length}`)
                            .setColor(0x00AE86)
                            .setTimestamp();
                        
                        const componentsForPage = [];
                        
                        const selectMenuForPage = createChannelSelectMenu(voiceChannelsForPage, guildIdForPage, targetPage);
                        if (selectMenuForPage) {
                            componentsForPage.push(selectMenuForPage);
                        }
                        
                        const advancedButtonsForPage = createAdvancedControlButtons(guildIdForPage, voiceChannelsForPage.size, targetPage);
                        componentsForPage.push(...advancedButtonsForPage);
                        
                        const controlButtonsForPage = createControlButtons(guildIdForPage);
                        componentsForPage.push(controlButtonsForPage);
                        
                        await interaction.update({
                            embeds: [pageEmbed],
                            components: componentsForPage
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('خطأ في معالجة أزرار مراقبة النشاط:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'حدث خطأ أثناء معالجة العملية!',
                    ephemeral: true
                });
            }
        }
    }
});

module.exports = {
    activityBot,
    registerActivityCommands
};