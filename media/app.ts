// @ts-ignore
const vscode = acquireVsCodeApi();

interface Message {
    command: string;
    post?: string;
    status?: string;
    type?: 'success' | 'error';
    selectedModel?: SelectedModel;
    linkedinToken?: string;
    telegramBot?: string;
    telegramChat?: string;
    geminiModels?: string[];
    openaiModels?: string[];
    xaiModels?: string[];
    provider?: string; // Add provider to the Message interface
    mediaPath?: string; // Webview URL for display (single file - legacy)
    mediaFilePath?: string; // Filesystem path for operations (single file - legacy)
    mediaFiles?: MediaFile[]; // Array of media files for multiple selection
    fileName?: string;
    fileSize?: number;
    postHistory?: HistoricalPost[];
    analytics?: AnalyticsSummary;
    // Scheduled posts
    scheduledPosts?: ScheduledPost[];
    scheduledTime?: string;
    selectedPlatforms?: ('linkedin' | 'telegram')[];
    scheduledPostId?: string;
}

interface HistoricalPost {
    id: string;
    timestamp: string;
    aiProvider: 'gemini' | 'openai' | 'xai';
    aiModel: string;
    postData: PostData;
    shares: ShareRecord[];
}

interface ShareRecord {
    platform: 'linkedin' | 'telegram';
    timestamp: string;
    success: boolean;
    errorMessage?: string;
    postId?: string;
}

interface AnalyticsSummary {
    totalPosts: number;
    successfulShares: number;
    failedShares: number;
    linkedinShares: number;
    telegramShares: number;
    successRate: number;
}

interface PostData {
    text: string;
    media?: string;
}

interface SelectedModel {
    provider: 'gemini' | 'openai' | 'xai';
    model: string;
    apiKey: string;
}

interface MediaFile {
    mediaPath: string; // Webview URL for display
    mediaFilePath: string; // Filesystem path for operations
    fileName: string;
    fileSize: number;
}

interface ScheduledPost {
    id: string;
    scheduledTime: string;
    postData: PostData;
    aiProvider: 'gemini' | 'openai' | 'xai';
    aiModel: string;
    platforms: ('linkedin' | 'telegram')[];
    status: 'scheduled' | 'processing' | 'posted' | 'failed';
    created: string;
    errorMessage?: string;
    postedTime?: string;
    platformResults?: {
        linkedin?: {
            success: boolean;
            postId?: string;
            errorMessage?: string;
        };
        telegram?: {
            success: boolean;
            messageId?: string;
            errorMessage?: string;
        };
    };
}

const generateBtn = document.getElementById('generateBtn') as HTMLButtonElement;
const shareLinkedInBtn = document.getElementById('shareLinkedInBtn') as HTMLButtonElement;
const shareTelegramBtn = document.getElementById('shareTelegramBtn') as HTMLButtonElement;
const postText = document.getElementById('postText') as HTMLTextAreaElement;
const editPostBtn = document.getElementById('editPostBtn') as HTMLButtonElement;
const savePostBtn = document.getElementById('savePostBtn') as HTMLButtonElement;
const cancelPostBtn = document.getElementById('cancelPostBtn') as HTMLButtonElement;
const editControls = document.getElementById('editControls') as HTMLDivElement;
const statusMessage = document.getElementById('status') as HTMLDivElement;
const selectModelBtn = document.getElementById('configureAIBtn') as HTMLButtonElement;
const selectedModelDisplay = document.getElementById('selectedAIDisplay') as HTMLDivElement;
const modelModal = document.getElementById('modelModal') as HTMLDivElement;
const closeModal = document.getElementById('closeModal') as HTMLSpanElement;
const applyModelBtn = document.getElementById('applyModelBtn') as HTMLButtonElement;

const linkedinToken = document.getElementById('linkedinToken') as HTMLInputElement;
const telegramBot = document.getElementById('telegramBot') as HTMLInputElement;
const telegramChat = document.getElementById('telegramChat') as HTMLInputElement;

// Media attachment elements
const mediaAttachment = document.getElementById('mediaAttachment') as HTMLElement;
const uploadArea = document.getElementById('uploadArea') as HTMLElement;
const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const attachedFile = document.getElementById('attachedFile') as HTMLElement;
const fileNameSpan = document.getElementById('fileName') as HTMLElement;
const fileSizeSpan = document.getElementById('fileSize') as HTMLElement;
const removeMediaBtn = document.getElementById('removeMediaBtn') as HTMLButtonElement;

// Localization and Theme
let currentLang: string = localStorage.getItem('lang') || 'en';
const themes = ['light-elegant', 'light-pure', 'dark-nebula', 'dark-cyber'];
let currentThemeVariant: string = localStorage.getItem('theme') || 'light-elegant';

