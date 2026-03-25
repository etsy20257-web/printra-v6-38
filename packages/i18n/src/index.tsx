'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const supportedLocales = ['tr', 'en', 'es', 'de', 'fr', 'pt', 'ar', 'hi', 'ja', 'zh-CN', 'id', 'ko'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const localeLabels: Record<SupportedLocale, string> = {
  tr: 'Türkçe',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  ar: 'العربية',
  hi: 'हिन्दी',
  ja: '日本語',
  'zh-CN': '简体中文',
  id: 'Bahasa Indonesia',
  ko: '한국어'
};

export const messages: Record<string, Record<string, string>> = {
  tr: {
    shellBrandTitle: 'Premium mini SaaS çekirdeği',
    shellBrandDesc: 'Studio, Library, Analytics, Create a List, Admin ve Platform için temiz kabuk.',
    unifiedShell: 'Birleşik kabuk',
    stack: 'Yığın',
    studio: 'Studio',
    render: 'Render',
    locales: 'Diller',
    workspace: 'Çalışma Alanı',
    operations: 'Operasyonlar',
    mockupLibrary: 'Mockup Kütüphanesi',
    designLibrary: 'Tasarım Kütüphanesi',
    studioTools: 'Studio Araçları',
    language: 'Dil',
    nav_dashboard: 'Dashboard', nav_dashboard_desc: 'Sistem özeti ve son aktiviteler.',
    nav_projects: 'Projeler', nav_projects_desc: 'Yaratıcı çalışma alanlarını ve kayıtlı çıktıları yönet.',
    nav_studio: 'Studio', nav_studio_desc: 'Birleşik Canva tarzı tasarım ve mockup alanı.',
    nav_library: 'Kütüphane', nav_library_desc: 'Şablonlar, mockuplar, varlıklar ve brand kitler.',
    nav_analytics: 'Analytics', nav_analytics_desc: 'Kullanım ve render performansı içgörüleri.',
    nav_automatic_analysis: 'Automatic Analysis', nav_automatic_analysis_desc: 'İlan, anahtar kelime ve mağaza analizi için rakip zekâsı.',
    nav_market_intelligence: 'Create a List', nav_market_intelligence_desc: 'SEO GEO AEO başlık, açıklama ve anahtar kelime oluşturucu.',
    nav_settings: 'Ayarlar', nav_settings_desc: 'Çalışma alanı, hesap ve yerelleştirme ayarları.',
    nav_billing: 'Faturalama', nav_billing_desc: 'Planlar, kullanım ve gelecek abonelik yönetimi.',
    nav_admin: 'Admin', nav_admin_desc: 'Kullanıcılar, planlar, abonelikler ve erişim.',
    nav_platform: 'Platform', nav_platform_desc: 'Kuyruklar, worker, depolama ve sistem sağlığı.',
    sectionControls: 'Bölüm kontrolleri',
    sectionControlsDesc: 'Bu butonlar gerçek olarak çalışır; mevcut bölüm görünümünü değiştirir ve sayfa içeriğini filtreler.',
    overview: 'Genel Bakış', implemented: 'Hazır Olanlar', next: 'Sonraki Adımlar', metrics: 'Ölçümler',
    readyBlocks: 'Hazır blok', nextBlocks: 'Sıradaki blok', metricCards: 'Ölçüm kartı',
    readyCore: 'Hazır çekirdek', nextLayer: 'Sıradaki katman', metricSummary: 'Ölçüm özeti',
    noImplemented: 'Bu bölümde hazır özellik yok.', noNext: 'Bu bölümde sıradaki adım yok.',
    foundation: 'temeli', currentMetrics: 'Mevcut metrikler', currentMetricsDesc: 'Bu bölüm için statik kabuk metrikleri.',
    nextLane: 'Sıradaki şerit', nextLaneDesc: 'Bu öğeler bilerek ayrıldı ve bu yapıda henüz uygulanmadı.',
    onlyImplemented: 'Yalnızca gerçekten yapılmış parçalar yapılmış olarak gösterilir. Planlananlar sonraki şeritte kalır.',
    auto_title: 'Automatic Analysis',
    auto_subtitle: 'Listing, anahtar kelime, güven, fırsat, talep ve skor analizi için rakip zekâ çalışma alanı. Tarayıcı eklentisi kurulum/bağlantı akışı artık bu modülün parçası.',
    auto_ext_title: 'Eklenti kurulum ve bağlantı',
    auto_ext_desc: 'Final ürün akışı: kullanıcı bu sayfadan kurar, aktif tarayıcıya mağaza eklentisini yükler, sonra uygulama bağlantı durumunu algılar ve Etsy listing veya shop verisini güvenli ingest endpoint üzerinden alır.',
    detectedBrowser: 'Algılanan tarayıcı',
    auto_browser_help: 'Automatic Analysis mevcut tarayıcı için uygun kurulum hedefini seçer. Chrome ve Brave Chrome listesini kullanır. Edge kendi mağaza URL’sini kullanabilir.',
    installExtension: 'Eklentiyi Yükle', checkConnection: 'Bağlantıyı Kontrol Et', checking: 'Kontrol ediliyor…', openEtsyListing: 'Etsy Listing Aç', openEtsyShop: 'Etsy Shop Aç',
    auto_action_note: 'Dış link aksiyonları artık yalnızca gerçek pointer bırakma veya klavye Enter/Space tetiklerinde çalışır.',
    installedConnected: 'Kurulu / Bağlı', connected: 'Bağlı', notConnected: 'Bağlı değil', ready: 'Hazır', refreshing: 'Yenileniyor', waiting: 'Bekliyor', pageType: 'Sayfa türü', extensionVersion: 'Eklenti sürümü', lastSeen: 'Son görülme', installSource: 'Kurulum kaynağı',
    auto_note_1: 'Store URL env girildiğinde “Eklentiyi Yükle” ilgili tarayıcının mağaza sayfasını açar.',
    auto_note_2: 'Extension bağlandığında Automatic Analysis bunu polling ile algılar ve durum kartı Connected olur.',
    auto_note_3: 'Etsy sayfasındaki extension action veya content controls veriyi secure ingest endpoint üzerinden bu modüle yollar.',
    auto_note_4: 'Developer-mode unpacked akışı final kullanıcı deneyimi değildir; satış ürününde store/install akışı esas alınır.',
    auto_fallback_title: 'Manual, paste, URL ve CSV yedeği',
    auto_fallback_desc: 'Eklenti kurulup bağlanana kadar mevcut uzantısız iş akışları kullanılabilir kalır.',
    urlAssist: 'URL Yardımı', pasteContent: 'İçerik Yapıştır', manualEntry: 'Manuel Giriş', csvUpload: 'CSV Yükle',
    chooseCsv: 'CSV Seç', supportedHeaders: 'Desteklenen başlıklar: title, price, keywords, description/content, rating, reviews, sales, images, variations, products, listing_url, store_url, platform.',
    runAutomaticAnalysis: 'Automatic Analysis Çalıştır', runningAnalysis: 'Analiz çalışıyor…', saveToAnalytics: 'Analytics’e Kaydet', saving: 'Kaydediliyor…',
    rowsAnalyzed: 'Analiz edilen satır', strongestKeyword: 'En güçlü anahtar kelime', averagePrice: 'Ortalama fiyat', averageRating: 'Ortalama puan', mode: 'Mod',
    createListTitle: 'Create a List',
    createListSubtitle: 'Kendi ilanların için SEO GEO AEO odaklı başlık, açıklama ve anahtar kelime üretici.',
    createInput: 'Girdi oluştur', createInputDesc: 'Tam AI promptu yapıştır. Alan metninle büyür ve tek tıkla aynı sayfada tam liste üretilir.', aiPrompt: 'AI Prompt', aiButton: 'AI', runningAi: 'AI çalışıyor…',
    typePromptFirst: 'Önce bir AI promptu yaz.', copyFailed: 'Bu tarayıcıda kopyalama başarısız oldu.',
    liveRules: 'Canlı kurallar', liveRulesDesc: 'AI taslağı üretimden sonra sabit başlık, açıklama ve anahtar kelime kurallarını uygular.',
    titleMax: 'Başlık üst sınır', first40: 'İlk 40', keywords: 'Anahtar kelimeler', keywordMax: 'Anahtar kelime üst sınırı', priority: 'Öncelik',
    title: 'Başlık', description: 'Açıklama', copyTitle: 'Başlığı Kopyala', copyDescription: 'Açıklamayı Kopyala', copyKeywords: 'Anahtar Kelimeleri Kopyala', copied: 'Kopyalandı', length: 'Uzunluk',
    generatedTitleWaiting: 'Üretilen başlık burada görünecek.', generatedDescriptionWaiting: 'Üretilen açıklama burada görünecek.', generatedKeywordsWaiting: 'Üretilen anahtar kelimeler burada görünecek.', waitingTitleOutput: 'Başlık çıktısı bekleniyor',
    engineMode: 'Motor modu', aiConfigured: 'AI yapılandırıldı', aiStatus: 'AI durumu', yes: 'Evet', no: 'Hayır', stable: 'Stabil', fallback: 'Yedek',
    score: 'Skor', improvementNotes: 'Geliştirme notları',
    count: 'Adet', format: 'Format', commaSeparated: 'Virgülle ayrılmış',
    dashboardTitle: 'Printra çekirdek dashboard', dashboardSubtitle: 'Bu sürüm temiz monorepo kabuğunu, uygulama bölümlerini, ortak UI sistemini, dil temelini, API temelini ve worker temelini tek yapıda kilitler.',
    foundationLocked: 'Temel kilitlendi', foundationLockedDesc: 'Proje artık bölünmüş eski katmanlar yerine tek omurgadan başlıyor.',
    localizationBase: 'Dil temeli', localizationBaseDesc: 'İlk locale mimarisi Türkçe öncelikli ve global yayılıma hazır.',
    analyticsTitle: 'Analytics', analyticsSubtitle: 'Kayıtlı Automatic Analysis snapshot’ları artık bu sayfada görünüyor.',
    libraryTitle: 'Kütüphane', librarySubtitle: 'Depolama destekli kütüphane paneli; gerçek section, asset listesi, duplicate, delete ve müşteri sahipli altyapı rehberliği ile.',
    allPrimaryLanguages: '12 dil ana dil gibi çalışır',
    locale: 'Dil'
  },
  en: {
    shellBrandTitle: 'Premium mini SaaS core', shellBrandDesc: 'Clean shell for Studio, Library, Analytics, Create a List, Admin, and Platform.', unifiedShell: 'Unified shell', stack: 'Stack', studio: 'Studio', render: 'Render', locales: 'Locales', workspace: 'Workspace', operations: 'Operations', mockupLibrary: 'Mockup Library', designLibrary: 'Design Library', studioTools: 'Studio Tools', language: 'Language',
    nav_dashboard: 'Dashboard', nav_dashboard_desc: 'System overview and recent activity.', nav_projects: 'Projects', nav_projects_desc: 'Manage creative workspaces and saved outputs.', nav_studio: 'Studio', nav_studio_desc: 'Unified Canva-style design and mockup workspace.', nav_library: 'Library', nav_library_desc: 'Templates, mockups, assets, and brand kits.', nav_analytics: 'Analytics', nav_analytics_desc: 'Internal usage and render performance insights.', nav_automatic_analysis: 'Automatic Analysis', nav_automatic_analysis_desc: 'Competitor intelligence for listing, keyword, and store analysis.', nav_market_intelligence: 'Create a List', nav_market_intelligence_desc: 'SEO GEO AEO title, description, and keyword builder.', nav_settings: 'Settings', nav_settings_desc: 'Workspace, account, and localization settings.', nav_billing: 'Billing', nav_billing_desc: 'Plans, usage, and future subscription management.', nav_admin: 'Admin', nav_admin_desc: 'Users, plans, subscriptions, and access.', nav_platform: 'Platform', nav_platform_desc: 'Queues, workers, storage, and system health.',
    sectionControls: 'Section controls', sectionControlsDesc: 'These buttons work for real; they change the current section view and filter the page content.', overview: 'Overview', implemented: 'Implemented', next: 'Next steps', metrics: 'Metrics', readyBlocks: 'Ready blocks', nextBlocks: 'Next blocks', metricCards: 'Metric cards', readyCore: 'Ready core', nextLayer: 'Next layer', metricSummary: 'Metric summary', noImplemented: 'No implemented feature in this section.', noNext: 'No next-up item in this section.', foundation: 'foundation', currentMetrics: 'Current metrics', currentMetricsDesc: 'Static shell metrics for the current section.', nextLane: 'Next-up lane', nextLaneDesc: 'These items are intentionally reserved and not yet implemented in this build.', onlyImplemented: 'Only implemented pieces are shown as implemented. Planned items stay in the next-up lane.',
    auto_title: 'Automatic Analysis', auto_subtitle: 'Competitor intelligence workspace for listing, keyword, trust, opportunity, demand, and score analysis. Browser extension install/connect flow is now part of this module.', auto_ext_title: 'Extension install & connect', auto_ext_desc: 'Final product flow: user installs from this page, adds the store extension to the active browser, then the app detects connection status and receives Etsy listing or shop data through the secure ingest endpoint.', detectedBrowser: 'Detected browser', auto_browser_help: 'Automatic Analysis chooses the matching install destination for the current browser. Chrome and Brave use the Chrome listing. Edge can use its own store URL.', installExtension: 'Install Extension', checkConnection: 'Check Connection', checking: 'Checking…', openEtsyListing: 'Open Etsy Listing', openEtsyShop: 'Open Etsy Shop', auto_action_note: 'External link actions now run only on real pointer release or Enter/Space keyboard triggers.', installedConnected: 'Installed / Connected', connected: 'Connected', notConnected: 'Not connected', ready: 'Ready', refreshing: 'Refreshing', waiting: 'Waiting', pageType: 'Page type', extensionVersion: 'Extension version', lastSeen: 'Last seen', installSource: 'Install source', auto_note_1: 'When a store URL env is set, Install Extension opens the matching browser store page.', auto_note_2: 'When the extension connects, Automatic Analysis detects it through polling and marks the status card as Connected.', auto_note_3: 'Extension actions or content controls on Etsy send data to this module through the secure ingest endpoint.', auto_note_4: 'The developer-mode unpacked flow is not the final customer experience; store/install is the real product flow.', auto_fallback_title: 'Manual, paste, URL, and CSV fallback', auto_fallback_desc: 'Until the extension is installed and connected, existing non-extension workflows stay usable.', urlAssist: 'URL Assist', pasteContent: 'Paste Content', manualEntry: 'Manual Entry', csvUpload: 'CSV Upload', chooseCsv: 'Choose CSV', supportedHeaders: 'Supported headers: title, price, keywords, description/content, rating, reviews, sales, images, variations, products, listing_url, store_url, platform.', runAutomaticAnalysis: 'Run Automatic Analysis', runningAnalysis: 'Running analysis…', saveToAnalytics: 'Save to Analytics', saving: 'Saving…', rowsAnalyzed: 'Rows analyzed', strongestKeyword: 'Strongest keyword', averagePrice: 'Average price', averageRating: 'Average rating', mode: 'Mode',
    createListTitle: 'Create a List', createListSubtitle: 'SEO GEO AEO focused title, description, and keyword builder for your own listings.', createInput: 'Create input', createInputDesc: 'Paste a full AI prompt. The area grows with your text and one click generates the full list on the same page.', aiPrompt: 'AI Prompt', aiButton: 'AI', runningAi: 'Running AI…', typePromptFirst: 'Type an AI prompt first.', copyFailed: 'Copy failed on this browser.', liveRules: 'Live rules', liveRulesDesc: 'AI drafting follows fixed title, description, and keyword rules after generation.', titleMax: 'Title max', first40: 'First 40', keywords: 'Keywords', keywordMax: 'Keyword max', priority: 'Priority', title: 'Title', description: 'Description', copyTitle: 'Copy Title', copyDescription: 'Copy Description', copyKeywords: 'Copy Keywords', copied: 'Copied', length: 'Length', generatedTitleWaiting: 'Your generated title will appear here.', generatedDescriptionWaiting: 'Your generated description will appear here.', generatedKeywordsWaiting: 'Your generated keywords will appear here.', waitingTitleOutput: 'Waiting for title output', engineMode: 'Engine mode', aiConfigured: 'AI configured', aiStatus: 'AI status', yes: 'Yes', no: 'No', stable: 'Stable', fallback: 'Fallback', score: 'Score', improvementNotes: 'Improvement notes', count: 'Count', format: 'Format', commaSeparated: 'Comma separated',
    dashboardTitle: 'Printra core dashboard', dashboardSubtitle: 'This build locks the clean monorepo shell, app sections, shared UI system, localization base, API foundation, and worker foundation into one controlled structure.', foundationLocked: 'Foundation locked', foundationLockedDesc: 'The project now starts from a single deliberate spine instead of split legacy layers.', localizationBase: 'Localization base', localizationBaseDesc: 'Initial locale architecture is ready for Turkish-first and global rollout.', analyticsTitle: 'Analytics', analyticsSubtitle: 'Saved Automatic Analysis snapshots now appear on this page.', libraryTitle: 'Library', librarySubtitle: 'Storage-backed library panel with real sections, asset listing, duplicate, delete, and customer-owned infrastructure guidance.', allPrimaryLanguages: '12 languages act as primary UI languages', locale: 'Locale'
  }
};

