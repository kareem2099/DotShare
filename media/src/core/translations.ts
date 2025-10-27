import { currentLang } from './utils';

// Embedded translations to avoid webview file loading issues
export const translations: {[key: string]: {[key: string]: string}} = {
    "title": {
        "en": "DotShare",
        "ar": "DotShare",
        "ru": "DotShare"
    },
    "subtitle": {
        "en": "Share your ideas across multiple platforms with AI-powered posts",
        "ar": "شارك أفكارك عبر منصات متعددة مع المنشورات بالذكاء الاصطناعي",
        "ru": "Делитесь своими идеями на различных платформах с постами на базе ИИ"
    },
    "socialMedia": {
        "en": "Social Media",
        "ar": "وسائل التواصل الاجتماعي",
        "ru": "Социальные сети"
    },
    "postGen": {
        "en": "Post Generation",
        "ar": "توليد المنشور",
        "ru": "Генерация поста"
    },
    "generateAI": {
        "en": "Generate AI Post",
        "ar": "توليد منشور بالذكاء الاصطناعي",
        "ru": "Генерировать пост ИИ"
    },
    "shareLinkedIn": {
        "en": "Share to LinkedIn",
        "ar": "مشاركة على LinkedIn",
        "ru": "Поделиться в LinkedIn"
    },
    "shareTelegram": {
        "en": "Share to Telegram",
        "ar": "مشاركة على Telegram",
        "ru": "Поделиться в Telegram"
    },
    "generatedPost": {
        "en": "Generated Post",
        "ar": "المنشور المولد",
        "ru": "Сгенерированный пост"
    },
    "placeholder": {
        "en": "Your AI-generated post will appear here...",
        "ar": "سيظهر منشورك بالذكاء الاصطناعي هنا...",
        "ru": "Ваш пост, созданный ИИ, появится здесь..."
    },
    "chooseAIModel": {
        "en": "Choose AI Model",
        "ar": "اختر نموذج الذكاء الاصطناعي",
        "ru": "Выбрать модель ИИ"
    },
    "noProvider": {
        "en": "No provider selected - Click to configure",
        "ar": "لم يتم اختيار مزود - اضغط للتكوين",
        "ru": "Провайдер не выбран - нажмите для настройки"
    },
    "lightMode": {
        "en": "Light Mode",
        "ar": "الوضع الفاتح",
        "ru": "Светлая тема"
    },
    "darkMode": {
        "en": "Dark Mode",
        "ar": "الوضع المظلم",
        "ru": "Тёмная тема"
    },
    "optional": {
        "en": "Optional",
        "ar": "اختياري",
        "ru": "Необязательно"
    },
    "required": {
        "en": "Required",
        "ar": "مطلوب",
        "ru": "Обязательно"
    },
    "linkedinDesc": {
        "en": "Share directly to your LinkedIn feed",
        "ar": "مشاركة مباشرة في خلاصة LinkedIn الخاصة بك",
        "ru": "Делиться напрямую в вашу ленту LinkedIn"
    },
    "telegramDesc": {
        "en": "Send posts to Telegram channels or groups",
        "ar": "إرسال المنشورات إلى قنوات Telegram أو المجموعات",
        "ru": "Отправлять посты в каналы или группы Telegram"
    },
    "accessTokenLabel": {
        "en": "Access Token",
        "ar": "رمز الوصول",
        "ru": "Токен доступа"
    },
    "linkedinTokenPlaceholder": {
        "en": "Enter your LinkedIn Access Token",
        "ar": "أدخل رمز الوصول إلى LinkedIn الخاص بك",
        "ru": "Введите ваш токен доступа к LinkedIn"
    },
    "botTokenLabel": {
        "en": "Bot Token",
        "ar": "رمز البوت",
        "ru": "Токен бота"
    },
    "telegramBotPlaceholder": {
        "en": "Enter your Telegram Bot Token",
        "ar": "أدخل رمز بوت Telegram الخاص بك",
        "ru": "Введите токен вашего бота Telegram"
    },
    "chatIdLabel": {
        "en": "Chat ID",
        "ar": "@username or Chat ID",
        "ru": "ID чата"
    },
    "telegramChatPlaceholder": {
        "en": "@username or Chat ID",
        "ar": "@اسم_المستخدم أو معرف الدردشة",
        "ru": "@username или ID чата"
    },
    "howToGetLinkedinToken": {
        "en": "How to get a LinkedIn Access Token",
        "ar": "كيفية الحصول على رمز وصول LinkedIn",
        "ru": "Как получить токен доступа к LinkedIn"
    },
    "howToGetTelegramBot": {
        "en": "How to get a Telegram Bot",
        "ar": "كيفية الحصول على بوت Telegram",
        "ru": "Как получить бота Telegram"
    },
    "linkedinNote": {
        "en": "Without token, sharing will open LinkedIn in your browser",
        "ar": "بدون رمز، ستفتح المشاركة LinkedIn في المتصفح",
        "ru": "Без токена, поделиться откроет LinkedIn в браузере"
    },
    "apiKey": {
        "en": "API Key",
        "ar": "مفتاح API",
        "ru": "Ключ API"
    },
    "modelLabel": {
        "en": "Model",
        "ar": "النموذج",
        "ru": "Модель"
    },
    "apiSetupGuide": {
        "en": "API Setup Guide",
        "ar": "دليل إعداد API",
        "ru": "Руководство по настройке API"
    },
    "enterGeminiApiKey": {
        "en": "Enter your Gemini API Key",
        "ar": "أدخل مفتاح Gemini API الخاص بك",
        "ru": "Введите ваш ключ API Gemini"
    },
    "enterOpenaiApiKey": {
        "en": "Enter your OpenAI API Key",
        "ar": "أدخل مفتاح OpenAI API الخاص بك",
        "ru": "Введите ваш ключ API OpenAI"
    },
    "enterXaiApiKey": {
        "en": "Enter your xAI API Key",
        "ar": "أدخل مفتاح xAI API الخاص بك",
        "ru": "Введите ваш ключ API xAI"
    },
    "applySelection": {
        "en": "Apply Selection",
        "ar": "تطبيق الاختيار",
        "ru": "Применить выбор"
    },
    "editPost": {
        "en": "Edit Post",
        "ar": "تحرير المنشور",
        "ru": "Редактировать пост"
    },
    "saveChanges": {
        "en": "Save Changes",
        "ar": "حفظ التغييرات",
        "ru": "Сохранить изменения"
    },
    "cancel": {
        "en": "Cancel",
        "ar": "إلغاء",
        "ru": "Отмена"
    },
    "mediaAttachment": {
        "en": "Media Attachment",
        "ar": "إرفاق الوسائط",
        "ru": "Вложение медиа"
    },
    "dragDropFiles": {
        "en": "Drag & drop files here or",
        "ar": "اسحب وأفلت الملفات هنا أو",
        "ru": "Перетащите файлы сюда или"
    },
    "supportedFormats": {
        "en": "Supported: Images (JPG, PNG, GIF) and Videos (MP4)",
        "ar": "المدعومة: الصور (JPG، PNG، GIF) والفيديوهات (MP4)",
        "ru": "Поддерживается: Изображения (JPG, PNG, GIF) и видео (MP4)"
    },
    "removeMedia": {
        "en": "Remove",
        "ar": "إزالة",
        "ru": "Удалить"
    },
    "postHistory": {
        "en": "Post History & Analytics",
        "ar": "تاريخ المنشورات والتحليلات",
        "ru": "История постов и аналитика"
    },
    "totalPosts": {
        "en": "Total Posts:",
        "ar": "إجمالي المنشورات:",
        "ru": "Всего постов:"
    },
    "successRate": {
        "en": "Success Rate:",
        "ar": "معدل النجاح:",
        "ru": "Уровень успеха:"
    },
    "linkedinShares": {
        "en": "LinkedIn Shares:",
        "ar": "مشاركات LinkedIn:",
        "ru": "Публикации в LinkedIn:"
    },
    "telegramShares": {
        "en": "Telegram Shares:",
        "ar": "مشاركات Telegram:",
        "ru": "Публикации в Telegram:"
    },
    "noHistory": {
        "en": "No posts in history yet. Generate your first post!",
        "ar": "لا توجد منشورات في التاريخ حتى الآن. أنشئ منشورك الأول!",
        "ru": "В истории ещё нет постов. Создайте свой первый пост!"
    },
    "createPost": {
        "en": "Create Post",
        "ar": "إنشاء المنشور",
        "ru": "Создать пост"
    },
    "createPostDesc": {
        "en": "Generate engaging content and share across platforms",
        "ar": "توليد محتوى جذاب ومشاركته عبر المنصات",
        "ru": "Создайте увлекательный контент и поделитесь на платформах"
    },
    "selectPlatforms": {
        "en": "Select Platforms",
        "ar": "اختر المنصات",
        "ru": "Выберите платформы"
    },
    "selectPlatformsDesc": {
        "en": "Choose where to share your post",
        "ar": "اختر أين تريد مشاركة منشورك",
        "ru": "Выберите, где поделиться постом"
    },
    "professional": {
        "en": "Professional",
        "ar": "مهني",
        "ru": "Профессиональные"
    },
    "linkedin": {
        "en": "LinkedIn",
        "ar": "LinkedIn",
        "ru": "LinkedIn"
    },
    "linkedinDescription": {
        "en": "Professional network",
        "ar": "شبكة مهنية",
        "ru": "Профессиональная сеть"
    },
    "xTwitter": {
        "en": "X/Twitter",
        "ar": "X/Twitter",
        "ru": "X/Twitter"
    },
    "xTwitterDescription": {
        "en": "Real-time updates",
        "ar": "تحديثات فورية",
        "ru": "Обновления в реальном времени"
    },
    "social": {
        "en": "Social",
        "ar": "اجتماعي",
        "ru": "Социальные"
    },
    "facebook": {
        "en": "Facebook",
        "ar": "Facebook",
        "ru": "Facebook"
    },
    "facebookDescription": {
        "en": "Connect with audience",
        "ar": "تواصل مع الجمهور",
        "ru": "Связь с аудиторией"
    },
    "instagram": {
        "en": "Instagram",
        "ar": "Instagram",
        "ru": "Instagram"
    },
    "instagramDescription": {
        "en": "Visual storytelling",
        "ar": "رواية بصرية",
        "ru": "Визуальное повествование"
    },
    "comingSoon": {
        "en": "Coming Soon",
        "ar": "قريباً",
        "ru": "Скоро"
    },
    "communities": {
        "en": "Communities",
        "ar": "المجتمعات",
        "ru": "Сообщества"
    },
    "discord": {
        "en": "Discord",
        "ar": "Discord",
        "ru": "Discord"
    },
    "discordDescription": {
        "en": "Community engagement",
        "ar": "تفاعل المجتمع",
        "ru": "Вовлеченность сообщества"
    },
    "reddit": {
        "en": "Reddit",
        "ar": "Reddit",
        "ru": "Reddit"
    },
    "redditDescription": {
        "en": "Discussion forums",
        "ar": "منتديات النقاش",
        "ru": "Форумы обсуждения"
    },
    "decentralized": {
        "en": "Decentralized",
        "ar": "لامهركزي",
        "ru": "Децентрализованные"
    },
    "bluesky": {
        "en": "BlueSky",
        "ar": "BlueSky",
        "ru": "BlueSky"
    },
    "blueskyDescription": {
        "en": "Decentralized social",
        "ar": "وسائل اجتماعية لامركزية",
        "ru": "Децентрализованная социальная сеть"
    },
    "analyticsDesc": {
        "en": "Track your post performance and scheduling",
        "ar": "تتبع أداء المنشورات والجدولة",
        "ru": "Отслеживайте эффективность постов и планирование"
    },
    "analytics": {
        "en": "Analytics Dashboard",
        "ar": "لوحة التحليلات",
        "ru": "Панель аналитики"
    },
    "shareNow": {
        "en": "Share Now",
        "ar": "شارك الآن",
        "ru": "Поделиться сейчас"
    },
    "mastodon": {
        "en": "Mastodon",
        "ar": "Mastodon",
        "ru": "Mastodon"
    },
    "mastodonDescription": {
        "en": "Federated network",
        "ar": "شبكة موحدة",
        "ru": "Федеративная сеть"
    },
    "preview": {
        "en": "Preview",
        "ar": "معاينة",
        "ru": "Предварительный просмотр"
    },
    "selectedCount": {
        "en": "selected",
        "ar": "محدد",
        "ru": "выбрано"
    },
    "selectPlatformsMessage": {
        "en": "Select platforms to see preview",
        "ar": "اختر المنصات لرؤية المعاينة",
        "ru": "Выберите платформы для просмотра"
    },
    "schedulePost": {
        "en": "Schedule Post",
        "ar": "جدولة المنشور",
        "ru": "Запланировать пост"
    },
    "schedulePostDesc": {
        "en": "Set date and time to automatically post",
        "ar": "ضبط التاريخ والوقت للنشر التلقائي",
        "ru": "Установите дату и время для автоматической публикации"
    },
    "platformsTab": {
        "en": "Platforms",
        "ar": "المنصات",
        "ru": "Платформы"
    },
    "analyticsTab": {
        "en": "Analytics",
        "ar": "التحليلات",
        "ru": "Аналитика"
    },
    "scheduleModalTitle": {
        "en": "Schedule Post",
        "ar": "جدولة المنشور",
        "ru": "Запланировать пост"
    },
    "scheduleDate": {
        "en": "Date & Time",
        "ar": "التاريخ والوقت",
        "ru": "Дата и время"
    },
    "platforms": {
        "en": "Platforms",
        "ar": "المنصات",
        "ru": "Платформы"
    },
    "postContent": {
        "en": "Post Content",
        "ar": "محتوى المنشور",
        "ru": "Содержание поста"
    },
    "noMediaPreview": {
        "en": "No media attached",
        "ar": "لا يوجد وسائط مرفقة",
        "ru": "Медиа не прикреплено"
    },
    "selectAiModel": {
        "en": "Select AI Model",
        "ar": "اختر نموذج الذكاء الاصطناعي",
        "ru": "Выберите модель ИИ"
    },
    "noScheduled": {
        "en": "No scheduled posts yet. Schedule your first post!",
        "ar": "لا توجد منشورات مجدولة بعد. جدول منشورك الأول!",
        "ru": "Ещё нет запланированных постов. Запланируйте свой первый пост!"
    },
    "scheduledPosts": {
        "en": "Scheduled Posts",
        "ar": "المنشورات المجدولة",
        "ru": "Запланированные посты"
    },
};

export function updateTexts(): void {
    const elements = document.querySelectorAll('[data-key]');
    elements.forEach(el => {
        const key = el.getAttribute('data-key');
        if (key) {
            const text = translations[key]?.[currentLang];
            if (text) el.textContent = text;
        }
    });
}