// Embedded translations to avoid webview file loading issues
const translations: {[key: string]: {[key: string]: string}} = {
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
        "ar": "معرف الدردشة",
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
    }
};

function updateTexts() {
    const elements = document.querySelectorAll('[data-key]');
    elements.forEach(el => {
        const key = el.getAttribute('data-key');
        if (key) {
            const text = translations[key]?.[currentLang];
            if (text) el.textContent = text;
        }
    });
    updatePlaceholders();
}

function updatePlaceholders() {
    const textarea = document.getElementById('postText') as HTMLTextAreaElement;
    textarea.placeholder = translations["placeholder"]?.[currentLang] || '';
    linkedinToken.placeholder = translations["linkedinTokenPlaceholder"]?.[currentLang] || '';
    telegramBot.placeholder = translations["telegramBotPlaceholder"]?.[currentLang] || '';
    telegramChat.placeholder = translations["telegramChatPlaceholder"]?.[currentLang] || '';
}

function applyTheme() {
    // Remove all theme classes
    themes.forEach(theme => document.body.classList.remove(theme));
    // Add current
    document.body.classList.add(currentThemeVariant);
    // Set data-theme
    document.body.setAttribute('data-theme', currentThemeVariant);
    // Set dark class if dark theme
    const isDark = currentThemeVariant.startsWith('dark');
    document.body.classList.toggle('dark', isDark);
    updateThemeToggle();
}

function updateThemeToggle() {
    const themeIcon = document.querySelector('#themeToggle .icon') as HTMLElement;
    const themeText = document.querySelector('#themeToggle .text') as HTMLElement;
    if (themeIcon && themeText) {
        const themeNames = {
            'light-elegant': 'Elegant Light 🌿',
            'light-pure': 'Pure Light ✨',
            'dark-nebula': 'Nebula Dark 🌌',
            'dark-cyber': 'Cyber Dark 🤖'
        };
        themeText.textContent = themeNames[currentThemeVariant as keyof typeof themeNames] || currentThemeVariant;
        themeIcon.textContent = currentThemeVariant.startsWith('dark') ? '🌙' : '☀️';
    }
}

// Apply initial settings
document.documentElement.lang = currentLang;
if (currentLang === 'ar') document.body.classList.add('rtl');
applyTheme();

// Modal elements
const tabBtns = document.querySelectorAll('.tab-btn');
const providerPanels = document.querySelectorAll('.provider-panel');
const geminiKeyModal = document.getElementById('geminiKeyModal') as HTMLInputElement;
const geminiModelSelect = document.getElementById('geminiModel') as HTMLSelectElement;
const openaiKeyInput = document.getElementById('openaiKey') as HTMLInputElement;
const openaiModelSelect = document.getElementById('openaiModel') as HTMLSelectElement;
const xaiKeyInput = document.getElementById('xaiKey') as HTMLInputElement;
const xaiModelSelect = document.getElementById('xaiModel') as HTMLSelectElement;

// Default selected model
let selectedModel: SelectedModel = {
    provider: 'gemini',
    model: '',
    apiKey: ''
};

// Function to update button states based on input values
function updateButtonStates() {
    generateBtn.disabled = !selectedModel.apiKey.trim();
    shareLinkedInBtn.disabled = !linkedinToken.value.trim();
    shareTelegramBtn.disabled = !(telegramBot.value.trim() && telegramChat.value.trim());
}


// Function to populate model dropdowns
function populateModelDropdown(selectElement: HTMLSelectElement, models: string[], currentModel: string) {
    selectElement.innerHTML = ''; // Clear existing options
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        if (model === currentModel) {
            option.selected = true;
        }
        selectElement.appendChild(option);
    });
    // If no option was selected, auto-select the first (latest) model
    if (selectElement.selectedIndex === -1 && models.length > 0) {
        selectElement.selectedIndex = 0;
    }
}

// Function to show status messages
function showStatus(message: string, type: 'success' | 'error') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'flex';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

// Function to update the selected model display
function updateSelectedModelDisplay() {
    const providerNames: Record<string, string> = {
        gemini: 'Gemini',
        openai: 'ChatGPT',
        xai: 'X-AI'
    };
    if (selectedModel.model) {
        selectedModelDisplay.textContent = `${providerNames[selectedModel.provider]} (${selectedModel.model})`;
    } else {
        selectedModelDisplay.textContent = translations["noProvider"]?.[currentLang] || 'No provider selected - Click to configure';
    }
}

// Function to manage generate button loading state
function setGeneratingState(isGenerating: boolean): void {
    const originalText = translations["generateAI"]?.[currentLang] || 'Generate AI Post';

    if (isGenerating) {
        generateBtn.disabled = true;
        generateBtn.textContent = '🔄 Generating...';
        generateBtn.classList.add('loading');
    } else {
        generateBtn.disabled = !selectedModel.apiKey.trim();
        generateBtn.textContent = originalText;
        generateBtn.classList.remove('loading');
    }
}