const studioLocaleOverrides: Record<'tr' | 'en', Record<string, string>> = {
  tr: {
    studioCanvasTitle: 'Studio canvas',
    studioCanvasDesc: 'Obje state bu sahnede görünür, seçime bağlanır, sürüklenir ve köşelerden yeniden boyutlanır.',
    studioCanvasState: 'Canvas state',
    studioClearScene: 'Sahneyi temizle',
    studioSceneDesign: 'Saf tasarım sahnesi',
    studioSceneMockup: 'Ürün üstü önizleme sahnesi',
    studioSceneSplit: 'Yan yana tasarım + mockup görünümü',
    studioInteractionRotating: 'Döndürülüyor',
    studioInteractionResizing: 'Boyutlanıyor',
    studioInteractionDragging: 'Sürükleniyor',
    studioInteractionIdle: 'Beklemede',
    studioMockupEditorSurface: 'Mockup editor surface',
    studioMockupStage: 'Mockup stage',
    studioInspectorTitle: 'Inspector',
    studioInspectorDesc: 'Bağlam duyarlı sağ panel artık gerçek obje kayıtlarını, konum ve boyut bilgisini gösterir.',
    studioTabProperties: 'Özellikler',
    studioTabLayers: 'Katmanlar',
    studioTabScene: 'Sahne',
    studioLayerLaneTitle: 'Layer lane',
    studioLayerLaneDesc: 'Katman paneli gerçek obje listesinden üretilir ve seçimle senkron çalışır.',
    studioCtxDuplicate: 'Çoğalt',
    studioCtxDelete: 'Sil',
    studioCommandBarTitle: 'Studio command bar',
    studioCommandBarDesc: 'Mode, aktif araç ve export kontrolü kompakt çubukta tutulur.',
    studioCommandBarOpen: 'Açık',
    studioCommandBarCollapsed: 'Kapalı',
    refreshBtn: 'Yenile',
    resetDefaultsBtn: 'Varsayılanlara dön',
    saveBtn: 'Kaydet',
    savingBtn: 'Kaydediliyor',
    adminSubtitle: 'Kullanıcı, rol, plan politikası, davet ve erişim kurallarını tek panelden yöneten temiz admin yüzeyi.',
    adminUserMatrixTitle: 'Kullanıcı matrisi',
    adminUserMatrixDesc: 'Rol, durum, plan kapsamı ve MFA tek tablodan düzenlenir.',
    adminRoleSchemaTitle: 'Rol şeması',
    adminRoleSchemaDesc: 'Yetkiler düzenlenebilir ve mevcut kullanıcı sayısıyla birlikte görünür.',
    adminAddUserBtn: 'Kullanıcı ekle',
    adminNewUserName: 'Yeni kullanıcı',
    adminDeleteBtn: 'Sil',
    adminLastActivity: 'Son aktivite',
    billingSubtitle: 'Plan, koltuk, kullanım ve fatura verilerini tek yerden yönetin. Bu ekran iç sistem billing durumunu çalışır halde tutar.',
    billingAutoRenewLabel: 'Auto renew aktif kalsın',
    studioMockupLibraryDesc: 'Manage the brand and model mockup archive inside the expanded drawer.',
    studioDesignLibraryDesc: 'Organize the design archive with card-based selection and multi-send flow.',
    studioToolsLibraryDesc: 'Move scene tools out of the narrow column into a dedicated control drawer.',
    studioStatusActiveMode: 'Active mode',
    studioStatusActiveTool: 'Active tool',
    studioStatusSelectedObject: 'Selected object',
    studioStatusObjectCount: 'Object count',
    studioExportDesc: 'Single export downloads in its own format. Multi-format selection is bundled as zip.',
    studioPanelLabel: 'Studio panel',
    studioMockupSectionPlaceholder: 'New brand / model section',
    studioDesignSectionPlaceholder: 'New design section',
    studioAddSectionBtn: 'Add section',
    studioMockupHelperMultiStage: 'If multiple mockups are selected, new pages are created up to stage count.',
    studioDesignHelperMultiSend: 'Multi-send applies selected designs to all mockup stages.',
    studioRecordCount: 'records',
    studioOptionsBtn: 'Options',
    studioUploadLabel: 'Upload',
    studioSendSelectedMockups: 'Send selected',
    studioSendSelectedDesigns: 'Send multiple',
    studioDuplicateSelected: 'Duplicate selected',
    studioDeleteSelected: 'Delete selected',
    studioEmptySectionLabel: 'This section is empty. Upload the first files.',
    studioAssetLinkedCanvas: 'Canvas linked',
    studioAssetLibraryReady: 'Library ready',
    studioSendBtn: 'Send'
  },
  en: {
    studioCanvasTitle: 'Studio canvas',
    studioCanvasDesc: 'Object state is visible in this scene, selection stays linked, drag is active, and corners resize in real time.',
    studioCanvasState: 'Canvas state',
    studioClearScene: 'Clear scene',
    studioSceneDesign: 'Pure design scene',
    studioSceneMockup: 'Product preview scene',
    studioSceneSplit: 'Side-by-side design + mockup view',
    studioInteractionRotating: 'Rotating',
    studioInteractionResizing: 'Resizing',
    studioInteractionDragging: 'Dragging',
    studioInteractionIdle: 'Idle',
    studioMockupEditorSurface: 'Mockup editor surface',
    studioMockupStage: 'Mockup stage',
    studioInspectorTitle: 'Inspector',
    studioInspectorDesc: 'The context-aware right panel now shows real object records with position and size details.',
    studioTabProperties: 'Properties',
    studioTabLayers: 'Layers',
    studioTabScene: 'Scene',
    studioLayerLaneTitle: 'Layer lane',
    studioLayerLaneDesc: 'The layer panel is produced from the real object list and stays synchronized with selection.',
    studioCtxDuplicate: 'Duplicate',
    studioCtxDelete: 'Delete',
    studioCommandBarTitle: 'Studio command bar',
    studioCommandBarDesc: 'Mode, active tool, and export controls stay inside the compact bar.',
    studioCommandBarOpen: 'Open',
    studioCommandBarCollapsed: 'Collapsed',
    refreshBtn: 'Refresh',
    resetDefaultsBtn: 'Reset defaults',
    saveBtn: 'Save',
    savingBtn: 'Saving',
    adminSubtitle: 'Clean admin surface to manage users, roles, plan policies, invites, and access rules from one panel.',
    adminUserMatrixTitle: 'User matrix',
    adminUserMatrixDesc: 'Role, status, plan scope, and MFA are managed from one table.',
    adminRoleSchemaTitle: 'Role schema',
    adminRoleSchemaDesc: 'Permissions are editable and shown with current user counts.',
    adminAddUserBtn: 'Add user',
    adminNewUserName: 'New user',
    adminDeleteBtn: 'Delete',
    adminLastActivity: 'Last active',
    billingSubtitle: 'Manage plans, seats, usage, and invoices in one place. This screen keeps internal billing state operational.',
    billingAutoRenewLabel: 'Keep auto renew enabled',
    studioMockupLibraryDesc: 'Manage the brand and model mockup archive inside the expanded drawer.',
    studioDesignLibraryDesc: 'Organize the design archive with card-based selection and multi-send flow.',
    studioToolsLibraryDesc: 'Move scene tools out of the narrow column into a dedicated control drawer.',
    studioStatusActiveMode: 'Active mode',
    studioStatusActiveTool: 'Active tool',
    studioStatusSelectedObject: 'Selected object',
    studioStatusObjectCount: 'Object count',
    studioExportDesc: 'Single export downloads in its own format. Multi-format selection is bundled as zip.',
    studioPanelLabel: 'Studio panel',
    studioMockupSectionPlaceholder: 'New brand / model section',
    studioDesignSectionPlaceholder: 'New design section',
    studioAddSectionBtn: 'Add section',
    studioMockupHelperMultiStage: 'If multiple mockups are selected, new pages are created up to stage count.',
    studioDesignHelperMultiSend: 'Multi-send applies selected designs to all mockup stages.',
    studioRecordCount: 'records',
    studioOptionsBtn: 'Options',
    studioUploadLabel: 'Upload',
    studioSendSelectedMockups: 'Send selected',
    studioSendSelectedDesigns: 'Send multiple',
    studioDuplicateSelected: 'Duplicate selected',
    studioDeleteSelected: 'Delete selected',
    studioEmptySectionLabel: 'This section is empty. Upload the first files.',
    studioAssetLinkedCanvas: 'Canvas linked',
    studioAssetLibraryReady: 'Library ready',
    studioSendBtn: 'Send'
  }
};

