const { ticketBot, reviewBot, activityBot } = require('./client');
const tokens = require('./tokens');
const http = require('http');

// إنشاء HTTP server لـ Render health checks
const server = http.createServer((req, res) => {
    // إعداد CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // health check endpoint
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            message: 'البوتات تعمل بنجاح',
            bots: {
                ticket_bot: ticketBot.user ? ticketBot.user.tag : 'غير متصل',
                review_bot: reviewBot.user ? reviewBot.user.tag : 'غير متصل',
                activity_bot: activityBot.user ? activityBot.user.tag : 'غير متصل'
            },
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP Server يعمل على البورت ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// حل graceful shutdown
process.on('SIGTERM', () => {
    console.log('💴 تم استلام إشارة SIGTERM, بدء إغلاق الخادم...');
    server.close(() => {
        console.log('🔴 تم إغلاق HTTP Server');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('💴 تم استلام إشارة SIGINT, بدء إغلاق الخادم...');
    server.close(() => {
        console.log('🔴 تم إغلاق HTTP Server');
        process.exit(0);
    });
});

// دالة لبدء تشغيل البوتات
async function startBots() {
    try {
        console.log('🚀 بدء تشغيل البوتات...');
        
        let botsStarted = 0;
        
        // تشغيل بوت التذاكر
        if (tokens.REMINDER_BOT_TOKEN) {
            try {
                await ticketBot.login(tokens.REMINDER_BOT_TOKEN);
                console.log('✅ تم تشغيل بوت التذاكر بنجاح');
                botsStarted++;
            } catch (error) {
                console.error('❌ خطأ في تشغيل بوت التذاكر:', error.message);
            }
        } else {
            console.log('⚠️ تم تخطي بوت التذاكر - لا يوجد REMINDER_BOT_TOKEN في متغيرات البيئة');
        }
        
        // تشغيل بوت التقييمات
        if (tokens.REVIEW_BOT_TOKEN) {
            try {
                await reviewBot.login(tokens.REVIEW_BOT_TOKEN);
                console.log('✅ تم تشغيل بوت التقييمات بنجاح');
                botsStarted++;
            } catch (error) {
                console.error('❌ خطأ في تشغيل بوت التقييمات:', error.message);
            }
        } else {
            console.log('⚠️ تم تخطي بوت التقييمات - لا يوجد REVIEW_BOT_TOKEN في متغيرات البيئة');
        }
        
        // تشغيل بوت مراقبة النشاط
        if (tokens.ACTIVITY_BOT_TOKEN) {
            try {
                await activityBot.login(tokens.ACTIVITY_BOT_TOKEN);
                console.log('✅ تم تشغيل بوت مراقبة النشاط بنجاح');
                botsStarted++;
            } catch (error) {
                console.error('❌ خطأ في تشغيل بوت مراقبة النشاط:', error.message);
            }
        } else {
            console.log('⚠️ تم تخطي بوت مراقبة النشاط - لا يوجد ACTIVITY_BOT_TOKEN في متغيرات البيئة');
        }
        
        if (botsStarted === 0) {
            console.log('\n⚠️ لم يتم تشغيل أي بوت! يرجى تعيين متغيرات البيئة التالية:');
            console.log('   - REMINDER_BOT_TOKEN: لبوت التذاكر');
            console.log('   - REVIEW_BOT_TOKEN: لبوت التقييمات');
            console.log('   - ACTIVITY_BOT_TOKEN: لبوت مراقبة النشاط');
            console.log('\n📝 لتشغيل البوتات على Render، أضف هذه المتغيرات في Environment Variables');
        }
        
        console.log('\n🚀 تم تشغيل جميع البوتات المتاحة!');
        console.log('\n🎫 أوامر بوت التذاكر (Slash Commands):');
        console.log('   /تذكرة - فتح نظام التذاكر مع الأزرار');
        console.log('   /ticket - Open ticket system (English)');
        console.log('   /help - عرض الأوامر');
        console.log('   • الأزرار: شكوى على إدارة عليا | تعويض | نقل | شكوى على إداري');
        console.log('\n⭐ بوت التقييمات (Slash Commands + Text):');
        console.log('   /تقييم [rating] - إرسال تقييم بالنجوم');
        console.log('   /review [rating] - Send star rating (English)');
        console.log('   أو اكتب رقم من 1-5 في أي رسالة (الطريقة القديمة)');
        console.log('\n🎤 بوت مراقبة النشاط (Activity Tracking):');
        console.log('   /مراقبة_النشاط - فتح لوحة مراقبة النشاط');
        console.log('   /activity_monitor - Open activity monitoring panel (English)');
        console.log('   /تقرير_النشاط - عرض تقرير مفصل');
        console.log('   • ميزات: مراقبة الرومات الصوتية | حساب وقت التفاعل | تقارير مفصلة');
        
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