// Function to open modal
function openModal() {
    // Pre-fill modal with current values
    geminiKeyModal.value = selectedModel.provider === 'gemini' ? selectedModel.apiKey : '';
    geminiModelSelect.value = selectedModel.provider === 'gemini' ? selectedModel.model : '';
    openaiKeyInput.value = selectedModel.provider === 'openai' ? selectedModel.apiKey : '';
    openaiModelSelect.value = selectedModel.provider === 'openai' ? selectedModel.model : '';
    xaiKeyInput.value = selectedModel.provider === 'xai' ? selectedModel.apiKey : '';
    xaiModelSelect.value = selectedModel.provider === 'xai' ? selectedModel.model : '';

    // Request models for all providers when modal opens, using their respective keys if available
    vscode.postMessage({ command: 'fetchModels', provider: 'gemini', apiKey: geminiKeyModal.value });
    vscode.postMessage({ command: 'fetchModels', provider: 'openai', apiKey: openaiKeyInput.value });
    vscode.postMessage({ command: 'fetchModels', provider: 'xai', apiKey: xaiKeyInput.value });

    modelModal.style.display = 'flex';
}

// Function to close modal
function closeModalFunc() {
    modelModal.style.display = 'none';
}

// Function to switch tabs
function switchTab(provider: string) {
    tabBtns.forEach(btn => btn.classList.remove('active'));
    providerPanels.forEach(panel => panel.classList.remove('active'));

    const activeTab = document.querySelector(`[data-provider="${provider}"]`) as HTMLElement;
    const activePanel = document.getElementById(`${provider}Panel`) as HTMLElement;

    if (activeTab) activeTab.classList.add('active');
    if (activePanel) activePanel.classList.add('active');
}

// Function to apply model selection
function applyModel() {
    const activeProvider = document.querySelector('.tab-btn.active')!.getAttribute('data-provider')!;

    let apiKey = '';
    let model = '';

    if (activeProvider === 'gemini') {
        apiKey = geminiKeyModal.value.trim();
        model = geminiModelSelect.value;
    } else if (activeProvider === 'openai') {
        apiKey = openaiKeyInput.value.trim();
        model = openaiModelSelect.value;
    } else if (activeProvider === 'xai') {
        apiKey = xaiKeyInput.value.trim();
        model = xaiModelSelect.value;
    }

    // Basic validation
    if (!apiKey) {
        showStatus('API Key is required.', 'error');
        return;
    }
    if (apiKey.length < 10) {
        showStatus('API Key appears too short. Please check.', 'error');
        return;
    }

    selectedModel = {
        provider: activeProvider as 'gemini' | 'openai' | 'xai',
        model,
        apiKey
    };

    updateSelectedModelDisplay();
    updateButtonStates();
    closeModalFunc();
    showStatus('AI model updated successfully!', 'success');

    // Save to VS Code settings
    vscode.postMessage({
        command: 'saveModelSelection',
        selectedModel
    });
}

// Add event listeners for input changes and auto-saving
linkedinToken.addEventListener('input', updateButtonStates);
telegramBot.addEventListener('input', updateButtonStates);
telegramChat.addEventListener('input', updateButtonStates);

// Auto-save credentials when they change
linkedinToken.addEventListener('blur', () => {
    if (linkedinToken.value.trim()) {
        vscode.postMessage({ command: 'saveLinkedinToken', linkedinToken: linkedinToken.value });
    }
});

telegramBot.addEventListener('blur', () => {
    if (telegramBot.value.trim() || telegramChat.value.trim()) {
        vscode.postMessage({
            command: 'saveTelegramCredentials',
            telegramBot: telegramBot.value,
            telegramChat: telegramChat.value
        });
    }
});

telegramChat.addEventListener('blur', () => {
    if (telegramBot.value.trim() || telegramChat.value.trim()) {
        vscode.postMessage({
            command: 'saveTelegramCredentials',
            telegramBot: telegramBot.value,
            telegramChat: telegramChat.value
        });
    }
});

// Add event listeners for modal input changes to trigger model fetching
geminiKeyModal.addEventListener('input', () => {
    vscode.postMessage({ command: 'fetchModels', provider: 'gemini', apiKey: geminiKeyModal.value });
});
openaiKeyInput.addEventListener('input', () => {
    vscode.postMessage({ command: 'fetchModels', provider: 'openai', apiKey: openaiKeyInput.value });
});
xaiKeyInput.addEventListener('input', () => {
    vscode.postMessage({ command: 'fetchModels', provider: 'xai', apiKey: xaiKeyInput.value });
});