Object.assign(messages.tr, studioLocaleOverrides.tr);
Object.assign(messages.en, studioLocaleOverrides.en);

const fallbackLocale: SupportedLocale = 'en';

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string) => string;
  isRTL: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function normalizeLocale(input?: string | null): SupportedLocale {
  if (!input) return 'tr';
  const exact = supportedLocales.find((locale) => locale.toLowerCase() === input.toLowerCase());
  if (exact) return exact;
  const short = input.split('-')[0]?.toLowerCase();
  if (short === 'zh') return 'zh-CN';
  const matched = supportedLocales.find((locale) => locale.split('-')[0].toLowerCase() === short);
  return matched ?? 'tr';
}

function getMessages(locale: SupportedLocale) {
  return (messages as any)[locale] ?? messages[fallbackLocale];
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('tr');

  useEffect(() => {
    const fromStorage = typeof window !== 'undefined' ? window.localStorage.getItem('printra-locale') : null;
    const next = normalizeLocale(fromStorage || (typeof navigator !== 'undefined' ? navigator.language : 'tr'));
    setLocaleState(next);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
      document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    }
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: (next: SupportedLocale) => {
      setLocaleState(next);
      if (typeof window !== 'undefined') window.localStorage.setItem('printra-locale', next);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = next;
        document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
      }
    },
    t: (key: string) => {
      const base = getMessages(locale);
      return base[key] ?? messages[fallbackLocale]?.[key] ?? key;
    },
    isRTL: locale === 'ar'
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return context;
}

