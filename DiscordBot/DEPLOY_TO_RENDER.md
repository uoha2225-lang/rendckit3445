# دليل رفع البوتات على Render

## المتطلبات الأساسية
1. **حساب Render مجاني أو مدفوع**
2. **التوكنات الثلاثة للبوتات من Discord Developer Portal**

## خطوات الرفع على Render

### 1. إنشاء الخدمة
- اذهب إلى [render.com](https://render.com)
- اضغط على "New +" ثم "Web Service"
- ربط GitHub repository أو رفع الملفات مباشرة

### 2. إعدادات الخدمة
```yaml
Name: discord-bots
Environment: Node
Region: Oregon (موصى به)
Branch: main
Build Command: npm install
Start Command: npm start
```

### 3. متغيرات البيئة (Environment Variables)
أضف المتغيرات التالية في قسم Environment:

| المفتاح | الوصف | مطلوب |
|---------|-------|--------|
| `REMINDER_BOT_TOKEN` | توكن بوت التذاكر | ✅ |
| `REVIEW_BOT_TOKEN` | توكن بوت التقييمات | ✅ |
| `ACTIVITY_BOT_TOKEN` | توكن بوت مراقبة النشاط | ✅ |
| `NODE_ENV` | production | ✅ |

### 4. الخطة المناسبة
- **Free Plan**: مجاني لكن ينطفئ بعد 15 دقيقة من عدم النشاط
- **Starter Plan ($7/شهر)**: يعمل 24/7 بدون انقطاع (موصى به للبوتات)

### 5. Health Check
الخدمة تحتوي على endpoint للتحقق من الصحة:
- `/` أو `/health` - يعرض حالة البوتات

## استكشاف الأخطاء

### خطأ Exit Status 1
إذا واجهت هذا الخطأ:
1. تأكد من إضافة جميع متغيرات البيئة
2. تحقق من صحة التوكنات
3. تأكد من الخطة المناسبة للبوتات (Starter أو أعلى)

### البوتات لا تستجيب
1. تحقق من Logs في لوحة تحكم Render
2. تأكد من permissions البوتات في Discord
3. تحقق من وجود البوتات في السيرفر

### نصائح مهمة
- استخدم Starter Plan أو أعلى للبوتات التي تحتاج العمل 24/7
- احتفظ بنسخة احتياطية من التوكنات
- راقب استخدام الموارد في لوحة التحكم

## الدعم
إذا واجهت مشاكل، تحقق من:
1. Render Logs
2. Discord Developer Portal
3. توثيق discord.js