// Event listeners
selectModelBtn.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalFunc);
applyModelBtn.addEventListener('click', applyModel);

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const provider = btn.getAttribute('data-provider')!;
        switchTab(provider);
    });
});

// Close modal when clicking outside
modelModal.addEventListener('click', (e) => {
    if (e.target === modelModal) {
        closeModalFunc();
    }
});

// Button click listeners
generateBtn.addEventListener('click', () => {
    // Prevent multiple clicks during generation
    if (generateBtn.disabled) return;

    vscode.postMessage({
        command: 'generatePost',
        selectedModel
    });
    showStatus('Generating AI post...', 'success');
    setGeneratingState(true);
});

shareLinkedInBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'shareToLinkedIn', linkedinToken: linkedinToken.value });
    showStatus('Sharing to LinkedIn...', 'success');
});

shareTelegramBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'shareToTelegram', telegramBot: telegramBot.value, telegramChat: telegramChat.value });
    showStatus('Sharing to Telegram...', 'success');
});

// Message listener for updates from extension
window.addEventListener('message', (event: MessageEvent<Message>) => {
    const message = event.data;
    switch (message.command) {
        case 'updatePost':
            if (message.post) {
                postText.value = message.post;
                originalPost = message.post;
                editPostBtn.style.display = 'inline-block';
                showStatus('Post generated successfully!', 'success');
                showMediaAttachment();
                setGeneratingState(false); // Reset loading state on success
            }
            break;
        case 'status':
            if (message.status && message.type) {
                showStatus(message.status, message.type);
                // Reset loading state on any status update to be safe
                if (message.type === 'error') {
                    setGeneratingState(false);
                }
            }
            break;
        case 'updateConfiguration':
            if (message.selectedModel) {
                selectedModel = message.selectedModel;
                updateSelectedModelDisplay();
            }
            if (message.linkedinToken) {
                linkedinToken.value = message.linkedinToken;
            }
            if (message.telegramBot) {
                telegramBot.value = message.telegramBot;
            }
            if (message.telegramChat) {
                telegramChat.value = message.telegramChat;
            }
            updateButtonStates();
            break;
        case 'updateModels':
            if (message.provider === 'gemini' && message.geminiModels) {
                populateModelDropdown(geminiModelSelect, message.geminiModels, selectedModel.model);
            } else if (message.provider === 'openai' && message.openaiModels) {
                populateModelDropdown(openaiModelSelect, message.openaiModels, selectedModel.model);
            } else if (message.provider === 'xai' && message.xaiModels) {
                populateModelDropdown(xaiModelSelect, message.xaiModels, selectedModel.model);
            }
            break;
        case 'mediaSelected':
            if (message.mediaFiles && message.mediaFiles.length > 0) {
                attachMultipleMedia(message.mediaFiles);
            } else if (message.mediaPath && message.mediaFilePath && message.fileName && message.fileSize !== undefined) {
                // Fallback for single file (legacy)
                attachMedia(message.mediaPath, message.mediaFilePath, message.fileName, message.fileSize);
            }
            break;
        case 'updatePostHistory':
            if (message.postHistory) {
                updatePostHistory(message.postHistory);
                showPostHistory();
            }
            break;
        case 'updateAnalytics':
            if (message.analytics) {
                updateAnalytics(message.analytics);
            }
            break;
        case 'updateScheduledPosts':
            if (message.scheduledPosts) {
                updateScheduledPosts(message.scheduledPosts);

                // If we're editing a post, populate the edit modal with the data
                if (currentEditingPostId) {
                    const post = message.scheduledPosts.find(p => p.id === currentEditingPostId);
                    if (post) {
                        populateEditModal(post);
                    } else {
                        // Post not found, clear editing state
                        currentEditingPostId = null;
                        editScheduledModal.style.display = 'none';
                    }
                }
            }
            break;
    }
});

// Event listeners for language and theme
const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement;
const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;

languageSelect.value = currentLang;

languageSelect.addEventListener('change', (e) => {
    currentLang = (e.target as HTMLSelectElement).value;
    localStorage.setItem('lang', currentLang);
    document.documentElement.lang = currentLang;
    document.body.classList.toggle('rtl', currentLang === 'ar');
    updateTexts();
    updateThemeToggle();
});

themeToggle.addEventListener('click', () => {
    const currentIndex = themes.indexOf(currentThemeVariant);
    const nextIndex = (currentIndex + 1) % themes.length;
    currentThemeVariant = themes[nextIndex];
    localStorage.setItem('theme', currentThemeVariant);
    applyTheme();
});

window.addEventListener('load', () => {
    console.log('Translations loaded statically'); // Log translations availability
    updateTexts();
    updateThemeToggle();
    updateSelectedModelDisplay(); // Also update this in case it uses translations
    loadHistoryAndAnalytics(); // Load existing history and analytics
});

