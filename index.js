const { reminderBot, reviewBot } = require('./client');
const tokens = require('./tokens');

// دالة لبدء تشغيل البوتات
async function startBots() {
    try {
        console.log('بدء تشغيل البوتات...');
        
        // التحقق من وجود التوكنات
        if (!tokens.REMINDER_BOT_TOKEN) {
            console.warn('تحذير: لم يتم تعيين REMINDER_BOT_TOKEN');
        }
        
        if (!tokens.REVIEW_BOT_TOKEN) {
            console.warn('تحذير: لم يتم تعيين REVIEW_BOT_TOKEN');
        }
        
        // تشغيل بوت التذكيرات
        if (tokens.REMINDER_BOT_TOKEN) {
            await reminderBot.login(tokens.REMINDER_BOT_TOKEN);
            console.log('✅ تم تشغيل بوت التذكيرات بنجاح');
        } else {
            console.log('⚠️ تم تخطي بوت التذكيرات - لا يوجد توكن');
        }
        
        // تشغيل بوت التقييمات
        if (tokens.REVIEW_BOT_TOKEN) {
            await reviewBot.login(tokens.REVIEW_BOT_TOKEN);
            console.log('✅ تم تشغيل بوت التقييمات بنجاح');
        } else {
            console.log('⚠️ تم تخطي بوت التقييمات - لا يوجد توكن');
        }
        
        console.log('\n🚀 تم تشغيل جميع البوتات المتاحة!');
        console.log('\n📝 أوامر بوت التذكيرات:');
        console.log('   !تذكير [النص] - إنشاء تذكير عادي');
        console.log('   !تذكير_صورة [رابط] [النص] - تذكير مع صورة');
        console.log('   !اوامر_التذكير - عرض الأوامر');
        console.log('\n⭐ بوت التقييمات:');
        console.log('   يعمل تلقائياً عند كتابة رقم من 1-5 في أي رسالة');
        
    } catch (error) {
        console.error('خطأ في تشغيل البوتات:', error);
        process.exit(1);
    }
}

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// بدء تشغيل البوتات
startBots();