// Post editing functionality
let originalPost = '';
editPostBtn.addEventListener('click', () => {
    originalPost = postText.value;
    postText.readOnly = false;
    postText.focus();
    editPostBtn.style.display = 'none';
    editControls.style.display = 'flex';
});

savePostBtn.addEventListener('click', () => {
    originalPost = postText.value;
    postText.readOnly = true;
    editPostBtn.style.display = 'inline-block';
    editControls.style.display = 'none';
    showStatus('Post saved successfully!', 'success');
    // Update in global state
    vscode.postMessage({ command: 'updatePost', post: postText.value });
});

cancelPostBtn.addEventListener('click', () => {
    postText.value = originalPost;
    postText.readOnly = true;
    editPostBtn.style.display = 'inline-block';
    editControls.style.display = 'none';
});

// Post history elements
const postHistory = document.getElementById('postHistory') as HTMLElement;
const historyList = document.getElementById('historyList') as HTMLElement;
const totalPostsValue = document.getElementById('totalPostsValue') as HTMLElement;
const successRateValue = document.getElementById('successRateValue') as HTMLElement;
const linkedinSharesValue = document.getElementById('linkedinSharesValue') as HTMLElement;
const telegramSharesValue = document.getElementById('telegramSharesValue') as HTMLElement;

// Post history variables
let attachedMediaPath: string | null = null;

// History and analytics functions
function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

function getProviderEmoji(provider: 'gemini' | 'openai' | 'xai'): string {
    switch (provider) {
        case 'gemini': return '🔮';
        case 'openai': return '🤖';
        case 'xai': return '🦄';
        default: return '🤔';
    }
}

function getStatusEmoji(success: boolean): string {
    return success ? '✅' : '❌';
}

function updatePostHistory(history: HistoricalPost[]): void {
    if (history.length === 0) {
        historyList.innerHTML = `<p data-key="noHistory">${translations["noHistory"]?.[currentLang] || 'No posts in history yet. Generate your first post!'}</p>`;
        return;
    }

    let html = '';

    // Sort by most recent first and take only last 10 for display
    const recentHistory = history.slice(0, 10);

    for (const post of recentHistory) {
        const truncatedText = post.postData.text.length > 100
            ? post.postData.text.substring(0, 100) + '...'
            : post.postData.text;

        const linkedinShare = post.shares.find(s => s.platform === 'linkedin');
        const telegramShare = post.shares.find(s => s.platform === 'telegram');

        const linkedinStatus = linkedinShare ? getStatusEmoji(linkedinShare.success) : '';
        const telegramStatus = telegramShare ? getStatusEmoji(telegramShare.success) : '';

        html += `
            <div class="history-item" data-post-id="${post.id}">
                <div class="history-header">
                    <span class="history-time">${getProviderEmoji(post.aiProvider)} ${formatTimestamp(post.timestamp)}</span>
                    <div class="share-status">
                        ${linkedinStatus} ${telegramStatus}
                    </div>
                </div>
                <div class="history-content">
                    <div class="history-text">${truncatedText}</div>
                    ${post.postData.media ? '<div class="history-media">📎 Media attached</div>' : ''}
                </div>
                <div class="history-footer">
                    <span class="history-model">${post.aiProvider} ${post.aiModel}</span>
                </div>
            </div>
        `;
    }

    historyList.innerHTML = `<div class="history-items">${html}</div>`;
    updateTexts(); // Update any localized text
}

function updateAnalytics(analytics: AnalyticsSummary): void {
    totalPostsValue.textContent = analytics.totalPosts.toString();
    successRateValue.textContent = `${analytics.successRate}%`;
    linkedinSharesValue.textContent = analytics.linkedinShares.toString();
    telegramSharesValue.textContent = analytics.telegramShares.toString();
}

function showPostHistory(): void {
    postHistory.style.display = 'block';
}

// Load history and analytics when page loads
function loadHistoryAndAnalytics(): void {
    vscode.postMessage({ command: 'loadPostHistory' });
    vscode.postMessage({ command: 'loadAnalytics' });
}

// Media attachment functions
function validateFile(file: File): boolean {
    const maxSize = 8 * 1024 * 1024; // 8MB limit
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];

    if (file.size > maxSize) {
        showStatus('File size must be less than 8MB.', 'error');
        return false;
    }

    if (!allowedTypes.includes(file.type)) {
        showStatus('Only JPG, PNG, GIF images and MP4 videos are supported.', 'error');
        return false;
    }

    return true;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showMediaAttachment() {
    if (postText.value.trim()) {
        mediaAttachment.style.display = 'block';
    }
}

function hideMediaAttachment() {
    mediaAttachment.style.display = 'none';
}

function attachMultipleMedia(mediaFiles: MediaFile[]) {
    attachedFile.style.display = 'flex';
    uploadArea.style.display = 'none';

    if (mediaFiles.length === 1) {
        // Single file - use existing UI
        fileNameSpan.textContent = mediaFiles[0].fileName;
        fileSizeSpan.textContent = formatFileSize(mediaFiles[0].fileSize);
    } else {
        // Multiple files - show count
        const totalSize = mediaFiles.reduce((sum, file) => sum + file.fileSize, 0);
        fileNameSpan.textContent = `${mediaFiles.length} files selected`;
        fileSizeSpan.textContent = formatFileSize(totalSize);
    }

    // Send all filesystem paths for storage
    const mediaFilePaths = mediaFiles.map(file => file.mediaFilePath);
    vscode.postMessage({ command: 'attachMedia', mediaFilePaths });
}

function attachMedia(mediaPath: string, mediaFilePath: string, fileName: string, fileSize: number) {
    // mediaPath is for display, mediaFilePath is for file operations
    attachedMediaPath = mediaPath; // Keep for potential future use in UI
    attachedFile.style.display = 'flex';
    uploadArea.style.display = 'none';
    fileNameSpan.textContent = fileName;
    fileSizeSpan.textContent = formatFileSize(fileSize);
    // Send filesystem path for storage
    vscode.postMessage({ command: 'attachMedia', mediaFilePath });
}

function removeMedia() {
    attachedMediaPath = null;
    attachedFile.style.display = 'none';
    uploadArea.style.display = 'flex';
    vscode.postMessage({ command: 'removeMedia' });
}

// Media event listeners - Direct to VS Code dialog to eliminate double selection
uploadBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'selectMediaFile' });
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    // Skip webview validation, go directly to VS Code dialog
    vscode.postMessage({ command: 'selectMediaFile' });
});

removeMediaBtn.addEventListener('click', removeMedia);

// Scheduled posts elements
const scheduleBtn = document.getElementById('scheduleBtn') as HTMLButtonElement;
const scheduleModal = document.getElementById('scheduleModal') as HTMLElement;
const closeScheduleModal = document.getElementById('closeScheduleModal') as HTMLElement;
const scheduleDate = document.getElementById('scheduleDate') as HTMLInputElement;
const scheduleLinkedIn = document.getElementById('scheduleLinkedIn') as HTMLInputElement;
const scheduleTelegram = document.getElementById('scheduleTelegram') as HTMLInputElement;
const scheduledPostText = document.getElementById('scheduledPostText') as HTMLTextAreaElement;
const scheduledMediaPreview = document.getElementById('scheduledMediaPreview') as HTMLElement;
const cancelScheduleBtn = document.getElementById('cancelScheduleBtn') as HTMLButtonElement;
const confirmScheduleBtn = document.getElementById('confirmScheduleBtn') as HTMLButtonElement;

// Edit scheduled posts elements
const editScheduledModal = document.getElementById('editScheduledModal') as HTMLElement;
const closeEditScheduledModal = document.getElementById('closeEditScheduledModal') as HTMLElement;
const editScheduleDate = document.getElementById('editScheduleDate') as HTMLInputElement;
const editScheduleLinkedIn = document.getElementById('editScheduleLinkedIn') as HTMLInputElement;
const editScheduleTelegram = document.getElementById('editScheduleTelegram') as HTMLInputElement;
const editScheduledPostText = document.getElementById('editScheduledPostText') as HTMLTextAreaElement;
const editScheduledMediaPreview = document.getElementById('editScheduledMediaPreview') as HTMLElement;
const cancelEditScheduledBtn = document.getElementById('cancelEditScheduledBtn') as HTMLButtonElement;
const saveEditScheduledBtn = document.getElementById('saveEditScheduledBtn') as HTMLButtonElement;

// Track which post is being edited
let currentEditingPostId: string | null = null;

const scheduledPosts = document.getElementById('scheduledPosts') as HTMLElement;
const scheduledList = document.getElementById('scheduledList') as HTMLElement;

// Function to open schedule modal
function openScheduleModal() {
    // Pre-populate the modal with current post data
    scheduledPostText.value = postText.value;
    scheduleDate.value = getDefaultScheduleTime();

    // Show current time as minimum
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // Minimum 5 minutes from now
    scheduleDate.min = now.toISOString().slice(0, 16);

    // Check available platforms (has tokens)
    scheduleLinkedIn.checked = !!linkedinToken.value.trim();
    scheduleTelegram.checked = !!(telegramBot.value.trim() && telegramChat.value.trim());

    // Disable platforms without tokens
    scheduleLinkedIn.disabled = !linkedinToken.value.trim();
    scheduleTelegram.disabled = !(telegramBot.value.trim() && telegramChat.value.trim());

    // Show media preview if attached
    updateScheduledMediaPreview();

    scheduleModal.style.display = 'flex';
    showScheduledPosts();
}

// Function to get default schedule time (1 hour from now)
function getDefaultScheduleTime(): string {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
}

// Function to update scheduled media preview
function updateScheduledMediaPreview() {
    if (attachedFile.style.display === 'flex') {
        const fileName = fileNameSpan.textContent || 'File attached';
        scheduledMediaPreview.innerHTML = `<p>📎 ${fileName}</p>`;
    } else {
        scheduledMediaPreview.innerHTML = '<p style="color: #666;">No media attached</p>';
    }
}

// Function to close schedule modal
function closeScheduleModalFunc() {
    scheduleModal.style.display = 'none';
}

// Function to create a scheduled post
function schedulePost() {
    const scheduledTime = scheduleDate.value;
    const selectedPlatforms: ('linkedin' | 'telegram')[] = [];

    if (scheduleLinkedIn.checked) selectedPlatforms.push('linkedin');
    if (scheduleTelegram.checked) selectedPlatforms.push('telegram');

    if (!scheduledTime) {
        showStatus('Please select a date and time.', 'error');
        return;
    }

    if (selectedPlatforms.length === 0) {
        showStatus('Please select at least one platform.', 'error');
        return;
    }

    const scheduleDateObj = new Date(scheduledTime);
    const now = new Date();

    if (scheduleDateObj <= now) {
        showStatus('Scheduled time must be in the future.', 'error');
        return;
    }

    vscode.postMessage({
        command: 'schedulePost',
        scheduledTime: scheduledTime,
        selectedPlatforms: selectedPlatforms,
        linkedinToken: linkedinToken.value,
        telegramBot: telegramBot.value,
        telegramChat: telegramChat.value
    });

    closeScheduleModalFunc();
}

// Function to display scheduled posts
function updateScheduledPosts(scheduledPostsArray: ScheduledPost[]) {
    if (!scheduledPostsArray || scheduledPostsArray.length === 0) {
        scheduledList.innerHTML = `<p data-key="noScheduled">${translations["noScheduled"]?.[currentLang] || 'No scheduled posts yet. Schedule your first post!'}</p>`;
        return;
    }

    let html = '';

    // Sort by scheduled time (earliest first)
    const sortedPosts = [...scheduledPostsArray].sort((a, b) =>
        new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
    );

    for (const post of sortedPosts) {
        const scheduledDate = new Date(post.scheduledTime);
        const now = new Date();
        const isPast = scheduledDate < now;

        const timeStr = isPast ?
            `Past due: ${scheduledDate.toLocaleString()}` :
            `Scheduled: ${scheduledDate.toLocaleString()}`;

        const statusBadge = getScheduledStatusBadge(post.status);

        const platformIcons = post.platforms.map(p => p === 'linkedin' ? '💼' : '📱').join(' ');

        const truncatedText = post.postData.text.length > 80
            ? post.postData.text.substring(0, 80) + '...'
            : post.postData.text;

        html += `
            <div class="scheduled-item ${post.status}" data-post-id="${post.id}">
                <div class="scheduled-header">
                    <span class="scheduled-time">${platformIcons} ${timeStr}</span>
                    <span class="scheduled-status">${statusBadge}</span>
                </div>
                <div class="scheduled-content">
                    <div class="scheduled-text">${truncatedText}</div>
                    ${post.postData.media ? '<div class="scheduled-media">📎 Media attached</div>' : ''}
                </div>
                <div class="scheduled-actions">
                    ${post.status === 'failed' ? `<button class="retry-scheduled-btn" data-post-id="${post.id}" title="Retry">🔄</button>` : `<button class="edit-scheduled-btn" data-post-id="${post.id}" title="Edit">✏️</button>`}
                    <button class="delete-scheduled-btn" data-post-id="${post.id}" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }

    scheduledList.innerHTML = `<div class="scheduled-items">${html}</div>`;
    updateTexts(); // Update localized text

    // Add event listeners for edit and delete buttons
    addScheduledPostEventListeners();
}

function getScheduledStatusBadge(status: string): string {
    switch (status) {
        case 'scheduled': return '<span class="status-badge scheduled">⏰ Scheduled</span>';
        case 'processing': return '<span class="status-badge processing">⚡ Processing</span>';
        case 'posted': return '<span class="status-badge posted">✅ Posted</span>';
        case 'failed': return '<span class="status-badge failed">❌ Failed</span>';
        default: return '<span class="status-badge unknown">❓ Unknown</span>';
    }
}

function addScheduledPostEventListeners() {
    // Edit buttons
    document.querySelectorAll('.edit-scheduled-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = (e.target as HTMLElement).getAttribute('data-post-id');
            if (postId) {
                editScheduledPost(postId);
            }
        });
    });

    // Delete buttons
    document.querySelectorAll('.delete-scheduled-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = (e.target as HTMLElement).getAttribute('data-post-id');
            if (postId) {
                deleteScheduledPost(postId);
            }
        });
    });

    // Retry buttons
    document.querySelectorAll('.retry-scheduled-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = (e.target as HTMLElement).getAttribute('data-post-id');
            if (postId) {
                retryScheduledPost(postId);
            }
        });
    });
}

function editScheduledPost(postId: string) {
    currentEditingPostId = postId;

    // Load current scheduled posts data to find the post being edited
    vscode.postMessage({ command: 'loadScheduledPosts' });

    // The modal will be populated when the data is loaded
    editScheduledModal.style.display = 'flex';

    // For now, request the current data and we'll handle it in the message listener
    // In a more robust implementation, we could store the scheduledPosts array globally
}

function populateEditModal(post: ScheduledPost) {
    // Populate the edit modal with the post data
    const scheduledDate = new Date(post.scheduledTime);
    editScheduleDate.value = scheduledDate.toISOString().slice(0, 16);

    // Set platform checkboxes
    editScheduleLinkedIn.checked = post.platforms.includes('linkedin');
    editScheduleTelegram.checked = post.platforms.includes('telegram');

    // Set post text
    editScheduledPostText.value = post.postData.text;

    // Show media preview if present
    if (post.postData.media) {
        editScheduledMediaPreview.innerHTML = '<p>📎 Media attached (cannot be changed currently)</p>';
    } else {
        editScheduledMediaPreview.innerHTML = '<p style="color: #666;">No media attached</p>';
    }

    // Disable platforms without tokens
    editScheduleLinkedIn.disabled = !linkedinToken.value.trim();
    editScheduleTelegram.disabled = !(telegramBot.value.trim() && telegramChat.value.trim());

    editScheduledModal.style.display = 'flex';
}

function saveEditedScheduledPost() {
    if (!currentEditingPostId) return;

    const scheduledTime = editScheduleDate.value;
    const selectedPlatforms: ('linkedin' | 'telegram')[] = [];

    if (editScheduleLinkedIn.checked) selectedPlatforms.push('linkedin');
    if (editScheduleTelegram.checked) selectedPlatforms.push('telegram');

    if (!scheduledTime) {
        showStatus('Please select a date and time.', 'error');
        return;
    }

    if (selectedPlatforms.length === 0) {
        showStatus('Please select at least one platform.', 'error');
        return;
    }

    const scheduleDateObj = new Date(scheduledTime);
    const now = new Date();

    if (scheduleDateObj <= now) {
        showStatus('Scheduled time must be in the future.', 'error');
        return;
    }

    vscode.postMessage({
        command: 'editScheduledPost',
        scheduledPostId: currentEditingPostId,
        scheduledTime: scheduledTime,
        selectedPlatforms: selectedPlatforms,
        postText: editScheduledPostText.value.trim() || undefined
    });

    closeEditScheduledModalFunc();
}

function closeEditScheduledModalFunc() {
    editScheduledModal.style.display = 'none';
    currentEditingPostId = null;
}

function deleteScheduledPost(postId: string) {
    // Use VS Code's native confirmation dialog instead of browser confirm
    vscode.postMessage({
        command: 'confirmDeleteScheduledPost',
        scheduledPostId: postId
    });
}

function retryScheduledPost(postId: string) {
    vscode.postMessage({
        command: 'retryScheduledPost',
        scheduledPostId: postId
    });
}

function showScheduledPosts() {
    vscode.postMessage({ command: 'loadScheduledPosts' });
    scheduledPosts.style.display = 'block';
}

// Scheduled posts event listeners
scheduleBtn.addEventListener('click', openScheduleModal);
closeScheduleModal.addEventListener('click', closeScheduleModalFunc);
cancelScheduleBtn.addEventListener('click', closeScheduleModalFunc);
confirmScheduleBtn.addEventListener('click', schedulePost);

// Close schedule modal when clicking outside
scheduleModal.addEventListener('click', (e) => {
    if (e.target === scheduleModal) {
        closeScheduleModalFunc();
    }
});

// Edit scheduled posts modal event listeners
closeEditScheduledModal.addEventListener('click', closeEditScheduledModalFunc);
cancelEditScheduledBtn.addEventListener('click', closeEditScheduledModalFunc);
saveEditScheduledBtn.addEventListener('click', saveEditedScheduledPost);

// Close edit modal when clicking outside
editScheduledModal.addEventListener('click', (e) => {
    if (e.target === editScheduledModal) {
        closeEditScheduledModalFunc();
    }
});

// Initialize button states
updateButtonStates();

// Load any saved state from VS Code
vscode.postMessage({ command: 'loadConfiguration' });
