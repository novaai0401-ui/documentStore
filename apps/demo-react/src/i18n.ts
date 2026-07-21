/**
 * Lightweight UI internationalisation. Covers the most-used Indian languages
 * (Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Urdu) and high-population
 * foreign languages (Spanish, French, German, Portuguese, Chinese, Arabic,
 * Russian, Japanese, Indonesian). t() falls back to English for any missing
 * string, so the dictionary can be filled incrementally without breakage. RTL
 * languages (Urdu, Arabic) flip document direction. Persisted + auto-detected.
 *
 * The selected language is a tiny global store (getLang/setLang/subscribeLang +
 * the useLang() hook) so every component — editors included — re-renders the
 * moment the language changes, with no prop-drilling.
 */
import { useSyncExternalStore } from 'react';
import { HOME_STRINGS } from './homeStrings.js';

export type Lang = 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'ur' | 'kn' | 'ml' | 'pa' | 'or' | 'as' | 'es' | 'fr' | 'de' | 'pt' | 'zh' | 'ar' | 'ru' | 'ja' | 'id';

export const LANGUAGES: { code: Lang; native: string; english: string }[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia' },
  { code: 'as', native: 'অসমীয়া', english: 'Assamese' },
  { code: 'ur', native: 'اردو', english: 'Urdu' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'zh', native: '中文', english: 'Chinese' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian' },
];

export const RTL = new Set<Lang>(['ur', 'ar']);
export function isRtl(lang: Lang): boolean { return RTL.has(lang); }

export type StrKey = 'brand_tagline' | 'hero_sub' | 'cta_primary' | 'cta_docs' | 'trust' | 'lang_label' | 'open_document'
  | 'nav_open' | 'nav_design' | 'nav_tools' | 'nav_library' | 'nav_docs' | 'search_placeholder'
  | 'group_create' | 'group_images_pdf' | 'group_capture_video' | 'group_documents'
  | 'join_requesting' | 'join_requesting_sub' | 'join_denied' | 'join_denied_forwarded'
  | 'join_denied_timeout' | 'join_denied_invalid' | 'join_go_library'
  | 'studio_share' | 'studio_call' | 'studio_animate' | 'studio_save_png' | 'studio_download_pdf'
  | 'studio_resize_all' | 'more_label' | 'tool_text' | 'tool_box' | 'tool_oval' | 'tool_line'
  | 'tool_image' | 'tool_logo' | 'studio_add' | 'studio_edit' | 'studio_done'
  | 'mm_all_pages_pdf' | 'mm_mail_merge' | 'mm_save_template' | 'mm_open_template'
  | 'mm_version_history' | 'mm_comments' | 'mm_open_in_pdf' | 'act_close' | 'act_browse' | 'act_download' | 'act_download_png' | 'act_change_image'
  | 'm_compress_title' | 'm_compress_desc' | 'm_compress_drop' | 'm_compress_run'
  | 'm_convert_title' | 'm_convert_desc' | 'm_convert_pdf' | 'm_convert_drop' | 'act_convert_to' | 'act_add_folder'
  | 'm_watermark_title' | 'm_watermark_desc' | 'm_watermark_drop' | 'm_watermark_apply'
  | 'm_meme_title' | 'm_meme_desc' | 'm_meme_drop'
  | 'm_collage_title' | 'm_collage_desc' | 'm_collage_drop'
  | 'm_sign_title' | 'm_sign_verify' | 'm_combine_title' | 'm_qr_title' | 'm_qr_insert'
  // Tools-menu item labels + descriptions
  | 'tl_design' | 'td_design' | 'tl_prompt' | 'td_prompt' | 'tl_ask_ai' | 'td_ask_ai'
  | 'tl_invitation' | 'td_invitation' | 'tl_collage' | 'td_collage' | 'tl_meme' | 'td_meme'
  | 'tl_image' | 'td_image'
  | 'tl_compress' | 'td_compress' | 'tl_convert' | 'td_convert' | 'tl_watermark' | 'td_watermark'
  | 'tl_pdf_forms' | 'td_pdf_forms' | 'tl_protect' | 'td_protect' | 'tl_scan' | 'td_scan'
  | 'tl_record' | 'td_record' | 'tl_video' | 'td_video' | 'tl_sign' | 'td_sign' | 'tl_combine' | 'td_combine'
  // Remaining modal headers + actions
  | 'm_resume_title' | 'm_letter_title' | 'm_scan_title' | 'm_record_title' | 'm_video_title'
  | 'm_protect_title' | 'm_pdfform_title' | 'act_save' | 'act_apply'
  // Shared in-modal control labels
  | 'ctl_quality' | 'ctl_format' | 'ctl_maxsize' | 'ctl_mode' | 'ctl_opacity' | 'ctl_angle'
  | 'ctl_colour' | 'ctl_columns' | 'ctl_spacing' | 'ctl_rounding' | 'ctl_tile'
  // Ask AI modal
  | 'ai_settings' | 'ai_hide_settings' | 'ai_here' | 'ai_byok' | 'ai_endpoint' | 'ai_api_key'
  | 'ai_model' | 'ai_key_ph' | 'ai_local' | 'ai_local_needs' | 'ai_local_note' | 'ai_resume'
  | 'ai_no_chats' | 'ai_new' | 'ai_save_md' | 'ai_ask_ph' | 'ai_need_key'
  // Prompt-to-design modal
  | 'pd_title' | 'pd_desc' | 'pd_placeholder' | 'pd_size' | 'pd_create'
  // Shared actions
  | 'act_cancel' | 'wz_create_resume' | 'wz_create_letter' | 'wz_prefill' | 'wz_upload_photo'
  // Capture panels (scanner/recorder/video)
  | 'cap_start' | 'cap_stop' | 'cap_retake' | 'cap_camera' | 'cap_screen' | 'cap_mic'
  // Studio properties panel
  | 'prop_weight' | 'prop_font' | 'prop_align' | 'prop_rotation' | 'prop_corner_radius' | 'prop_thickness'
  | 'wt_regular' | 'wt_semibold' | 'wt_bold' | 'wt_black' | 'al_left' | 'al_center' | 'al_right'
  | 'studio_select_hint' | 'studio_selected'
  // Résumé design section headers (generated at create time)
  | 'rh_contact' | 'rh_education' | 'rh_experience' | 'rh_photo' | 'rh_profile' | 'rh_skills' | 'rh_summary'
  // Résumé & cover-letter wizard form fields
  | 'rf_prefill' | 'rf_paste_ph' | 'rf_full_name' | 'rf_title_role' | 'rf_email' | 'rf_phone'
  | 'rf_location' | 'rf_link' | 'rf_jd' | 'rf_summary' | 'rf_skills' | 'rf_experience' | 'rf_add_role'
  | 'rf_role' | 'rf_company' | 'rf_dates' | 'rf_highlights' | 'rf_education' | 'rf_add_education'
  | 'rf_degree' | 'rf_school' | 'rf_style_accent' | 'rf_accent' | 'rf_ai_write' | 'rf_ai_tailor'
  | 'cl_your_details' | 'cl_date' | 'cl_addressed_to' | 'cl_recipient_name' | 'cl_recipient_title'
  | 'cl_greeting' | 'cl_jd' | 'cl_body' | 'cl_closing' | 'cl_ai_write' | 'cl_ai_tailor'
  // Library search
  | 'srch_search' | 'srch_searching' | 'srch_no_match' | 'srch_tools' | 'srch_docs'
  // PDF form builder
  | 'pf_desc' | 'pf_field_type' | 'pf_text_field' | 'pf_checkbox' | 'pf_fields_placed'
  | 'pf_field_name' | 'pf_rendering' | 'pf_save' | 'pf_open_editor';

const STRINGS: Record<StrKey, Partial<Record<Lang, string>>> = {
  brand_tagline: {
    en: 'The free, private PDF, document & media studio',
    hi: 'मुफ़्त, निजी PDF, दस्तावेज़ और मीडिया स्टूडियो',
    bn: 'বিনামূল্যে, ব্যক্তিগত PDF, নথি ও মিডিয়া স্টুডিও',
    te: 'ఉచిత, ప్రైవేట్ PDF, పత్రం & మీడియా స్టూడియో',
    mr: 'मोफत, खाजगी PDF, दस्तऐवज आणि मीडिया स्टुडिओ',
    ta: 'இலவச, தனிப்பட்ட PDF, ஆவண மற்றும் ஊடக ஸ்டுடியோ',
    gu: 'મફત, ખાનગી PDF, દસ્તાવેજ અને મીડિયા સ્ટુડિયો',
    ur: 'مفت، نجی PDF، دستاویز اور میڈیا اسٹوڈیو',
    es: 'El estudio gratuito y privado de PDF, documentos y medios',
    fr: 'Le studio PDF, documents et médias gratuit et privé',
    de: 'Das kostenlose, private Studio für PDF, Dokumente und Medien',
    pt: 'O estúdio gratuito e privado de PDF, documentos e mídia',
    zh: '免费、私密的 PDF、文档和媒体工作室',
    ar: 'استوديو PDF والمستندات والوسائط المجاني والخاص',
    ru: 'Бесплатная приватная студия PDF, документов и медиа',
    ja: '無料でプライベートな PDF・ドキュメント・メディアスタジオ',
    id: 'Studio PDF, dokumen & media yang gratis dan privat',
  },
  hero_sub: {
    en: 'Edit PDFs & documents, design posts & résumés, and collaborate — 100% in your browser. Nothing leaves your device.',
    hi: 'PDF और दस्तावेज़ संपादित करें, डिज़ाइन बनाएं और मिलकर काम करें — 100% आपके ब्राउज़र में। कुछ भी आपके डिवाइस से बाहर नहीं जाता।',
    bn: 'PDF ও নথি সম্পাদনা করুন, ডিজাইন করুন এবং একসাথে কাজ করুন — ১০০% আপনার ব্রাউজারে। কিছুই আপনার ডিভাইস ছাড়ে না।',
    te: 'PDF మరియు పత్రాలను సవరించండి, డిజైన్ చేయండి, కలిసి పని చేయండి — 100% మీ బ్రౌజర్‌లో. ఏదీ మీ పరికరం నుండి బయటకు వెళ్లదు.',
    mr: 'PDF आणि दस्तऐवज संपादित करा, डिझाइन करा आणि एकत्र काम करा — 100% तुमच्या ब्राउझरमध्ये. काहीही तुमचे डिव्हाइस सोडत नाही.',
    ta: 'PDF மற்றும் ஆவணங்களைத் திருத்தவும், வடிவமைக்கவும், ஒன்றாக வேலை செய்யவும் — 100% உங்கள் உலாவியில். எதுவும் உங்கள் சாதனத்தை விட்டு வெளியேறாது.',
    gu: 'PDF અને દસ્તાવેજો સંપાદિત કરો, ડિઝાઇન કરો અને સાથે કામ કરો — 100% તમારા બ્રાઉઝરમાં. કંઈ પણ તમારું ડિવાઇસ છોડતું નથી.',
    ur: 'PDF اور دستاویزات میں ترمیم کریں، ڈیزائن بنائیں اور مل کر کام کریں — 100% آپ کے براؤزر میں۔ کچھ بھی آپ کے آلے سے باہر نہیں جاتا۔',
    es: 'Edita PDFs y documentos, diseña y colabora — 100% en tu navegador. Nada sale de tu dispositivo.',
    fr: 'Modifiez des PDF et des documents, créez et collaborez — 100 % dans votre navigateur. Rien ne quitte votre appareil.',
    de: 'Bearbeite PDFs und Dokumente, gestalte und arbeite zusammen — 100 % im Browser. Nichts verlässt dein Gerät.',
    pt: 'Edite PDFs e documentos, crie designs e colabore — 100% no seu navegador. Nada sai do seu dispositivo.',
    zh: '编辑 PDF 和文档、设计并协作——100% 在您的浏览器中。任何内容都不会离开您的设备。',
    ar: 'حرّر ملفات PDF والمستندات، صمّم وتعاون — 100% في متصفحك. لا شيء يغادر جهازك.',
    ru: 'Редактируйте PDF и документы, создавайте дизайн и работайте вместе — 100% в браузере. Ничего не покидает ваше устройство.',
    ja: 'PDF や文書を編集し、デザインし、共同作業——100% ブラウザ内で。何もデバイスから出ません。',
    id: 'Edit PDF dan dokumen, desain, dan berkolaborasi — 100% di browser Anda. Tidak ada yang keluar dari perangkat Anda.',
  },
  cta_primary: {
    en: 'Edit a PDF now — it’s free', hi: 'अभी PDF संपादित करें — यह मुफ़्त है', bn: 'এখনই PDF সম্পাদনা করুন — বিনামূল্যে',
    te: 'ఇప్పుడే PDF సవరించండి — ఉచితం', mr: 'आता PDF संपादित करा — मोफत', ta: 'இப்போது PDF திருத்தவும் — இலவசம்',
    gu: 'હમણાં PDF સંપાદિત કરો — મફત', ur: 'ابھی PDF میں ترمیم کریں — مفت', es: 'Edita un PDF ahora — es gratis',
    fr: 'Modifier un PDF — c’est gratuit', de: 'Jetzt ein PDF bearbeiten — kostenlos', pt: 'Edite um PDF agora — é grátis',
    zh: '立即编辑 PDF——免费', ar: 'حرّر ملف PDF الآن — مجانًا', ru: 'Редактировать PDF — бесплатно',
    ja: '今すぐ PDF を編集 — 無料', id: 'Edit PDF sekarang — gratis',
  },
  cta_docs: {
    en: 'Read the docs', hi: 'दस्तावेज़ पढ़ें', bn: 'ডকুমেন্ট পড়ুন', te: 'డాక్యుమెంట్లు చదవండి', mr: 'दस्तऐवज वाचा',
    ta: 'ஆவணங்களைப் படிக்கவும்', gu: 'દસ્તાવેજો વાંચો', ur: 'دستاویزات پڑھیں', es: 'Leer la documentación',
    fr: 'Lire la documentation', de: 'Dokumentation lesen', pt: 'Ler a documentação', zh: '阅读文档',
    ar: 'اقرأ الوثائق', ru: 'Читать документацию', ja: 'ドキュメントを読む', id: 'Baca dokumentasi',
  },
  trust: {
    en: 'Your files never leave your device', hi: 'आपकी फ़ाइलें कभी आपके डिवाइस से बाहर नहीं जातीं',
    bn: 'আপনার ফাইল কখনো আপনার ডিভাইস ছাড়ে না', te: 'మీ ఫైళ్లు ఎప్పుడూ మీ పరికరాన్ని వదిలి వెళ్లవు',
    mr: 'तुमच्या फायली कधीही तुमचे डिव्हाइस सोडत नाहीत', ta: 'உங்கள் கோப்புகள் உங்கள் சாதனத்தை விட்டு வெளியேறாது',
    gu: 'તમારી ફાઇલો ક્યારેય તમારું ડિવાઇસ છોડતી નથી', ur: 'آپ کی فائلیں کبھی آپ کا آلہ نہیں چھوڑتیں',
    es: 'Tus archivos nunca salen de tu dispositivo', fr: 'Vos fichiers ne quittent jamais votre appareil',
    de: 'Deine Dateien verlassen nie dein Gerät', pt: 'Seus arquivos nunca saem do seu dispositivo',
    zh: '您的文件永不离开您的设备', ar: 'ملفاتك لا تغادر جهازك أبدًا', ru: 'Ваши файлы никогда не покидают устройство',
    ja: 'ファイルがデバイスから出ることはありません', id: 'File Anda tidak pernah keluar dari perangkat Anda',
  },
  lang_label: {
    en: 'Language', hi: 'भाषा', bn: 'ভাষা', te: 'భాష', mr: 'भाषा', ta: 'மொழி', gu: 'ભાષા', ur: 'زبان',
    kn: 'ಭಾಷೆ', ml: 'ഭാഷ', pa: 'ਭਾਸ਼ਾ', or: 'ଭାଷା', as: 'ভাষা', es: 'Idioma', fr: 'Langue', de: 'Sprache', pt: 'Idioma', zh: '语言', ar: 'اللغة', ru: 'Язык', ja: '言語', id: 'Bahasa',
  },
  open_document: {
    en: 'Open a document', hi: 'दस्तावेज़ खोलें', bn: 'একটি নথি খুলুন', te: 'పత్రాన్ని తెరవండి', mr: 'दस्तऐवज उघडा',
    ta: 'ஆவணத்தைத் திறக்கவும்', gu: 'દસ્તાવેજ ખોલો', ur: 'دستاویز کھولیں', kn: 'ದಾಖಲೆ ತೆರೆಯಿರಿ', ml: 'പ്രമാണം തുറക്കുക', pa: 'ਦਸਤਾਵੇਜ਼ ਖੋਲ੍ਹੋ', or: 'ଡକ୍ୟୁମେଣ୍ଟ ଖୋଲନ୍ତୁ', as: 'নথি খোলক', es: 'Abrir un documento',
    fr: 'Ouvrir un document', de: 'Dokument öffnen', pt: 'Abrir um documento', zh: '打开文档',
    ar: 'افتح مستندًا', ru: 'Открыть документ', ja: 'ドキュメントを開く', id: 'Buka dokumen',
  },
  nav_open: {
    en: 'Open a file', hi: 'फ़ाइल खोलें', bn: 'ফাইল খুলুন', te: 'ఫైల్ తెరవండి', mr: 'फाइल उघडा', ta: 'கோப்பைத் திற', gu: 'ફાઇલ ખોલો', ur: 'فائل کھولیں',
    kn: 'ಫೈಲ್ ತೆರೆಯಿರಿ', ml: 'ഫയൽ തുറക്കുക', pa: 'ਫਾਈਲ ਖੋਲ੍ਹੋ', or: 'ଫାଇଲ୍ ଖୋଲନ୍ତୁ', as: 'ফাইল খোলক',
    es: 'Abrir archivo', fr: 'Ouvrir un fichier', de: 'Datei öffnen', pt: 'Abrir arquivo', zh: '打开文件', ar: 'فتح ملف', ru: 'Открыть файл', ja: 'ファイルを開く', id: 'Buka file',
  },
  nav_design: {
    en: 'Design studio', hi: 'डिज़ाइन स्टूडियो', bn: 'ডিজাইন স্টুডিও', te: 'డిజైన్ స్టూడియో', mr: 'डिझाइन स्टुडिओ', ta: 'வடிவமைப்பு ஸ்டூடியோ', gu: 'ડિઝાઇન સ્ટુડિયો', ur: 'ڈیزائن اسٹوڈیو',
    kn: 'ಡಿಸೈನ್ ಸ್ಟುಡಿಯೋ', ml: 'ഡിസൈൻ സ്റ്റുഡിയോ', pa: 'ਡਿਜ਼ਾਈਨ ਸਟੂਡੀਓ', or: 'ଡିଜାଇନ୍ ଷ୍ଟୁଡିଓ', as: 'ডিজাইন ষ্টুডিঅ’',
    es: 'Estudio de diseño', fr: 'Studio de design', de: 'Design-Studio', pt: 'Estúdio de design', zh: '设计工作室', ar: 'استوديو التصميم', ru: 'Дизайн-студия', ja: 'デザインスタジオ', id: 'Studio desain',
  },
  nav_tools: {
    en: 'Tools', hi: 'उपकरण', bn: 'টুল', te: 'ఉపకరణాలు', mr: 'साधने', ta: 'கருவிகள்', gu: 'સાધનો', ur: 'ٹولز',
    kn: 'ಪರಿಕರಗಳು', ml: 'ഉപകരണങ്ങൾ', pa: 'ਟੂਲ', or: 'ଉପକରଣ', as: 'সঁজুলি',
    es: 'Herramientas', fr: 'Outils', de: 'Werkzeuge', pt: 'Ferramentas', zh: '工具', ar: 'أدوات', ru: 'Инструменты', ja: 'ツール', id: 'Alat',
  },
  nav_library: {
    en: 'Home', hi: 'होम', bn: 'হোম', te: 'హోమ్', mr: 'होम', ta: 'முகப்பு', gu: 'હોમ', ur: 'ہوم',
    kn: 'ಮುಖಪುಟ', ml: 'ഹോം', pa: 'ਹੋਮ', or: 'ହୋମ', as: 'হোম',
    es: 'Inicio', fr: 'Accueil', de: 'Startseite', pt: 'Início', zh: '主页', ar: 'الرئيسية', ru: 'Главная', ja: 'ホーム', id: 'Beranda',
  },
  nav_docs: {
    en: 'Docs', hi: 'दस्तावेज़', bn: 'ডকুমেন্ট', te: 'డాక్స్', mr: 'दस्तऐवज', ta: 'ஆவணங்கள்', gu: 'દસ્તાવેજો', ur: 'دستاویزات',
    kn: 'ದಾಖಲೆಗಳು', ml: 'ഡോക്‌സ്', pa: 'ਦਸਤਾਵੇਜ਼', or: 'ଡକ୍ସ', as: 'নথি',
    es: 'Docs', fr: 'Docs', de: 'Doku', pt: 'Docs', zh: '文档', ar: 'الوثائق', ru: 'Документы', ja: 'ドキュメント', id: 'Dokumen',
  },
  group_create: {
    en: 'Create', hi: 'बनाएं', bn: 'তৈরি করুন', te: 'సృష్టించు', mr: 'तयार करा', ta: 'உருவாக்கு', gu: 'બનાવો', ur: 'بنائیں',
    es: 'Crear', fr: 'Créer', de: 'Erstellen', pt: 'Criar', zh: '创建', ar: 'إنشاء', ru: 'Создать', ja: '作成', id: 'Buat',
  },
  group_images_pdf: {
    en: 'Images & PDF', hi: 'छवियाँ और PDF', bn: 'ছবি ও PDF', te: 'చిత్రాలు & PDF', mr: 'प्रतिमा आणि PDF', ta: 'படங்கள் & PDF',
    gu: 'છબીઓ અને PDF', ur: 'تصاویر اور PDF', es: 'Imágenes y PDF', fr: 'Images et PDF', de: 'Bilder & PDF', pt: 'Imagens e PDF',
    zh: '图片和 PDF', ar: 'الصور و PDF', ru: 'Изображения и PDF', ja: '画像と PDF', id: 'Gambar & PDF',
  },
  group_capture_video: {
    en: 'Capture & video', hi: 'कैप्चर और वीडियो', bn: 'ক্যাপচার ও ভিডিও', te: 'క్యాప్చర్ & వీడియో', mr: 'कॅप्चर आणि व्हिडिओ',
    ta: 'பிடிப்பு & வீடியோ', gu: 'કૅપ્ચર અને વિડિઓ', ur: 'کیپچر اور ویڈیو', es: 'Captura y vídeo', fr: 'Capture et vidéo',
    de: 'Aufnahme & Video', pt: 'Captura e vídeo', zh: '捕获和视频', ar: 'الالتقاط والفيديو', ru: 'Захват и видео', ja: 'キャプチャと動画', id: 'Tangkap & video',
  },
  group_documents: {
    en: 'Documents', hi: 'दस्तावेज़', bn: 'নথি', te: 'పత్రాలు', mr: 'दस्तऐवज', ta: 'ஆவணங்கள்', gu: 'દસ્તાવેજો', ur: 'دستاویزات',
    es: 'Documentos', fr: 'Documents', de: 'Dokumente', pt: 'Documentos', zh: '文档', ar: 'المستندات', ru: 'Документы', ja: 'ドキュメント', id: 'Dokumen',
  },
  search_placeholder: {
    en: 'Search your documents by meaning… (local, private)',
    hi: 'अपने दस्तावेज़ अर्थ से खोजें… (स्थानीय, निजी)', bn: 'অর্থ অনুসারে আপনার নথি খুঁজুন… (স্থানীয়, ব্যক্তিগত)',
    te: 'మీ పత్రాలను అర్థం ద్వారా శోధించండి… (స్థానిక, ప్రైవేట్)', mr: 'अर्थानुसार तुमचे दस्तऐवज शोधा… (स्थानिक, खाजगी)',
    ta: 'பொருள் மூலம் உங்கள் ஆவணங்களைத் தேடுங்கள்… (உள்ளூர், தனிப்பட்ட)', gu: 'અર્થ દ્વારા તમારા દસ્તાવેજો શોધો… (સ્થાનિક, ખાનગી)',
    ur: 'معنی کے لحاظ سے اپنی دستاویزات تلاش کریں… (مقامی، نجی)', es: 'Busca tus documentos por significado… (local, privado)',
    fr: 'Recherchez vos documents par sens… (local, privé)', de: 'Dokumente nach Bedeutung durchsuchen… (lokal, privat)',
    pt: 'Pesquise seus documentos por significado… (local, privado)', zh: '按含义搜索您的文档…（本地，私密）',
    ar: 'ابحث في مستنداتك بالمعنى… (محلي، خاص)', ru: 'Ищите документы по смыслу… (локально, приватно)',
    ja: '意味で文書を検索…（ローカル・プライベート）', id: 'Cari dokumen Anda berdasarkan makna… (lokal, privat)',
  },
  studio_share: {
    en: 'Share', hi: 'साझा करें', bn: 'শেয়ার', te: 'షేర్', mr: 'शेअर करा', ta: 'பகிர்', gu: 'શેર', ur: 'شیئر کریں',
    es: 'Compartir', fr: 'Partager', de: 'Teilen', pt: 'Compartilhar', zh: '分享', ar: 'مشاركة', ru: 'Поделиться', ja: '共有', id: 'Bagikan',
  },
  studio_call: {
    en: 'Call', hi: 'कॉल', bn: 'কল', te: 'కాల్', mr: 'कॉल', ta: 'அழைப்பு', gu: 'કૉલ', ur: 'کال',
    es: 'Llamar', fr: 'Appel', de: 'Anruf', pt: 'Chamada', zh: '通话', ar: 'مكالمة', ru: 'Звонок', ja: '通話', id: 'Panggilan',
  },
  studio_animate: {
    en: 'Animate', hi: 'एनिमेट करें', bn: 'অ্যানিমেট', te: 'యానిమేట్', mr: 'अ‍ॅनिमेट', ta: 'அனிமேட்', gu: 'એનિમેટ', ur: 'اینیمیٹ',
    es: 'Animar', fr: 'Animer', de: 'Animieren', pt: 'Animar', zh: '动画', ar: 'تحريك', ru: 'Анимация', ja: 'アニメ化', id: 'Animasikan',
  },
  studio_save_png: {
    en: 'Save PNG', hi: 'PNG सहेजें', bn: 'PNG সংরক্ষণ', te: 'PNG సేవ్', mr: 'PNG जतन करा', ta: 'PNG சேமி', gu: 'PNG સાચવો', ur: 'PNG محفوظ کریں',
    es: 'Guardar PNG', fr: 'Enregistrer PNG', de: 'PNG speichern', pt: 'Salvar PNG', zh: '保存 PNG', ar: 'حفظ PNG', ru: 'Сохранить PNG', ja: 'PNG を保存', id: 'Simpan PNG',
  },
  studio_download_pdf: {
    en: 'Download PDF', hi: 'PDF डाउनलोड करें', bn: 'PDF ডাউনলোড', te: 'PDF డౌన్‌లోడ్', mr: 'PDF डाउनलोड', ta: 'PDF பதிவிறக்கம்', gu: 'PDF ડાઉનલોડ', ur: 'PDF ڈاؤن لوڈ',
    es: 'Descargar PDF', fr: 'Télécharger PDF', de: 'PDF herunterladen', pt: 'Baixar PDF', zh: '下载 PDF', ar: 'تنزيل PDF', ru: 'Скачать PDF', ja: 'PDF をダウンロード', id: 'Unduh PDF',
  },
  studio_resize_all: {
    en: 'Resize all', hi: 'सभी का आकार बदलें', bn: 'সব রিসাইজ', te: 'అన్నీ రీసైజ్', mr: 'सर्व आकार बदला', ta: 'அனைத்தும் மறுஅளவு', gu: 'બધાં માપ બદલો', ur: 'سب کا سائز بدلیں',
    es: 'Redimensionar todo', fr: 'Tout redimensionner', de: 'Alle anpassen', pt: 'Redimensionar tudo', zh: '全部调整大小', ar: 'تغيير حجم الكل', ru: 'Изменить все', ja: 'すべてリサイズ', id: 'Ubah ukuran semua',
  },
  more_label: {
    en: 'More', hi: 'और', bn: 'আরও', te: 'మరిన్ని', mr: 'अधिक', ta: 'மேலும்', gu: 'વધુ', ur: 'مزید',
    es: 'Más', fr: 'Plus', de: 'Mehr', pt: 'Mais', zh: '更多', ar: 'المزيد', ru: 'Ещё', ja: 'その他', id: 'Lainnya',
  },
  tool_text: {
    en: 'Text', hi: 'टेक्स्ट', bn: 'টেক্সট', te: 'టెక్స్ట్', mr: 'मजकूर', ta: 'உரை', gu: 'ટેક્સ્ટ', ur: 'متن',
    es: 'Texto', fr: 'Texte', de: 'Text', pt: 'Texto', zh: '文本', ar: 'نص', ru: 'Текст', ja: 'テキスト', id: 'Teks',
  },
  tool_box: {
    en: 'Box', hi: 'बॉक्स', bn: 'বক্স', te: 'బాక్స్', mr: 'बॉक्स', ta: 'பெட்டி', gu: 'બોક્સ', ur: 'باکس',
    es: 'Caja', fr: 'Rectangle', de: 'Rechteck', pt: 'Caixa', zh: '方框', ar: 'مربع', ru: 'Прямоугольник', ja: '四角形', id: 'Kotak',
  },
  tool_oval: {
    en: 'Oval', hi: 'अंडाकार', bn: 'ওভাল', te: 'ఓవల్', mr: 'अंडाकृती', ta: 'நீள்வட்டம்', gu: 'અંડાકાર', ur: 'بیضوی',
    es: 'Óvalo', fr: 'Ovale', de: 'Oval', pt: 'Oval', zh: '椭圆', ar: 'بيضوي', ru: 'Овал', ja: '楕円', id: 'Oval',
  },
  tool_line: {
    en: 'Line', hi: 'रेखा', bn: 'লাইন', te: 'లైన్', mr: 'रेषा', ta: 'கோடு', gu: 'રેખા', ur: 'لکیر',
    es: 'Línea', fr: 'Ligne', de: 'Linie', pt: 'Linha', zh: '直线', ar: 'خط', ru: 'Линия', ja: '線', id: 'Garis',
  },
  tool_image: {
    en: 'Image', hi: 'छवि', bn: 'ছবি', te: 'చిత్రం', mr: 'प्रतिमा', ta: 'படம்', gu: 'છબી', ur: 'تصویر',
    es: 'Imagen', fr: 'Image', de: 'Bild', pt: 'Imagem', zh: '图片', ar: 'صورة', ru: 'Изображение', ja: '画像', id: 'Gambar',
  },
  tool_logo: {
    en: 'Logo', hi: 'लोगो', bn: 'লোগো', te: 'లోగో', mr: 'लोगो', ta: 'லோகோ', gu: 'લોગો', ur: 'لوگو',
    es: 'Logotipo', fr: 'Logo', de: 'Logo', pt: 'Logotipo', zh: '标志', ar: 'شعار', ru: 'Логотип', ja: 'ロゴ', id: 'Logo',
  },
  studio_add: {
    en: 'Add', hi: 'जोड़ें', bn: 'যোগ', te: 'జోడించు', mr: 'जोडा', ta: 'சேர்', gu: 'ઉમેરો', ur: 'شامل کریں',
    es: 'Añadir', fr: 'Ajouter', de: 'Hinzufügen', pt: 'Adicionar', zh: '添加', ar: 'إضافة', ru: 'Добавить', ja: '追加', id: 'Tambah',
  },
  studio_edit: {
    en: 'Edit', hi: 'संपादित करें', bn: 'সম্পাদনা', te: 'సవరించు', mr: 'संपादित करा', ta: 'திருத்து', gu: 'સંપાદિત કરો', ur: 'ترمیم',
    es: 'Editar', fr: 'Modifier', de: 'Bearbeiten', pt: 'Editar', zh: '编辑', ar: 'تحرير', ru: 'Изменить', ja: '編集', id: 'Edit',
  },
  studio_done: {
    en: 'Done', hi: 'हो गया', bn: 'সম্পন্ন', te: 'పూర్తయింది', mr: 'पूर्ण', ta: 'முடிந்தது', gu: 'થઈ ગયું', ur: 'ہو گیا',
    es: 'Listo', fr: 'Terminé', de: 'Fertig', pt: 'Concluído', zh: '完成', ar: 'تم', ru: 'Готово', ja: '完了', id: 'Selesai',
  },
  mm_all_pages_pdf: {
    en: 'All pages → PDF', hi: 'सभी पृष्ठ → PDF', bn: 'সব পৃষ্ঠা → PDF', te: 'అన్ని పేజీలు → PDF', mr: 'सर्व पृष्ठे → PDF', ta: 'அனைத்து பக்கங்கள் → PDF', gu: 'બધાં પૃષ્ઠો → PDF', ur: 'تمام صفحات → PDF',
    es: 'Todas las páginas → PDF', fr: 'Toutes les pages → PDF', de: 'Alle Seiten → PDF', pt: 'Todas as páginas → PDF', zh: '所有页面 → PDF', ar: 'كل الصفحات → PDF', ru: 'Все страницы → PDF', ja: '全ページ → PDF', id: 'Semua halaman → PDF',
  },
  mm_mail_merge: {
    en: 'Mail merge', hi: 'मेल मर्ज', bn: 'মেল মার্জ', te: 'మెయిల్ మెర్జ్', mr: 'मेल मर्ज', ta: 'மெயில் மெர்ஜ்', gu: 'મેઇલ મર્જ', ur: 'میل ضم',
    es: 'Combinar correspondencia', fr: 'Publipostage', de: 'Serienbrief', pt: 'Mala direta', zh: '邮件合并', ar: 'دمج المراسلات', ru: 'Слияние почты', ja: '差し込み印刷', id: 'Surat massal',
  },
  mm_save_template: {
    en: 'Save as template', hi: 'टेम्पलेट के रूप में सहेजें', bn: 'টেমপ্লেট হিসেবে সংরক্ষণ', te: 'టెంప్లేట్‌గా సేవ్', mr: 'टेम्पलेट म्हणून जतन करा', ta: 'டெம்ப்ளேட்டாக சேமி', gu: 'ટેમ્પલેટ તરીકે સાચવો', ur: 'بطور ٹیمپلیٹ محفوظ کریں',
    es: 'Guardar como plantilla', fr: 'Enregistrer comme modèle', de: 'Als Vorlage speichern', pt: 'Salvar como modelo', zh: '另存为模板', ar: 'حفظ كقالب', ru: 'Сохранить как шаблон', ja: 'テンプレートとして保存', id: 'Simpan sebagai templat',
  },
  mm_open_template: {
    en: 'Open template', hi: 'टेम्पलेट खोलें', bn: 'টেমপ্লেট খুলুন', te: 'టెంప్లేట్ తెరవండి', mr: 'टेम्पलेट उघडा', ta: 'டெம்ப்ளேட்டைத் திற', gu: 'ટેમ્પલેટ ખોલો', ur: 'ٹیمپلیٹ کھولیں',
    es: 'Abrir plantilla', fr: 'Ouvrir un modèle', de: 'Vorlage öffnen', pt: 'Abrir modelo', zh: '打开模板', ar: 'فتح قالب', ru: 'Открыть шаблон', ja: 'テンプレートを開く', id: 'Buka templat',
  },
  mm_version_history: {
    en: 'Version history', hi: 'संस्करण इतिहास', bn: 'সংস্করণ ইতিহাস', te: 'వెర్షన్ చరిత్ర', mr: 'आवृत्ती इतिहास', ta: 'பதிப்பு வரலாறு', gu: 'આવૃત્તિ ઇતિહાસ', ur: 'ورژن کی تاریخ',
    es: 'Historial de versiones', fr: 'Historique des versions', de: 'Versionsverlauf', pt: 'Histórico de versões', zh: '版本历史', ar: 'سجل الإصدارات', ru: 'История версий', ja: 'バージョン履歴', id: 'Riwayat versi',
  },
  mm_comments: {
    en: 'Comments', hi: 'टिप्पणियाँ', bn: 'মন্তব্য', te: 'వ్యాఖ్యలు', mr: 'टिप्पण्या', ta: 'கருத்துகள்', gu: 'ટિપ્પણીઓ', ur: 'تبصرے',
    es: 'Comentarios', fr: 'Commentaires', de: 'Kommentare', pt: 'Comentários', zh: '评论', ar: 'التعليقات', ru: 'Комментарии', ja: 'コメント', id: 'Komentar',
  },
  mm_open_in_pdf: {
    en: 'Open in PDF editor', hi: 'PDF एडिटर में खोलें', bn: 'PDF এডিটরে খুলুন', te: 'PDF ఎడిటర్‌లో తెరవండి', mr: 'PDF एडिटरमध्ये उघडा', ta: 'PDF எடிட்டரில் திற', gu: 'PDF એડિટરમાં ખોલો', ur: 'PDF ایڈیٹر میں کھولیں',
    es: 'Abrir en el editor PDF', fr: 'Ouvrir dans l’éditeur PDF', de: 'Im PDF-Editor öffnen', pt: 'Abrir no editor de PDF', zh: '在 PDF 编辑器中打开', ar: 'فتح في محرر PDF', ru: 'Открыть в PDF-редакторе', ja: 'PDF エディターで開く', id: 'Buka di editor PDF',
  },
  act_close: {
    en: 'Close', hi: 'बंद करें', bn: 'বন্ধ', te: 'మూసివేయి', mr: 'बंद करा', ta: 'மூடு', gu: 'બંધ કરો', ur: 'بند کریں',
    kn: 'ಮುಚ್ಚಿ', ml: 'അടയ്ക്കുക', pa: 'ਬੰਦ ਕਰੋ', or: 'ବନ୍ଦ କରନ୍ତୁ', as: 'বন্ধ কৰক', es: 'Cerrar', fr: 'Fermer', de: 'Schließen', pt: 'Fechar', zh: '关闭', ar: 'إغلاق', ru: 'Закрыть', ja: '閉じる', id: 'Tutup',
  },
  act_browse: {
    en: 'browse', hi: 'ब्राउज़ करें', bn: 'ব্রাউজ', te: 'బ్రౌజ్', mr: 'ब्राउझ करा', ta: 'உலாவு', gu: 'બ્રાઉઝ', ur: 'براؤز کریں',
    es: 'explorar', fr: 'parcourir', de: 'durchsuchen', pt: 'procurar', zh: '浏览', ar: 'تصفّح', ru: 'обзор', ja: '参照', id: 'jelajahi',
  },
  act_download: {
    en: 'Download', hi: 'डाउनलोड', bn: 'ডাউনলোড', te: 'డౌన్‌లోడ్', mr: 'डाउनलोड', ta: 'பதிவிறக்கம்', gu: 'ડાઉનલોડ', ur: 'ڈاؤن لوڈ',
    kn: 'ಡೌನ್‌ಲೋಡ್', ml: 'ഡൗൺലോഡ്', pa: 'ਡਾਊਨਲੋਡ', or: 'ଡାଉନଲୋଡ୍', as: 'ডাউনল’ড', es: 'Descargar', fr: 'Télécharger', de: 'Herunterladen', pt: 'Baixar', zh: '下载', ar: 'تنزيل', ru: 'Скачать', ja: 'ダウンロード', id: 'Unduh',
  },
  act_download_png: {
    en: 'Download PNG', hi: 'PNG डाउनलोड करें', bn: 'PNG ডাউনলোড', te: 'PNG డౌన్‌లోడ్', mr: 'PNG डाउनलोड', ta: 'PNG பதிவிறக்கம்', gu: 'PNG ડાઉનલોડ', ur: 'PNG ڈاؤن لوڈ',
    es: 'Descargar PNG', fr: 'Télécharger PNG', de: 'PNG herunterladen', pt: 'Baixar PNG', zh: '下载 PNG', ar: 'تنزيل PNG', ru: 'Скачать PNG', ja: 'PNG をダウンロード', id: 'Unduh PNG',
  },
  act_change_image: {
    en: 'Change image', hi: 'छवि बदलें', bn: 'ছবি বদলান', te: 'చిత్రాన్ని మార్చు', mr: 'प्रतिमा बदला', ta: 'படத்தை மாற்று', gu: 'છબી બદલો', ur: 'تصویر بدلیں',
    es: 'Cambiar imagen', fr: 'Changer d’image', de: 'Bild ändern', pt: 'Trocar imagem', zh: '更换图片', ar: 'تغيير الصورة', ru: 'Сменить изображение', ja: '画像を変更', id: 'Ganti gambar',
  },
  m_compress_title: {
    en: 'Universal Compressor', hi: 'यूनिवर्सल कंप्रेसर', bn: 'ইউনিভার্সাল কম্প্রেসর', te: 'యూనివర్సల్ కంప్రెసర్', mr: 'युनिव्हर्सल कंप्रेसर', ta: 'யுனிவர்சல் சுருக்கி', gu: 'યુનિવર્સલ કમ્પ્રેસર', ur: 'یونیورسل کمپریسر',
    es: 'Compresor universal', fr: 'Compresseur universel', de: 'Universal-Kompressor', pt: 'Compressor universal', zh: '通用压缩器', ar: 'ضاغط شامل', ru: 'Универсальный сжиматель', ja: 'ユニバーサル圧縮', id: 'Kompresor universal',
  },
  m_compress_desc: {
    en: 'Shrink images and PDFs without visible quality loss — everything runs in your browser, nothing is uploaded. Drop several files to batch-compress.',
    hi: 'छवियों और PDF को बिना दिखने वाली गुणवत्ता हानि के छोटा करें — सब कुछ आपके ब्राउज़र में चलता है, कुछ भी अपलोड नहीं होता। बैच-कंप्रेस के लिए कई फ़ाइलें डालें।',
    bn: 'দৃশ্যমান মান না হারিয়ে ছবি ও PDF ছোট করুন — সব আপনার ব্রাউজারে চলে, কিছুই আপলোড হয় না। ব্যাচ-কম্প্রেসের জন্য একাধিক ফাইল দিন।',
    te: 'కనిపించే నాణ్యత నష్టం లేకుండా చిత్రాలు, PDFలను చిన్నవి చేయండి — అంతా మీ బ్రౌజర్‌లో జరుగుతుంది, ఏదీ అప్‌లోడ్ కాదు. బ్యాచ్ కంప్రెస్ కోసం పలు ఫైళ్లు వేయండి.',
    mr: 'दिसणारी गुणवत्ता न गमावता प्रतिमा व PDF लहान करा — सर्व तुमच्या ब्राउझरमध्ये चालते, काहीही अपलोड होत नाही. बॅच-कंप्रेससाठी अनेक फायली टाका.',
    ta: 'தெரியும் தரத்தை இழக்காமல் படங்கள் மற்றும் PDFகளைச் சுருக்குங்கள் — அனைத்தும் உங்கள் உலாவியில் இயங்குகிறது, எதுவும் பதிவேற்றப்படாது. தொகுதி சுருக்கத்திற்கு பல கோப்புகளை இடுங்கள்.',
    gu: 'દૃશ્યમાન ગુણવત્તા ગુમાવ્યા વિના છબીઓ અને PDF નાનાં કરો — બધું તમારા બ્રાઉઝરમાં ચાલે છે, કંઈ અપલોડ થતું નથી. બેચ-કમ્પ્રેસ માટે અનેક ફાઇલો મૂકો.',
    ur: 'نظر آنے والی کوالٹی کھوئے بغیر تصاویر اور PDF چھوٹا کریں — سب کچھ آپ کے براؤزر میں چلتا ہے، کچھ اپ لوڈ نہیں ہوتا۔ بیچ کمپریس کے لیے کئی فائلیں ڈالیں۔',
    es: 'Reduce imágenes y PDF sin pérdida de calidad visible — todo se ejecuta en tu navegador, no se sube nada. Suelta varios archivos para comprimir en lote.',
    fr: 'Réduisez images et PDF sans perte de qualité visible — tout s’exécute dans votre navigateur, rien n’est envoyé. Déposez plusieurs fichiers pour compresser par lot.',
    de: 'Verkleinern Sie Bilder und PDFs ohne sichtbaren Qualitätsverlust — alles läuft in Ihrem Browser, nichts wird hochgeladen. Mehrere Dateien für die Stapelkomprimierung ablegen.',
    pt: 'Reduza imagens e PDFs sem perda visível de qualidade — tudo roda no seu navegador, nada é enviado. Solte vários arquivos para compactar em lote.',
    zh: '在不损失可见画质的情况下压缩图片和 PDF——全部在浏览器中运行，不上传任何内容。拖入多个文件即可批量压缩。',
    ar: 'صغّر الصور وملفات PDF دون فقدان واضح للجودة — كل شيء يعمل في متصفحك ولا يُرفع أي شيء. أسقط عدة ملفات للضغط الدُّفعي.',
    ru: 'Уменьшайте изображения и PDF без заметной потери качества — всё работает в браузере, ничего не загружается. Перетащите несколько файлов для пакетного сжатия.',
    ja: '見た目の劣化なしで画像と PDF を縮小 — すべてブラウザー内で動作し、何もアップロードされません。複数ファイルをドロップして一括圧縮できます。',
    id: 'Perkecil gambar dan PDF tanpa kehilangan kualitas yang terlihat — semua berjalan di browser Anda, tidak ada yang diunggah. Jatuhkan beberapa berkas untuk kompres massal.',
  },
  m_compress_drop: {
    en: 'Drop images, PDFs or video here, or', hi: 'छवियाँ, PDF या वीडियो यहाँ डालें, या', bn: 'ছবি, PDF বা ভিডিও এখানে দিন, বা', te: 'చిత్రాలు, PDFలు లేదా వీడియోను ఇక్కడ వేయండి, లేదా', mr: 'प्रतिमा, PDF किंवा व्हिडिओ येथे टाका, किंवा', ta: 'படங்கள், PDFகள் அல்லது வீடியோவை இங்கே இடுங்கள், அல்லது', gu: 'છબીઓ, PDF કે વિડિઓ અહીં મૂકો, અથવા', ur: 'تصاویر، PDF یا ویڈیو یہاں ڈالیں، یا',
    es: 'Suelta imágenes, PDF o vídeo aquí, o', fr: 'Déposez images, PDF ou vidéo ici, ou', de: 'Bilder, PDFs oder Video hier ablegen, oder', pt: 'Solte imagens, PDFs ou vídeo aqui, ou', zh: '将图片、PDF 或视频拖到此处，或', ar: 'أسقط الصور أو ملفات PDF أو الفيديو هنا، أو', ru: 'Перетащите изображения, PDF или видео сюда, или', ja: '画像・PDF・動画をここにドロップ、または', id: 'Jatuhkan gambar, PDF, atau video di sini, atau',
  },
  m_compress_run: {
    en: 'Compress all', hi: 'सभी कंप्रेस करें', bn: 'সব কম্প্রেস', te: 'అన్నీ కంప్రెస్', mr: 'सर्व कंप्रेस करा', ta: 'அனைத்தையும் சுருக்கு', gu: 'બધાં કમ્પ્રેસ', ur: 'سب کمپریس کریں',
    es: 'Comprimir todo', fr: 'Tout compresser', de: 'Alle komprimieren', pt: 'Comprimir tudo', zh: '全部压缩', ar: 'ضغط الكل', ru: 'Сжать всё', ja: 'すべて圧縮', id: 'Kompres semua',
  },
  m_convert_title: {
    en: 'Universal Converter', hi: 'यूनिवर्सल कन्वर्टर', bn: 'ইউনিভার্সাল কনভার্টার', te: 'యూనివర్సల్ కన్వర్టర్', mr: 'युनिव्हर्सल कन्व्हर्टर', ta: 'யுனிவர்சல் மாற்றி', gu: 'યુનિવર્સલ કન્વર્ટર', ur: 'یونیورسل کنورٹر',
    es: 'Conversor universal', fr: 'Convertisseur universel', de: 'Universal-Konverter', pt: 'Conversor universal', zh: '通用转换器', ar: 'محوّل شامل', ru: 'Универсальный конвертер', ja: 'ユニバーサル変換', id: 'Konverter universal',
  },
  m_convert_desc: {
    en: 'Convert images between formats — including HEIC → JPG for iPhone photos — or combine them into a PDF. Everything runs in your browser; nothing is uploaded.',
    hi: 'छवियों को विभिन्न फ़ॉर्मैट में बदलें — iPhone फ़ोटो के लिए HEIC → JPG सहित — या उन्हें PDF में जोड़ें। सब कुछ आपके ब्राउज़र में चलता है; कुछ भी अपलोड नहीं होता।',
    bn: 'ছবি বিভিন্ন ফরম্যাটে রূপান্তর করুন — iPhone ছবির জন্য HEIC → JPG সহ — অথবা PDF-এ একত্র করুন। সব আপনার ব্রাউজারে চলে; কিছুই আপলোড হয় না।',
    te: 'చిత్రాలను వివిధ ఫార్మాట్‌ల మధ్య మార్చండి — iPhone ఫోటోల కోసం HEIC → JPG సహా — లేదా వాటిని PDFగా కలపండి. అంతా మీ బ్రౌజర్‌లో జరుగుతుంది; ఏదీ అప్‌లోడ్ కాదు.',
    mr: 'प्रतिमा विविध फॉरमॅटमध्ये रूपांतरित करा — iPhone फोटोंसाठी HEIC → JPG सह — किंवा त्यांना PDF मध्ये एकत्र करा. सर्व तुमच्या ब्राउझरमध्ये चालते; काहीही अपलोड होत नाही.',
    ta: 'படங்களை வடிவங்களுக்கு இடையே மாற்றுங்கள் — iPhone புகைப்படங்களுக்கு HEIC → JPG உட்பட — அல்லது அவற்றை PDF ஆக இணைக்கவும். அனைத்தும் உங்கள் உலாவியில் இயங்குகிறது; எதுவும் பதிவேற்றப்படாது.',
    gu: 'છબીઓને ફોર્મેટ વચ્ચે રૂપાંતરિત કરો — iPhone ફોટા માટે HEIC → JPG સહિત — અથવા તેમને PDF માં જોડો. બધું તમારા બ્રાઉઝરમાં ચાલે છે; કંઈ અપલોડ થતું નથી.',
    ur: 'تصاویر کو مختلف فارمیٹس میں تبدیل کریں — iPhone تصاویر کے لیے HEIC → JPG سمیت — یا انہیں PDF میں جوڑیں۔ سب کچھ آپ کے براؤزر میں چلتا ہے؛ کچھ اپ لوڈ نہیں ہوتا۔',
    es: 'Convierte imágenes entre formatos — incluido HEIC → JPG para fotos de iPhone — o combínalas en un PDF. Todo se ejecuta en tu navegador; no se sube nada.',
    fr: 'Convertissez des images entre formats — y compris HEIC → JPG pour les photos iPhone — ou combinez-les en PDF. Tout s’exécute dans votre navigateur ; rien n’est envoyé.',
    de: 'Konvertieren Sie Bilder zwischen Formaten — einschließlich HEIC → JPG für iPhone-Fotos — oder fügen Sie sie zu einem PDF zusammen. Alles läuft im Browser; nichts wird hochgeladen.',
    pt: 'Converta imagens entre formatos — incluindo HEIC → JPG para fotos de iPhone — ou combine-as em um PDF. Tudo roda no seu navegador; nada é enviado.',
    zh: '在不同格式之间转换图片——包括用于 iPhone 照片的 HEIC → JPG——或将它们合并为 PDF。全部在浏览器中运行；不上传任何内容。',
    ar: 'حوّل الصور بين الصيغ — بما في ذلك HEIC → JPG لصور iPhone — أو ادمجها في ملف PDF. كل شيء يعمل في متصفحك؛ لا يُرفع أي شيء.',
    ru: 'Конвертируйте изображения между форматами — включая HEIC → JPG для фото с iPhone — или объедините их в PDF. Всё работает в браузере; ничего не загружается.',
    ja: '画像を形式間で変換 — iPhone 写真向けの HEIC → JPG を含む — または PDF にまとめます。すべてブラウザー内で動作し、何もアップロードされません。',
    id: 'Konversi gambar antar format — termasuk HEIC → JPG untuk foto iPhone — atau gabungkan menjadi PDF. Semua berjalan di browser Anda; tidak ada yang diunggah.',
  },
  m_convert_drop: {
    en: 'Drop images (incl. .heic) here,', hi: 'छवियाँ (.heic सहित) यहाँ डालें,', bn: 'ছবি (.heic সহ) এখানে দিন,', te: 'చిత్రాలను (.heic సహా) ఇక్కడ వేయండి,', mr: 'प्रतिमा (.heic सह) येथे टाका,', ta: 'படங்களை (.heic உட்பட) இங்கே இடுங்கள்,', gu: 'છબીઓ (.heic સહિત) અહીં મૂકો,', ur: 'تصاویر (.heic سمیت) یہاں ڈالیں،',
    es: 'Suelta imágenes (incl. .heic) aquí,', fr: 'Déposez des images (.heic incl.) ici,', de: 'Bilder (inkl. .heic) hier ablegen,', pt: 'Solte imagens (incl. .heic) aqui,', zh: '将图片（含 .heic）拖到此处，', ar: 'أسقط الصور (بما فيها .heic) هنا،', ru: 'Перетащите изображения (вкл. .heic) сюда,', ja: '画像（.heic を含む）をここにドロップ、', id: 'Jatuhkan gambar (termasuk .heic) di sini,',
  },
  act_convert_to: {
    en: 'Convert to', hi: 'इसमें बदलें', bn: 'রূপান্তর করুন', te: 'మార్చు', mr: 'मध्ये रूपांतरित करा', ta: 'மாற்று', gu: 'માં રૂપાંતરિત કરો', ur: 'میں تبدیل کریں',
    es: 'Convertir a', fr: 'Convertir en', de: 'Konvertieren zu', pt: 'Converter para', zh: '转换为', ar: 'تحويل إلى', ru: 'Конвертировать в', ja: '変換:', id: 'Konversi ke',
  },
  act_add_folder: {
    en: 'add a whole folder', hi: 'पूरा फ़ोल्डर जोड़ें', bn: 'পুরো ফোল্ডার যোগ করুন', te: 'మొత్తం ఫోల్డర్‌ను జోడించు', mr: 'संपूर्ण फोल्डर जोडा', ta: 'முழு கோப்புறையைச் சேர்', gu: 'આખું ફોલ્ડર ઉમેરો', ur: 'پورا فولڈر شامل کریں',
    es: 'añadir una carpeta entera', fr: 'ajouter un dossier entier', de: 'ganzen Ordner hinzufügen', pt: 'adicionar uma pasta inteira', zh: '添加整个文件夹', ar: 'إضافة مجلد كامل', ru: 'добавить всю папку', ja: 'フォルダー全体を追加', id: 'tambahkan seluruh folder',
  },
  m_convert_pdf: {
    en: 'Combine to PDF', hi: 'PDF में जोड़ें', bn: 'PDF-এ একত্র করুন', te: 'PDFగా కలపండి', mr: 'PDF मध्ये एकत्र करा', ta: 'PDF ஆக இணை', gu: 'PDF માં જોડો', ur: 'PDF میں جوڑیں',
    es: 'Combinar en PDF', fr: 'Combiner en PDF', de: 'Zu PDF zusammenfügen', pt: 'Combinar em PDF', zh: '合并为 PDF', ar: 'دمج في PDF', ru: 'Объединить в PDF', ja: 'PDF にまとめる', id: 'Gabungkan ke PDF',
  },
  m_watermark_title: {
    en: 'Watermark', hi: 'वॉटरमार्क', bn: 'ওয়াটারমার্ক', te: 'వాటర్‌మార్క్', mr: 'वॉटरमार्क', ta: 'நீர்அடையாளம்', gu: 'વોટરમાર્ક', ur: 'واٹر مارک',
    es: 'Marca de agua', fr: 'Filigrane', de: 'Wasserzeichen', pt: 'Marca d’água', zh: '水印', ar: 'علامة مائية', ru: 'Водяной знак', ja: '透かし', id: 'Tanda air',
  },
  m_watermark_desc: {
    en: 'Stamp a watermark across PDFs and images — single or tiled, with adjustable opacity, angle and colour. Runs entirely in your browser, nothing uploaded.',
    hi: 'PDF और छवियों पर वॉटरमार्क लगाएं — एकल या टाइल, समायोज्य अपारदर्शिता, कोण और रंग के साथ। पूरी तरह आपके ब्राउज़र में चलता है, कुछ अपलोड नहीं होता।',
    bn: 'PDF ও ছবিতে ওয়াটারমার্ক বসান — একক বা টাইল করা, সমন্বয়যোগ্য অস্বচ্ছতা, কোণ ও রঙ সহ। সম্পূর্ণ আপনার ব্রাউজারে চলে, কিছুই আপলোড হয় না।',
    te: 'PDFలు, చిత్రాలపై వాటర్‌మార్క్ వేయండి — ఒకటి లేదా టైల్డ్, సర్దుబాటు చేయగల అపారదర్శకత, కోణం, రంగుతో. పూర్తిగా మీ బ్రౌజర్‌లో జరుగుతుంది, ఏదీ అప్‌లోడ్ కాదు.',
    mr: 'PDF व प्रतिमांवर वॉटरमार्क लावा — एकल किंवा टाइल, समायोज्य अपारदर्शकता, कोन व रंगासह. पूर्णपणे तुमच्या ब्राउझरमध्ये चालते, काहीही अपलोड होत नाही.',
    ta: 'PDFகள் மற்றும் படங்களில் நீர்அடையாளம் பதியுங்கள் — ஒற்றை அல்லது ஓடு, சரிசெய்யக்கூடிய ஒளிபுகாமை, கோணம், நிறத்துடன். முழுவதும் உங்கள் உலாவியில் இயங்குகிறது, எதுவும் பதிவேற்றப்படாது.',
    gu: 'PDF અને છબીઓ પર વોટરમાર્ક લગાવો — એકલ કે ટાઇલ, સમાયોજ્ય અપારદર્શકતા, કોણ અને રંગ સાથે. સંપૂર્ણ તમારા બ્રાઉઝરમાં ચાલે, કંઈ અપલોડ થતું નથી.',
    ur: 'PDF اور تصاویر پر واٹر مارک لگائیں — واحد یا ٹائل، قابلِ ایڈجسٹ شفافیت، زاویہ اور رنگ کے ساتھ۔ مکمل طور پر آپ کے براؤزر میں چلتا ہے، کچھ اپ لوڈ نہیں ہوتا۔',
    es: 'Estampa una marca de agua en PDF e imágenes — única o en mosaico, con opacidad, ángulo y color ajustables. Todo en tu navegador, nada se sube.',
    fr: 'Apposez un filigrane sur PDF et images — unique ou en mosaïque, avec opacité, angle et couleur réglables. Tout dans votre navigateur, rien n’est envoyé.',
    de: 'Versehen Sie PDFs und Bilder mit einem Wasserzeichen — einzeln oder gekachelt, mit einstellbarer Deckkraft, Winkel und Farbe. Läuft komplett im Browser, nichts wird hochgeladen.',
    pt: 'Aplique uma marca d’água em PDFs e imagens — única ou em mosaico, com opacidade, ângulo e cor ajustáveis. Tudo no seu navegador, nada é enviado.',
    zh: '为 PDF 和图片添加水印——单个或平铺，可调节不透明度、角度和颜色。完全在浏览器中运行，不上传任何内容。',
    ar: 'ضع علامة مائية على ملفات PDF والصور — مفردة أو مكرّرة، مع شفافية وزاوية ولون قابلة للتعديل. يعمل بالكامل في متصفحك، ولا يُرفع شيء.',
    ru: 'Наложите водяной знак на PDF и изображения — одиночный или плиткой, с настройкой прозрачности, угла и цвета. Всё в браузере, ничего не загружается.',
    ja: 'PDF や画像に透かしを付与 — 単一またはタイル、不透明度・角度・色を調整可能。すべてブラウザー内で動作し、何もアップロードされません。',
    id: 'Bubuhkan tanda air pada PDF dan gambar — tunggal atau ubin, dengan opasitas, sudut, dan warna yang dapat diatur. Berjalan sepenuhnya di browser Anda, tidak ada yang diunggah.',
  },
  m_watermark_drop: {
    en: 'Drop PDFs or images here, or', hi: 'PDF या छवियाँ यहाँ डालें, या', bn: 'PDF বা ছবি এখানে দিন, বা', te: 'PDFలు లేదా చిత్రాలను ఇక్కడ వేయండి, లేదా', mr: 'PDF किंवा प्रतिमा येथे टाका, किंवा', ta: 'PDFகள் அல்லது படங்களை இங்கே இடுங்கள், அல்லது', gu: 'PDF કે છબીઓ અહીં મૂકો, અથવા', ur: 'PDF یا تصاویر یہاں ڈالیں، یا',
    es: 'Suelta PDF o imágenes aquí, o', fr: 'Déposez des PDF ou images ici, ou', de: 'PDFs oder Bilder hier ablegen, oder', pt: 'Solte PDFs ou imagens aqui, ou', zh: '将 PDF 或图片拖到此处，或', ar: 'أسقط ملفات PDF أو الصور هنا، أو', ru: 'Перетащите PDF или изображения сюда, или', ja: 'PDF または画像をここにドロップ、または', id: 'Jatuhkan PDF atau gambar di sini, atau',
  },
  m_watermark_apply: {
    en: 'Apply watermark', hi: 'वॉटरमार्क लगाएं', bn: 'ওয়াটারমার্ক প্রয়োগ', te: 'వాటర్‌మార్క్ వేయండి', mr: 'वॉटरमार्क लावा', ta: 'நீர்அடையாளம் இடு', gu: 'વોટરમાર્ક લગાવો', ur: 'واٹر مارک لگائیں',
    es: 'Aplicar marca de agua', fr: 'Appliquer le filigrane', de: 'Wasserzeichen anwenden', pt: 'Aplicar marca d’água', zh: '应用水印', ar: 'تطبيق العلامة المائية', ru: 'Применить водяной знак', ja: '透かしを適用', id: 'Terapkan tanda air',
  },
  m_meme_title: {
    en: 'Meme Generator', hi: 'मीम जेनरेटर', bn: 'মিম জেনারেটর', te: 'మీమ్ జనరేటర్', mr: 'मीम जनरेटर', ta: 'மீம் ஜெனரேட்டர்', gu: 'મીમ જનરેટર', ur: 'میم جنریٹر',
    es: 'Generador de memes', fr: 'Générateur de mèmes', de: 'Meme-Generator', pt: 'Gerador de memes', zh: '表情包生成器', ar: 'مولّد الميمات', ru: 'Генератор мемов', ja: 'ミームジェネレーター', id: 'Pembuat meme',
  },
  m_meme_desc: {
    en: 'Drop an image, add captions, and download — entirely in your browser, nothing uploaded.',
    hi: 'एक छवि डालें, कैप्शन जोड़ें और डाउनलोड करें — पूरी तरह आपके ब्राउज़र में, कुछ अपलोड नहीं होता।',
    bn: 'একটি ছবি দিন, ক্যাপশন যোগ করুন এবং ডাউনলোড করুন — সম্পূর্ণ আপনার ব্রাউজারে, কিছুই আপলোড হয় না।',
    te: 'ఒక చిత్రాన్ని వేయండి, శీర్షికలు జోడించి డౌన్‌లోడ్ చేయండి — పూర్తిగా మీ బ్రౌజర్‌లో, ఏదీ అప్‌లోడ్ కాదు.',
    mr: 'एक प्रतिमा टाका, मथळे जोडा आणि डाउनलोड करा — पूर्णपणे तुमच्या ब्राउझरमध्ये, काहीही अपलोड होत नाही.',
    ta: 'ஒரு படத்தை இடுங்கள், தலைப்புகளைச் சேர்த்துப் பதிவிறக்குங்கள் — முழுவதும் உங்கள் உலாவியில், எதுவும் பதிவேற்றப்படாது.',
    gu: 'એક છબી મૂકો, કૅપ્શન ઉમેરો અને ડાઉનલોડ કરો — સંપૂર્ણ તમારા બ્રાઉઝરમાં, કંઈ અપલોડ થતું નથી.',
    ur: 'ایک تصویر ڈالیں، کیپشن شامل کریں اور ڈاؤن لوڈ کریں — مکمل طور پر آپ کے براؤزر میں، کچھ اپ لوڈ نہیں ہوتا۔',
    es: 'Suelta una imagen, añade textos y descarga — todo en tu navegador, nada se sube.',
    fr: 'Déposez une image, ajoutez des légendes et téléchargez — entièrement dans votre navigateur, rien n’est envoyé.',
    de: 'Bild ablegen, Beschriftungen hinzufügen und herunterladen — komplett im Browser, nichts wird hochgeladen.',
    pt: 'Solte uma imagem, adicione legendas e baixe — tudo no seu navegador, nada é enviado.',
    zh: '拖入一张图片、添加文字并下载——全部在浏览器中，不上传任何内容。',
    ar: 'أسقط صورة وأضف التعليقات ثم نزّل — بالكامل في متصفحك، ولا يُرفع شيء.',
    ru: 'Перетащите изображение, добавьте подписи и скачайте — всё в браузере, ничего не загружается.',
    ja: '画像をドロップし、キャプションを追加してダウンロード — すべてブラウザー内で、何もアップロードされません。',
    id: 'Jatuhkan gambar, tambahkan teks, lalu unduh — sepenuhnya di browser Anda, tidak ada yang diunggah.',
  },
  m_meme_drop: {
    en: 'Drop an image here, or', hi: 'एक छवि यहाँ डालें, या', bn: 'একটি ছবি এখানে দিন, বা', te: 'ఒక చిత్రాన్ని ఇక్కడ వేయండి, లేదా', mr: 'एक प्रतिमा येथे टाका, किंवा', ta: 'ஒரு படத்தை இங்கே இடுங்கள், அல்லது', gu: 'એક છબી અહીં મૂકો, અથવા', ur: 'ایک تصویر یہاں ڈالیں، یا',
    es: 'Suelta una imagen aquí, o', fr: 'Déposez une image ici, ou', de: 'Ein Bild hier ablegen, oder', pt: 'Solte uma imagem aqui, ou', zh: '将一张图片拖到此处，或', ar: 'أسقط صورة هنا، أو', ru: 'Перетащите изображение сюда, или', ja: '画像をここにドロップ、または', id: 'Jatuhkan gambar di sini, atau',
  },
  m_collage_title: {
    en: 'Photo Collage', hi: 'फ़ोटो कोलाज', bn: 'ফটো কোলাজ', te: 'ఫోటో కోలాజ్', mr: 'फोटो कोलाज', ta: 'புகைப்பட தொகுப்பு', gu: 'ફોટો કોલાજ', ur: 'فوٹو کولاج',
    es: 'Collage de fotos', fr: 'Collage photo', de: 'Foto-Collage', pt: 'Colagem de fotos', zh: '照片拼贴', ar: 'مجمّع الصور', ru: 'Фотоколлаж', ja: '写真コラージュ', id: 'Kolase foto',
  },
  m_collage_desc: {
    en: 'Drop photos, arrange them in a grid, and download one image — entirely in your browser, nothing uploaded.',
    hi: 'फ़ोटो डालें, उन्हें ग्रिड में व्यवस्थित करें और एक छवि डाउनलोड करें — पूरी तरह आपके ब्राउज़र में, कुछ अपलोड नहीं होता।',
    bn: 'ছবি দিন, গ্রিডে সাজান এবং একটি ছবি ডাউনলোড করুন — সম্পূর্ণ আপনার ব্রাউজারে, কিছুই আপলোড হয় না।',
    te: 'ఫోటోలు వేయండి, వాటిని గ్రిడ్‌లో అమర్చి ఒక చిత్రాన్ని డౌన్‌లోడ్ చేయండి — పూర్తిగా మీ బ్రౌజర్‌లో, ఏదీ అప్‌లోడ్ కాదు.',
    mr: 'फोटो टाका, त्यांना ग्रिडमध्ये मांडा आणि एक प्रतिमा डाउनलोड करा — पूर्णपणे तुमच्या ब्राउझरमध्ये, काहीही अपलोड होत नाही.',
    ta: 'புகைப்படங்களை இடுங்கள், அவற்றைக் கட்டத்தில் அமைத்து ஒரு படத்தைப் பதிவிறக்குங்கள் — முழுவதும் உங்கள் உலாவியில், எதுவும் பதிவேற்றப்படாது.',
    gu: 'ફોટા મૂકો, તેમને ગ્રિડમાં ગોઠવો અને એક છબી ડાઉનલોડ કરો — સંપૂર્ણ તમારા બ્રાઉઝરમાં, કંઈ અપલોડ થતું નથી.',
    ur: 'تصاویر ڈالیں، انہیں گرڈ میں ترتیب دیں اور ایک تصویر ڈاؤن لوڈ کریں — مکمل طور پر آپ کے براؤزر میں، کچھ اپ لوڈ نہیں ہوتا۔',
    es: 'Suelta fotos, organízalas en una cuadrícula y descarga una imagen — todo en tu navegador, nada se sube.',
    fr: 'Déposez des photos, disposez-les en grille et téléchargez une image — entièrement dans votre navigateur, rien n’est envoyé.',
    de: 'Fotos ablegen, im Raster anordnen und ein Bild herunterladen — komplett im Browser, nichts wird hochgeladen.',
    pt: 'Solte fotos, organize-as em uma grade e baixe uma imagem — tudo no seu navegador, nada é enviado.',
    zh: '拖入照片，将它们排列成网格，并下载为一张图片——全部在浏览器中，不上传任何内容。',
    ar: 'أسقط الصور ورتّبها في شبكة ونزّل صورة واحدة — بالكامل في متصفحك، ولا يُرفع شيء.',
    ru: 'Перетащите фото, расположите их сеткой и скачайте одно изображение — всё в браузере, ничего не загружается.',
    ja: '写真をドロップし、グリッドに並べて 1 枚の画像としてダウンロード — すべてブラウザー内で、何もアップロードされません。',
    id: 'Jatuhkan foto, susun dalam kisi, dan unduh satu gambar — sepenuhnya di browser Anda, tidak ada yang diunggah.',
  },
  m_collage_drop: {
    en: 'Drop photos here, or', hi: 'फ़ोटो यहाँ डालें, या', bn: 'ছবি এখানে দিন, বা', te: 'ఫోటోలను ఇక్కడ వేయండి, లేదా', mr: 'फोटो येथे टाका, किंवा', ta: 'புகைப்படங்களை இங்கே இடுங்கள், அல்லது', gu: 'ફોટા અહીં મૂકો, અથવા', ur: 'تصاویر یہاں ڈالیں، یا',
    es: 'Suelta fotos aquí, o', fr: 'Déposez des photos ici, ou', de: 'Fotos hier ablegen, oder', pt: 'Solte fotos aqui, ou', zh: '将照片拖到此处，或', ar: 'أسقط الصور هنا، أو', ru: 'Перетащите фото сюда, или', ja: '写真をここにドロップ、または', id: 'Jatuhkan foto di sini, atau',
  },
  m_sign_title: {
    en: 'Sign & verify', hi: 'हस्ताक्षर और सत्यापन', bn: 'সই ও যাচাই', te: 'సంతకం & ధృవీకరణ', mr: 'स्वाक्षरी व पडताळणी', ta: 'கையொப்பம் & சரிபார்ப்பு', gu: 'સહી અને ચકાસણી', ur: 'دستخط اور تصدیق',
    es: 'Firmar y verificar', fr: 'Signer et vérifier', de: 'Signieren & prüfen', pt: 'Assinar e verificar', zh: '签名与验证', ar: 'التوقيع والتحقق', ru: 'Подпись и проверка', ja: '署名と検証', id: 'Tanda tangani & verifikasi',
  },
  m_sign_verify: {
    en: 'Verify', hi: 'सत्यापित करें', bn: 'যাচাই', te: 'ధృవీకరించు', mr: 'पडताळा', ta: 'சரிபார்', gu: 'ચકાસો', ur: 'تصدیق کریں',
    es: 'Verificar', fr: 'Vérifier', de: 'Prüfen', pt: 'Verificar', zh: '验证', ar: 'تحقّق', ru: 'Проверить', ja: '検証', id: 'Verifikasi',
  },
  m_combine_title: {
    en: 'Combine designs into one PDF', hi: 'डिज़ाइनों को एक PDF में जोड़ें', bn: 'ডিজাইনগুলো এক PDF-এ একত্র করুন', te: 'డిజైన్‌లను ఒక PDFగా కలపండి', mr: 'डिझाइन्स एका PDF मध्ये एकत्र करा', ta: 'வடிவமைப்புகளை ஒரே PDF ஆக இணை', gu: 'ડિઝાઇનને એક PDF માં જોડો', ur: 'ڈیزائنز کو ایک PDF میں جوڑیں',
    es: 'Combinar diseños en un PDF', fr: 'Combiner les designs en un PDF', de: 'Designs zu einem PDF zusammenfügen', pt: 'Combinar designs em um PDF', zh: '将设计合并为一个 PDF', ar: 'دمج التصاميم في ملف PDF واحد', ru: 'Объединить дизайны в один PDF', ja: 'デザインを 1 つの PDF にまとめる', id: 'Gabungkan desain menjadi satu PDF',
  },
  m_qr_title: {
    en: 'QR code', hi: 'QR कोड', bn: 'QR কোড', te: 'QR కోడ్', mr: 'QR कोड', ta: 'QR குறியீடு', gu: 'QR કોડ', ur: 'QR کوڈ',
    es: 'Código QR', fr: 'Code QR', de: 'QR-Code', pt: 'Código QR', zh: '二维码', ar: 'رمز QR', ru: 'QR-код', ja: 'QR コード', id: 'Kode QR',
  },
  m_qr_insert: {
    en: 'Insert into design', hi: 'डिज़ाइन में डालें', bn: 'ডিজাইনে যোগ করুন', te: 'డిజైన్‌లో చొప్పించు', mr: 'डिझाइनमध्ये घाला', ta: 'வடிவமைப்பில் செருகு', gu: 'ડિઝાઇનમાં દાખલ કરો', ur: 'ڈیزائن میں شامل کریں',
    es: 'Insertar en el diseño', fr: 'Insérer dans le design', de: 'In Design einfügen', pt: 'Inserir no design', zh: '插入到设计中', ar: 'إدراج في التصميم', ru: 'Вставить в дизайн', ja: 'デザインに挿入', id: 'Sisipkan ke desain',
  },
  tl_design: { en: 'Design', hi: 'डिज़ाइन', bn: 'ডিজাইন', te: 'డిజైన్', mr: 'डिझाइन', ta: 'வடிவமைப்பு', gu: 'ડિઝાઇન', ur: 'ڈیزائن', es: 'Diseño', fr: 'Design', de: 'Design', pt: 'Design', zh: '设计', ar: 'تصميم', ru: 'Дизайн', ja: 'デザイン', id: 'Desain' },
  td_design: { en: 'Blank canvas, poster, social post', hi: 'खाली कैनवास, पोस्टर, सोशल पोस्ट', bn: 'খালি ক্যানভাস, পোস্টার, সোশ্যাল পোস্ট', te: 'ఖాళీ కాన్వాస్, పోస్టర్, సోషల్ పోస్ట్', mr: 'रिकामा कॅनव्हास, पोस्टर, सोशल पोस्ट', ta: 'வெற்று கேன்வாஸ், போஸ்டர், சமூகப் பதிவு', gu: 'ખાલી કૅનવાસ, પોસ્ટર, સોશિયલ પોસ્ટ', ur: 'خالی کینوس، پوسٹر، سوشل پوسٹ', es: 'Lienzo en blanco, póster, publicación social', fr: 'Toile vierge, affiche, post social', de: 'Leere Leinwand, Poster, Social-Post', pt: 'Tela em branco, pôster, post social', zh: '空白画布、海报、社交贴文', ar: 'لوحة فارغة، ملصق، منشور اجتماعي', ru: 'Пустой холст, постер, пост для соцсетей', ja: '空白キャンバス・ポスター・SNS投稿', id: 'Kanvas kosong, poster, postingan sosial' },
  tl_prompt: { en: 'Prompt to design', hi: 'प्रॉम्प्ट से डिज़ाइन', bn: 'প্রম্পট থেকে ডিজাইন', te: 'ప్రాంప్ట్ నుండి డిజైన్', mr: 'प्रॉम्प्ट ते डिझाइन', ta: 'ப்ராம்ப்ட் வடிவமைப்பு', gu: 'પ્રોમ્પ્ટથી ડિઝાઇન', ur: 'پرامپٹ سے ڈیزائن', es: 'Indicación a diseño', fr: 'Texte en design', de: 'Prompt zu Design', pt: 'Prompt para design', zh: '提示词生成设计', ar: 'موجّه إلى تصميم', ru: 'Запрос в дизайн', ja: 'プロンプトからデザイン', id: 'Prompt jadi desain' },
  td_prompt: { en: 'Describe it → on-brand design (on-device AI)', hi: 'वर्णन करें → ब्रांड-अनुरूप डिज़ाइन (डिवाइस पर AI)', bn: 'বর্ণনা দিন → ব্র্যান্ড-সঙ্গত ডিজাইন (ডিভাইসে AI)', te: 'వివరించండి → బ్రాండ్‌కు తగిన డిజైన్ (పరికరంలో AI)', mr: 'वर्णन करा → ब्रँडनुसार डिझाइन (डिव्हाइसवर AI)', ta: 'விவரியுங்கள் → பிராண்டுக்கேற்ற வடிவமைப்பு (சாதன AI)', gu: 'વર્ણવો → બ્રાન્ડ-અનુરૂપ ડિઝાઇન (ઉપકરણ પર AI)', ur: 'بیان کریں → برانڈ کے مطابق ڈیزائن (ڈیوائس پر AI)', es: 'Descríbelo → diseño de marca (IA en el dispositivo)', fr: 'Décrivez-le → design de marque (IA locale)', de: 'Beschreiben → markengerechtes Design (KI auf dem Gerät)', pt: 'Descreva → design da marca (IA no dispositivo)', zh: '描述它 → 符合品牌的设计（设备端 AI）', ar: 'صِفه → تصميم متوافق مع العلامة (ذكاء على الجهاز)', ru: 'Опишите → фирменный дизайн (ИИ на устройстве)', ja: '説明する → ブランドに沿ったデザイン（端末内AI）', id: 'Jelaskan → desain sesuai merek (AI di perangkat)' },
  tl_ask_ai: { en: 'Ask AI', hi: 'AI से पूछें', bn: 'AI কে জিজ্ঞাসা', te: 'AIని అడగండి', mr: 'AI ला विचारा', ta: 'AI-யிடம் கேள்', gu: 'AI ને પૂછો', ur: 'AI سے پوچھیں', es: 'Preguntar a la IA', fr: 'Demander à l’IA', de: 'KI fragen', pt: 'Perguntar à IA', zh: '问 AI', ar: 'اسأل الذكاء الاصطناعي', ru: 'Спросить ИИ', ja: 'AIに質問', id: 'Tanya AI' },
  td_ask_ai: { en: 'Chat with AI using your own key or on-device', hi: 'अपनी कुंजी या डिवाइस पर AI से चैट करें', bn: 'নিজের কী বা ডিভাইসে AI-এর সাথে চ্যাট করুন', te: 'మీ కీ లేదా పరికరంలో AIతో చాట్ చేయండి', mr: 'तुमची की किंवा डिव्हाइसवर AI शी गप्पा मारा', ta: 'உங்கள் சாவி அல்லது சாதனத்தில் AI உடன் அரட்டை', gu: 'તમારી કી અથવા ઉપકરણ પર AI સાથે ચેટ કરો', ur: 'اپنی کلید یا ڈیوائس پر AI سے بات کریں', es: 'Chatea con IA con tu propia clave o en el dispositivo', fr: 'Discutez avec l’IA via votre clé ou en local', de: 'Mit KI chatten – eigener Schlüssel oder auf dem Gerät', pt: 'Converse com IA usando sua chave ou no dispositivo', zh: '用你自己的密钥或设备端与 AI 聊天', ar: 'تحدث مع الذكاء الاصطناعي بمفتاحك أو على الجهاز', ru: 'Чат с ИИ через свой ключ или на устройстве', ja: '自分のキーまたは端末内AIでチャット', id: 'Mengobrol dengan AI memakai kunci Anda atau di perangkat' },
  tl_invitation: { en: 'Invitation', hi: 'निमंत्रण', bn: 'আমন্ত্রণ', te: 'ఆహ్వానం', mr: 'आमंत्रण', ta: 'அழைப்பிதழ்', gu: 'આમંત્રણ', ur: 'دعوت نامہ', es: 'Invitación', fr: 'Invitation', de: 'Einladung', pt: 'Convite', zh: '邀请函', ar: 'دعوة', ru: 'Приглашение', ja: '招待状', id: 'Undangan' },
  td_invitation: { en: 'Invitations & greeting cards', hi: 'निमंत्रण और शुभकामना कार्ड', bn: 'আমন্ত্রণ ও শুভেচ্ছা কার্ড', te: 'ఆహ్వానాలు & శుభాకాంక్ష కార్డులు', mr: 'आमंत्रणे व शुभेच्छा कार्ड', ta: 'அழைப்பிதழ்கள் & வாழ்த்து அட்டைகள்', gu: 'આમંત્રણો અને શુભેચ્છા કાર્ડ', ur: 'دعوت نامے اور مبارکباد کارڈ', es: 'Invitaciones y tarjetas de felicitación', fr: 'Invitations et cartes de vœux', de: 'Einladungen & Grußkarten', pt: 'Convites e cartões', zh: '邀请函和贺卡', ar: 'دعوات وبطاقات تهنئة', ru: 'Приглашения и открытки', ja: '招待状・グリーティングカード', id: 'Undangan & kartu ucapan' },
  tl_collage: { en: 'Collage', hi: 'कोलाज', bn: 'কোলাজ', te: 'కోలాజ్', mr: 'कोलाज', ta: 'தொகுப்பு', gu: 'કોલાજ', ur: 'کولاج', es: 'Collage', fr: 'Collage', de: 'Collage', pt: 'Colagem', zh: '拼贴', ar: 'مجمّع صور', ru: 'Коллаж', ja: 'コラージュ', id: 'Kolase' },
  td_collage: { en: 'Grid photos into one image', hi: 'फ़ोटो को एक छवि में ग्रिड करें', bn: 'ছবি গ্রিড করে একটি ছবিতে', te: 'ఫోటోలను ఒక చిత్రంగా గ్రిడ్ చేయండి', mr: 'फोटो एका प्रतिमेत ग्रिड करा', ta: 'புகைப்படங்களை ஒரே படமாக கட்டமிடு', gu: 'ફોટાને એક છબીમાં ગ્રિડ કરો', ur: 'تصاویر کو ایک تصویر میں گرڈ کریں', es: 'Cuadrícula de fotos en una imagen', fr: 'Photos en grille dans une image', de: 'Fotos im Raster zu einem Bild', pt: 'Fotos em grade numa imagem', zh: '将照片拼成一张图', ar: 'ترتيب الصور في صورة واحدة', ru: 'Фото в сетке в одном изображении', ja: '写真をグリッドで1枚に', id: 'Foto dalam kisi menjadi satu gambar' },
  tl_meme: { en: 'Meme', hi: 'मीम', bn: 'মিম', te: 'మీమ్', mr: 'मीम', ta: 'மீம்', gu: 'મીમ', ur: 'میم', es: 'Meme', fr: 'Mème', de: 'Meme', pt: 'Meme', zh: '表情包', ar: 'ميم', ru: 'Мем', ja: 'ミーム', id: 'Meme' },
  td_meme: { en: 'Caption an image', hi: 'छवि पर कैप्शन लगाएं', bn: 'ছবিতে ক্যাপশন দিন', te: 'చిత్రానికి శీర్షిక జోడించండి', mr: 'प्रतिमेला मथळा द्या', ta: 'படத்திற்கு தலைப்பு இடு', gu: 'છબી પર કૅપ્શન મૂકો', ur: 'تصویر پر کیپشن لگائیں', es: 'Pon texto a una imagen', fr: 'Légender une image', de: 'Bild beschriften', pt: 'Legendar uma imagem', zh: '给图片加文字', ar: 'أضف تعليقًا على صورة', ru: 'Подпись к изображению', ja: '画像にキャプション', id: 'Beri teks pada gambar' },
  tl_image: { en: 'Image', hi: 'छवि', bn: 'ছবি', te: 'చిత్రం', mr: 'प्रतिमा', ta: 'படம்', gu: 'છબી', ur: 'تصویر', es: 'Imagen', fr: 'Image', de: 'Bild', pt: 'Imagem', zh: '图片', ar: 'صورة', ru: 'Изображение', ja: '画像', id: 'Gambar' },
  td_image: { en: 'Crop, filter, rotate, resize', hi: 'क्रॉप, फ़िल्टर, घुमाएं, आकार बदलें', bn: 'ক্রপ, ফিল্টার, ঘোরান, রিসাইজ', te: 'క్రాప్, ఫిల్టర్, తిప్పు, రీసైజ్', mr: 'क्रॉप, फिल्टर, फिरवा, आकार बदला', ta: 'வெட்டு, வடிகட்டு, சுழற்று, மறுஅளவு', gu: 'ક્રોપ, ફિલ્ટર, ફેરવો, માપ બદલો', ur: 'کراپ، فلٹر، گھمائیں، سائز بدلیں', es: 'Recortar, filtrar, rotar, redimensionar', fr: 'Recadrer, filtrer, pivoter, redimensionner', de: 'Zuschneiden, filtern, drehen, skalieren', pt: 'Cortar, filtrar, girar, redimensionar', zh: '裁剪、滤镜、旋转、调整大小', ar: 'قص، تصفية، تدوير، تغيير الحجم', ru: 'Обрезка, фильтр, поворот, размер', ja: '切り抜き・フィルター・回転・サイズ変更', id: 'Pangkas, filter, putar, ubah ukuran' },
  tl_compress: { en: 'Compress', hi: 'कंप्रेस', bn: 'কম্প্রেস', te: 'కంప్రెస్', mr: 'कंप्रेस', ta: 'சுருக்கு', gu: 'કમ્પ્રેસ', ur: 'کمپریس', es: 'Comprimir', fr: 'Compresser', de: 'Komprimieren', pt: 'Comprimir', zh: '压缩', ar: 'ضغط', ru: 'Сжать', ja: '圧縮', id: 'Kompres' },
  td_compress: { en: 'Shrink images, PDFs & video', hi: 'छवियाँ, PDF और वीडियो छोटा करें', bn: 'ছবি, PDF ও ভিডিও ছোট করুন', te: 'చిత్రాలు, PDFలు & వీడియోను చిన్నవి చేయండి', mr: 'प्रतिमा, PDF व व्हिडिओ लहान करा', ta: 'படங்கள், PDFகள் & வீடியோவைச் சுருக்கு', gu: 'છબીઓ, PDF અને વિડિઓ નાનાં કરો', ur: 'تصاویر، PDF اور ویڈیو چھوٹا کریں', es: 'Reduce imágenes, PDF y vídeo', fr: 'Réduire images, PDF et vidéo', de: 'Bilder, PDFs & Video verkleinern', pt: 'Reduza imagens, PDFs e vídeo', zh: '压缩图片、PDF 和视频', ar: 'صغّر الصور وملفات PDF والفيديو', ru: 'Уменьшить изображения, PDF и видео', ja: '画像・PDF・動画を縮小', id: 'Perkecil gambar, PDF & video' },
  tl_convert: { en: 'Convert', hi: 'कन्वर्ट', bn: 'কনভার্ট', te: 'కన్వర్ట్', mr: 'कन्व्हर्ट', ta: 'மாற்று', gu: 'કન્વર્ટ', ur: 'تبدیل', es: 'Convertir', fr: 'Convertir', de: 'Konvertieren', pt: 'Converter', zh: '转换', ar: 'تحويل', ru: 'Конвертировать', ja: '変換', id: 'Konversi' },
  td_convert: { en: 'HEIC→JPG, PNG, WebP, AVIF', hi: 'HEIC→JPG, PNG, WebP, AVIF', bn: 'HEIC→JPG, PNG, WebP, AVIF', te: 'HEIC→JPG, PNG, WebP, AVIF', mr: 'HEIC→JPG, PNG, WebP, AVIF', ta: 'HEIC→JPG, PNG, WebP, AVIF', gu: 'HEIC→JPG, PNG, WebP, AVIF', ur: 'HEIC→JPG, PNG, WebP, AVIF', es: 'HEIC→JPG, PNG, WebP, AVIF', fr: 'HEIC→JPG, PNG, WebP, AVIF', de: 'HEIC→JPG, PNG, WebP, AVIF', pt: 'HEIC→JPG, PNG, WebP, AVIF', zh: 'HEIC→JPG、PNG、WebP、AVIF', ar: 'HEIC→JPG، PNG، WebP، AVIF', ru: 'HEIC→JPG, PNG, WebP, AVIF', ja: 'HEIC→JPG・PNG・WebP・AVIF', id: 'HEIC→JPG, PNG, WebP, AVIF' },
  tl_watermark: { en: 'Watermark', hi: 'वॉटरमार्क', bn: 'ওয়াটারমার্ক', te: 'వాటర్‌మార్క్', mr: 'वॉटरमार्क', ta: 'நீர்அடையாளம்', gu: 'વોટરમાર્ક', ur: 'واٹر مارک', es: 'Marca de agua', fr: 'Filigrane', de: 'Wasserzeichen', pt: 'Marca d’água', zh: '水印', ar: 'علامة مائية', ru: 'Водяной знак', ja: '透かし', id: 'Tanda air' },
  td_watermark: { en: 'Stamp PDFs & images', hi: 'PDF और छवियों पर मुहर', bn: 'PDF ও ছবিতে স্ট্যাম্প', te: 'PDFలు & చిత్రాలపై స్టాంప్', mr: 'PDF व प्रतिमांवर शिक्का', ta: 'PDFகள் & படங்களில் முத்திரை', gu: 'PDF અને છબીઓ પર સ્ટેમ્પ', ur: 'PDF اور تصاویر پر مہر', es: 'Sella PDF e imágenes', fr: 'Marquer PDF et images', de: 'PDFs & Bilder stempeln', pt: 'Carimbe PDFs e imagens', zh: '为 PDF 和图片盖章', ar: 'اختم ملفات PDF والصور', ru: 'Штамп на PDF и изображениях', ja: 'PDF・画像にスタンプ', id: 'Cap PDF & gambar' },
  tl_pdf_forms: { en: 'PDF forms', hi: 'PDF फ़ॉर्म', bn: 'PDF ফর্ম', te: 'PDF ఫారాలు', mr: 'PDF फॉर्म', ta: 'PDF படிவங்கள்', gu: 'PDF ફોર્મ', ur: 'PDF فارمز', es: 'Formularios PDF', fr: 'Formulaires PDF', de: 'PDF-Formulare', pt: 'Formulários PDF', zh: 'PDF 表单', ar: 'نماذج PDF', ru: 'PDF-формы', ja: 'PDF フォーム', id: 'Formulir PDF' },
  td_pdf_forms: { en: 'Add fillable fields to a PDF', hi: 'PDF में भरने योग्य फ़ील्ड जोड़ें', bn: 'PDF-এ পূরণযোগ্য ফিল্ড যোগ করুন', te: 'PDFకి పూరించదగిన ఫీల్డ్‌లు జోడించండి', mr: 'PDF मध्ये भरण्यायोग्य फील्ड जोडा', ta: 'PDF-இல் நிரப்பக்கூடிய புலங்களைச் சேர்', gu: 'PDF માં ભરી શકાય તેવા ફીલ્ડ ઉમેરો', ur: 'PDF میں قابلِ پُر فیلڈز شامل کریں', es: 'Añade campos rellenables a un PDF', fr: 'Ajoutez des champs à remplir à un PDF', de: 'Ausfüllbare Felder zu einem PDF hinzufügen', pt: 'Adicione campos preenchíveis a um PDF', zh: '为 PDF 添加可填写字段', ar: 'أضف حقولاً قابلة للتعبئة إلى PDF', ru: 'Добавьте заполняемые поля в PDF', ja: 'PDF に入力欄を追加', id: 'Tambahkan bidang isian ke PDF' },
  tl_protect: { en: 'Protect PDF', hi: 'PDF सुरक्षित करें', bn: 'PDF সুরক্ষিত করুন', te: 'PDF రక్షించండి', mr: 'PDF संरक्षित करा', ta: 'PDF பாதுகா', gu: 'PDF સુરક્ષિત કરો', ur: 'PDF محفوظ کریں', es: 'Proteger PDF', fr: 'Protéger le PDF', de: 'PDF schützen', pt: 'Proteger PDF', zh: '保护 PDF', ar: 'حماية PDF', ru: 'Защитить PDF', ja: 'PDF を保護', id: 'Lindungi PDF' },
  td_protect: { en: 'Password-protect or unlock', hi: 'पासवर्ड लगाएं या हटाएं', bn: 'পাসওয়ার্ড দিন বা আনলক করুন', te: 'పాస్‌వర్డ్ పెట్టండి లేదా అన్‌లాక్', mr: 'पासवर्ड लावा किंवा अनलॉक करा', ta: 'கடவுச்சொல் இடு அல்லது திற', gu: 'પાસવર્ડ મૂકો અથવા અનલૉક કરો', ur: 'پاس ورڈ لگائیں یا کھولیں', es: 'Proteger con contraseña o desbloquear', fr: 'Protéger par mot de passe ou déverrouiller', de: 'Mit Passwort schützen oder entsperren', pt: 'Proteger com senha ou desbloquear', zh: '设置密码或解锁', ar: 'حماية بكلمة مرور أو فتح', ru: 'Защита паролем или снятие', ja: 'パスワード保護または解除', id: 'Lindungi kata sandi atau buka' },
  tl_scan: { en: 'Scan', hi: 'स्कैन', bn: 'স্ক্যান', te: 'స్కాన్', mr: 'स्कॅन', ta: 'ஸ்கேன்', gu: 'સ્કૅન', ur: 'اسکین', es: 'Escanear', fr: 'Numériser', de: 'Scannen', pt: 'Digitalizar', zh: '扫描', ar: 'مسح ضوئي', ru: 'Сканировать', ja: 'スキャン', id: 'Pindai' },
  td_scan: { en: 'Camera → multi-page PDF', hi: 'कैमरा → बहु-पृष्ठ PDF', bn: 'ক্যামেরা → বহু-পৃষ্ঠা PDF', te: 'కెమెరా → బహు-పేజీ PDF', mr: 'कॅमेरा → बहु-पृष्ठ PDF', ta: 'கேமரா → பல பக்க PDF', gu: 'કૅમેરા → બહુ-પૃષ્ઠ PDF', ur: 'کیمرا → کثیر صفحاتی PDF', es: 'Cámara → PDF de varias páginas', fr: 'Appareil photo → PDF multipage', de: 'Kamera → mehrseitiges PDF', pt: 'Câmera → PDF de várias páginas', zh: '相机 → 多页 PDF', ar: 'الكاميرا → PDF متعدد الصفحات', ru: 'Камера → многостраничный PDF', ja: 'カメラ → 複数ページPDF', id: 'Kamera → PDF multi-halaman' },
  tl_record: { en: 'Record', hi: 'रिकॉर्ड', bn: 'রেকর্ড', te: 'రికార్డ్', mr: 'रेकॉर्ड', ta: 'பதிவு', gu: 'રેકોર્ડ', ur: 'ریکارڈ', es: 'Grabar', fr: 'Enregistrer', de: 'Aufnehmen', pt: 'Gravar', zh: '录制', ar: 'تسجيل', ru: 'Запись', ja: '録画', id: 'Rekam' },
  td_record: { en: 'Screen or camera → video', hi: 'स्क्रीन या कैमरा → वीडियो', bn: 'স্ক্রিন বা ক্যামেরা → ভিডিও', te: 'స్క్రీన్ లేదా కెమెరా → వీడియో', mr: 'स्क्रीन किंवा कॅमेरा → व्हिडिओ', ta: 'திரை அல்லது கேமரா → வீடியோ', gu: 'સ્ક્રીન કે કૅમેરા → વિડિઓ', ur: 'اسکرین یا کیمرا → ویڈیو', es: 'Pantalla o cámara → vídeo', fr: 'Écran ou caméra → vidéo', de: 'Bildschirm oder Kamera → Video', pt: 'Tela ou câmera → vídeo', zh: '屏幕或摄像头 → 视频', ar: 'الشاشة أو الكاميرا → فيديو', ru: 'Экран или камера → видео', ja: '画面またはカメラ → 動画', id: 'Layar atau kamera → video' },
  tl_video: { en: 'Video', hi: 'वीडियो', bn: 'ভিডিও', te: 'వీడియో', mr: 'व्हिडिओ', ta: 'வீடியோ', gu: 'વિડિઓ', ur: 'ویڈیو', es: 'Vídeo', fr: 'Vidéo', de: 'Video', pt: 'Vídeo', zh: '视频', ar: 'فيديو', ru: 'Видео', ja: '動画', id: 'Video' },
  td_video: { en: 'Trim, GIF, audio, compress', hi: 'ट्रिम, GIF, ऑडियो, कंप्रेस', bn: 'ট্রিম, GIF, অডিও, কম্প্রেস', te: 'ట్రిమ్, GIF, ఆడియో, కంప్రెస్', mr: 'ट्रिम, GIF, ऑडिओ, कंप्रेस', ta: 'ட்ரிம், GIF, ஆடியோ, சுருக்கு', gu: 'ટ્રિમ, GIF, ઑડિઓ, કમ્પ્રેસ', ur: 'ٹرم، GIF، آڈیو، کمپریس', es: 'Recortar, GIF, audio, comprimir', fr: 'Découper, GIF, audio, compresser', de: 'Trimmen, GIF, Audio, komprimieren', pt: 'Cortar, GIF, áudio, comprimir', zh: '裁剪、GIF、音频、压缩', ar: 'قص، GIF، صوت، ضغط', ru: 'Обрезка, GIF, аудио, сжатие', ja: 'トリム・GIF・音声・圧縮', id: 'Pangkas, GIF, audio, kompres' },
  tl_sign: { en: 'Sign / verify', hi: 'हस्ताक्षर / सत्यापन', bn: 'সই / যাচাই', te: 'సంతకం / ధృవీకరణ', mr: 'स्वाक्षरी / पडताळणी', ta: 'கையொப்பம் / சரிபார்', gu: 'સહી / ચકાસણી', ur: 'دستخط / تصدیق', es: 'Firmar / verificar', fr: 'Signer / vérifier', de: 'Signieren / prüfen', pt: 'Assinar / verificar', zh: '签名 / 验证', ar: 'توقيع / تحقق', ru: 'Подпись / проверка', ja: '署名 / 検証', id: 'Tanda tangan / verifikasi' },
  td_sign: { en: 'Private digital signature', hi: 'निजी डिजिटल हस्ताक्षर', bn: 'ব্যক্তিগত ডিজিটাল স্বাক্ষর', te: 'ప్రైవేట్ డిజిటల్ సంతకం', mr: 'खाजगी डिजिटल स्वाक्षरी', ta: 'தனிப்பட்ட டிஜிட்டல் கையொப்பம்', gu: 'ખાનગી ડિજિટલ સહી', ur: 'نجی ڈیجیٹل دستخط', es: 'Firma digital privada', fr: 'Signature numérique privée', de: 'Private digitale Signatur', pt: 'Assinatura digital privada', zh: '私密数字签名', ar: 'توقيع رقمي خاص', ru: 'Личная цифровая подпись', ja: 'プライベートな電子署名', id: 'Tanda tangan digital privat' },
  tl_combine: { en: 'Combine', hi: 'जोड़ें', bn: 'একত্র করুন', te: 'కలపండి', mr: 'एकत्र करा', ta: 'இணை', gu: 'જોડો', ur: 'جوڑیں', es: 'Combinar', fr: 'Combiner', de: 'Zusammenfügen', pt: 'Combinar', zh: '合并', ar: 'دمج', ru: 'Объединить', ja: 'まとめる', id: 'Gabungkan' },
  td_combine: { en: 'Merge designs into one PDF', hi: 'डिज़ाइनों को एक PDF में मर्ज करें', bn: 'ডিজাইন এক PDF-এ মার্জ করুন', te: 'డిజైన్‌లను ఒక PDFగా విలీనం చేయండి', mr: 'डिझाइन्स एका PDF मध्ये विलीन करा', ta: 'வடிவமைப்புகளை ஒரே PDF ஆக இணை', gu: 'ડિઝાઇનને એક PDF માં મર્જ કરો', ur: 'ڈیزائنز کو ایک PDF میں ضم کریں', es: 'Combina diseños en un PDF', fr: 'Fusionnez les designs en un PDF', de: 'Designs zu einem PDF zusammenführen', pt: 'Mescle designs em um PDF', zh: '将设计合并为一个 PDF', ar: 'ادمج التصاميم في PDF واحد', ru: 'Объедините дизайны в один PDF', ja: 'デザインを1つのPDFに統合', id: 'Gabungkan desain menjadi satu PDF' },
  m_resume_title: { en: 'Résumé builder', hi: 'रिज़्यूमे बिल्डर', bn: 'রেজ্যুমে বিল্ডার', te: 'రెజ్యూమ్ బిల్డర్', mr: 'रेझ्युमे बिल्डर', ta: 'விவரக்குறிப்பு உருவாக்கி', gu: 'રેઝ્યૂમે બિલ્ડર', ur: 'ریزیومے بلڈر', es: 'Creador de currículum', fr: 'Créateur de CV', de: 'Lebenslauf-Builder', pt: 'Criador de currículo', zh: '简历生成器', ar: 'منشئ السيرة الذاتية', ru: 'Конструктор резюме', ja: '履歴書ビルダー', id: 'Pembuat resume' },
  m_letter_title: { en: 'Cover letter', hi: 'कवर लेटर', bn: 'কভার লেটার', te: 'కవర్ లెటర్', mr: 'कव्हर लेटर', ta: 'அட்டைக் கடிதம்', gu: 'કવર લેટર', ur: 'کور لیٹر', es: 'Carta de presentación', fr: 'Lettre de motivation', de: 'Anschreiben', pt: 'Carta de apresentação', zh: '求职信', ar: 'خطاب تقديم', ru: 'Сопроводительное письмо', ja: 'カバーレター', id: 'Surat lamaran' },
  m_scan_title: { en: 'Scan a document', hi: 'दस्तावेज़ स्कैन करें', bn: 'নথি স্ক্যান করুন', te: 'పత్రాన్ని స్కాన్ చేయండి', mr: 'दस्तऐवज स्कॅन करा', ta: 'ஆவணத்தை ஸ்கேன் செய்', gu: 'દસ્તાવેજ સ્કૅન કરો', ur: 'دستاویز اسکین کریں', es: 'Escanear un documento', fr: 'Numériser un document', de: 'Dokument scannen', pt: 'Digitalizar um documento', zh: '扫描文档', ar: 'مسح مستند', ru: 'Сканировать документ', ja: '書類をスキャン', id: 'Pindai dokumen' },
  m_record_title: { en: 'Record screen or camera', hi: 'स्क्रीन या कैमरा रिकॉर्ड करें', bn: 'স্ক্রিন বা ক্যামেরা রেকর্ড করুন', te: 'స్క్రీన్ లేదా కెమెరా రికార్డ్ చేయండి', mr: 'स्क्रीन किंवा कॅमेरा रेकॉर्ड करा', ta: 'திரை அல்லது கேமராவைப் பதிவு செய்', gu: 'સ્ક્રીન કે કૅમેરા રેકોર્ડ કરો', ur: 'اسکرین یا کیمرا ریکارڈ کریں', es: 'Grabar pantalla o cámara', fr: 'Enregistrer l’écran ou la caméra', de: 'Bildschirm oder Kamera aufnehmen', pt: 'Gravar tela ou câmera', zh: '录制屏幕或摄像头', ar: 'تسجيل الشاشة أو الكاميرا', ru: 'Запись экрана или камеры', ja: '画面・カメラを録画', id: 'Rekam layar atau kamera' },
  m_video_title: { en: 'Video Studio', hi: 'वीडियो स्टूडियो', bn: 'ভিডিও স্টুডিও', te: 'వీడియో స్టూడియో', mr: 'व्हिडिओ स्टुडिओ', ta: 'வீடியோ ஸ்டுடியோ', gu: 'વિડિઓ સ્ટુડિયો', ur: 'ویڈیو اسٹوڈیو', es: 'Estudio de vídeo', fr: 'Studio vidéo', de: 'Video-Studio', pt: 'Estúdio de vídeo', zh: '视频工作室', ar: 'استوديو الفيديو', ru: 'Видеостудия', ja: 'ビデオスタジオ', id: 'Studio video' },
  m_protect_title: { en: 'Protect & Unlock PDF', hi: 'PDF सुरक्षित करें और खोलें', bn: 'PDF সুরক্ষিত ও আনলক করুন', te: 'PDF రక్షించి అన్‌లాక్ చేయండి', mr: 'PDF संरक्षित करा व अनलॉक करा', ta: 'PDF பாதுகாத்து திற', gu: 'PDF સુરક્ષિત કરો અને અનલૉક કરો', ur: 'PDF محفوظ کریں اور کھولیں', es: 'Proteger y desbloquear PDF', fr: 'Protéger et déverrouiller le PDF', de: 'PDF schützen & entsperren', pt: 'Proteger e desbloquear PDF', zh: '保护并解锁 PDF', ar: 'حماية وفتح PDF', ru: 'Защитить и разблокировать PDF', ja: 'PDF を保護・解除', id: 'Lindungi & buka PDF' },
  m_pdfform_title: { en: 'PDF form fields', hi: 'PDF फ़ॉर्म फ़ील्ड', bn: 'PDF ফর্ম ফিল্ড', te: 'PDF ఫారం ఫీల్డ్‌లు', mr: 'PDF फॉर्म फील्ड', ta: 'PDF படிவப் புலங்கள்', gu: 'PDF ફોર્મ ફીલ્ડ', ur: 'PDF فارم فیلڈز', es: 'Campos de formulario PDF', fr: 'Champs de formulaire PDF', de: 'PDF-Formularfelder', pt: 'Campos de formulário PDF', zh: 'PDF 表单字段', ar: 'حقول نموذج PDF', ru: 'Поля PDF-формы', ja: 'PDF フォーム欄', id: 'Bidang formulir PDF' },
  act_save: { en: 'Save', hi: 'सहेजें', bn: 'সংরক্ষণ', te: 'సేవ్', mr: 'जतन करा', ta: 'சேமி', gu: 'સાચવો', ur: 'محفوظ کریں', kn: 'ಉಳಿಸಿ', ml: 'സേവ് ചെയ്യുക', pa: 'ਸੰਭਾਲੋ', or: 'ସେଭ୍ କରନ୍ତୁ', as: 'ছেভ কৰক', es: 'Guardar', fr: 'Enregistrer', de: 'Speichern', pt: 'Salvar', zh: '保存', ar: 'حفظ', ru: 'Сохранить', ja: '保存', id: 'Simpan' },
  act_apply: { en: 'Apply', hi: 'लागू करें', bn: 'প্রয়োগ', te: 'వర్తించు', mr: 'लागू करा', ta: 'பயன்படுத்து', gu: 'લાગુ કરો', ur: 'لاگو کریں', kn: 'ಅನ್ವಯಿಸಿ', ml: 'പ്രയോഗിക്കുക', pa: 'ਲਾਗੂ ਕਰੋ', or: 'ପ୍ରୟୋଗ କରନ୍ତୁ', as: 'প্ৰয়োগ কৰক', es: 'Aplicar', fr: 'Appliquer', de: 'Anwenden', pt: 'Aplicar', zh: '应用', ar: 'تطبيق', ru: 'Применить', ja: '適用', id: 'Terapkan' },
  ctl_quality: { en: 'Quality', hi: 'गुणवत्ता', bn: 'মান', te: 'నాణ్యత', mr: 'गुणवत्ता', ta: 'தரம்', gu: 'ગુણવત્તા', ur: 'معیار', es: 'Calidad', fr: 'Qualité', de: 'Qualität', pt: 'Qualidade', zh: '质量', ar: 'الجودة', ru: 'Качество', ja: '画質', id: 'Kualitas' },
  ctl_format: { en: 'Format', hi: 'फ़ॉर्मैट', bn: 'ফরম্যাট', te: 'ఫార్మాట్', mr: 'फॉरमॅट', ta: 'வடிவம்', gu: 'ફોર્મેટ', ur: 'فارمیٹ', es: 'Formato', fr: 'Format', de: 'Format', pt: 'Formato', zh: '格式', ar: 'الصيغة', ru: 'Формат', ja: '形式', id: 'Format' },
  ctl_maxsize: { en: 'Max size', hi: 'अधिकतम आकार', bn: 'সর্বোচ্চ আকার', te: 'గరిష్ట పరిమాణం', mr: 'कमाल आकार', ta: 'அதிகபட்ச அளவு', gu: 'મહત્તમ માપ', ur: 'زیادہ سے زیادہ سائز', es: 'Tamaño máx.', fr: 'Taille max', de: 'Max. Größe', pt: 'Tamanho máx.', zh: '最大尺寸', ar: 'الحجم الأقصى', ru: 'Макс. размер', ja: '最大サイズ', id: 'Ukuran maks' },
  ctl_mode: { en: 'Mode', hi: 'मोड', bn: 'মোড', te: 'మోడ్', mr: 'मोड', ta: 'பயன்முறை', gu: 'મોડ', ur: 'موڈ', es: 'Modo', fr: 'Mode', de: 'Modus', pt: 'Modo', zh: '模式', ar: 'الوضع', ru: 'Режим', ja: 'モード', id: 'Mode' },
  ctl_opacity: { en: 'Opacity', hi: 'अपारदर्शिता', bn: 'অস্বচ্ছতা', te: 'అపారదర్శకత', mr: 'अपारदर्शकता', ta: 'ஒளிபுகாமை', gu: 'અપારદર્શકતા', ur: 'دھندلاہٹ', es: 'Opacidad', fr: 'Opacité', de: 'Deckkraft', pt: 'Opacidade', zh: '不透明度', ar: 'العتامة', ru: 'Непрозрачность', ja: '不透明度', id: 'Opasitas' },
  ctl_angle: { en: 'Angle', hi: 'कोण', bn: 'কোণ', te: 'కోణం', mr: 'कोन', ta: 'கோணம்', gu: 'કોણ', ur: 'زاویہ', es: 'Ángulo', fr: 'Angle', de: 'Winkel', pt: 'Ângulo', zh: '角度', ar: 'الزاوية', ru: 'Угол', ja: '角度', id: 'Sudut' },
  ctl_colour: { en: 'Colour', hi: 'रंग', bn: 'রঙ', te: 'రంగు', mr: 'रंग', ta: 'நிறம்', gu: 'રંગ', ur: 'رنگ', es: 'Color', fr: 'Couleur', de: 'Farbe', pt: 'Cor', zh: '颜色', ar: 'اللون', ru: 'Цвет', ja: '色', id: 'Warna' },
  ctl_columns: { en: 'Columns', hi: 'कॉलम', bn: 'কলাম', te: 'నిలువు వరుసలు', mr: 'स्तंभ', ta: 'நெடுவரிசைகள்', gu: 'કૉલમ', ur: 'کالم', es: 'Columnas', fr: 'Colonnes', de: 'Spalten', pt: 'Colunas', zh: '列', ar: 'الأعمدة', ru: 'Столбцы', ja: '列', id: 'Kolom' },
  ctl_spacing: { en: 'Spacing', hi: 'अंतराल', bn: 'ব্যবধান', te: 'అంతరం', mr: 'अंतर', ta: 'இடைவெளி', gu: 'અંતર', ur: 'وقفہ', es: 'Espaciado', fr: 'Espacement', de: 'Abstand', pt: 'Espaçamento', zh: '间距', ar: 'التباعد', ru: 'Отступ', ja: '間隔', id: 'Spasi' },
  ctl_rounding: { en: 'Rounding', hi: 'गोलाई', bn: 'গোলাকার', te: 'గుండ్రనితనం', mr: 'गोलाई', ta: 'வட்டமாக்கல்', gu: 'ગોળાઈ', ur: 'گولائی', es: 'Redondeo', fr: 'Arrondi', de: 'Rundung', pt: 'Arredondamento', zh: '圆角', ar: 'التدوير', ru: 'Скругление', ja: '角丸', id: 'Pembulatan' },
  ctl_tile: { en: 'Tile (repeat)', hi: 'टाइल (दोहराएं)', bn: 'টাইল (পুনরাবৃত্তি)', te: 'టైల్ (పునరావృతం)', mr: 'टाइल (पुनरावृत्ती)', ta: 'ஓடு (மீண்டும்)', gu: 'ટાઇલ (પુનરાવર્તન)', ur: 'ٹائل (دہرائیں)', es: 'Mosaico (repetir)', fr: 'Mosaïque (répéter)', de: 'Kacheln (wiederholen)', pt: 'Mosaico (repetir)', zh: '平铺（重复）', ar: 'تكرار (بلاط)', ru: 'Плитка (повтор)', ja: 'タイル（繰り返し）', id: 'Ubin (ulang)' },
  ai_settings: { en: 'AI settings', hi: 'AI सेटिंग्स', bn: 'AI সেটিংস', te: 'AI సెట్టింగ్‌లు', mr: 'AI सेटिंग्ज', ta: 'AI அமைப்புகள்', gu: 'AI સેટિંગ્સ', ur: 'AI ترتیبات', es: 'Ajustes de IA', fr: 'Paramètres IA', de: 'KI-Einstellungen', pt: 'Configurações de IA', zh: 'AI 设置', ar: 'إعدادات الذكاء الاصطناعي', ru: 'Настройки ИИ', ja: 'AI 設定', id: 'Pengaturan AI' },
  ai_hide_settings: { en: 'Hide settings', hi: 'सेटिंग्स छिपाएं', bn: 'সেটিংস লুকান', te: 'సెట్టింగ్‌లు దాచు', mr: 'सेटिंग्ज लपवा', ta: 'அமைப்புகளை மறை', gu: 'સેટિંગ્સ છુપાવો', ur: 'ترتیبات چھپائیں', es: 'Ocultar ajustes', fr: 'Masquer les paramètres', de: 'Einstellungen ausblenden', pt: 'Ocultar configurações', zh: '隐藏设置', ar: 'إخفاء الإعدادات', ru: 'Скрыть настройки', ja: '設定を隠す', id: 'Sembunyikan pengaturan' },
  ai_here: { en: 'AI is provided by this site — just chat below.', hi: 'AI इस साइट द्वारा प्रदान किया गया है — बस नीचे चैट करें।', bn: 'AI এই সাইট সরবরাহ করে — নিচে চ্যাট করুন।', te: 'AIని ఈ సైట్ అందిస్తుంది — కింద చాట్ చేయండి.', mr: 'AI ही साइट पुरवते — खाली गप्पा मारा.', ta: 'AI இந்த தளத்தால் வழங்கப்படுகிறது — கீழே அரட்டையடி.', gu: 'AI આ સાઇટ આપે છે — નીચે ચેટ કરો.', ur: 'AI یہ سائٹ فراہم کرتی ہے — نیچے چیٹ کریں۔', es: 'La IA la proporciona este sitio: chatea abajo.', fr: 'L’IA est fournie par ce site — discutez ci-dessous.', de: 'Die KI stellt diese Seite bereit — chatte unten.', pt: 'A IA é fornecida por este site — converse abaixo.', zh: '本站提供 AI——在下方聊天即可。', ar: 'يوفّر هذا الموقع الذكاء الاصطناعي — تحدّث أدناه.', ru: 'ИИ предоставляет этот сайт — пишите ниже.', ja: 'AI はこのサイトが提供します — 下でチャット。', id: 'AI disediakan oleh situs ini — mengobrol di bawah.' },
  ai_byok: { en: 'Use your own key (stored only in this browser). Works with Anthropic and OpenAI-style APIs (Groq, OpenRouter, Together, Ollama). Or run a model on your device.', hi: 'अपनी कुंजी का उपयोग करें (केवल इस ब्राउज़र में संग्रहीत)। Anthropic और OpenAI-शैली API (Groq, OpenRouter, Together, Ollama) के साथ काम करता है। या अपने डिवाइस पर मॉडल चलाएं।', bn: 'নিজের কী ব্যবহার করুন (শুধু এই ব্রাউজারে সংরক্ষিত)। Anthropic ও OpenAI-শৈলী API (Groq, OpenRouter, Together, Ollama) সমর্থন করে। অথবা ডিভাইসে মডেল চালান।', te: 'మీ స్వంత కీని వాడండి (ఈ బ్రౌజర్‌లో మాత్రమే నిల్వ). Anthropic, OpenAI-శైలి APIలతో (Groq, OpenRouter, Together, Ollama) పనిచేస్తుంది. లేదా మీ పరికరంలో మోడల్ నడపండి.', mr: 'तुमची की वापरा (फक्त या ब्राउझरमध्ये संग्रहित). Anthropic व OpenAI-शैली API (Groq, OpenRouter, Together, Ollama) सोबत चालते. किंवा तुमच्या डिव्हाइसवर मॉडेल चालवा.', ta: 'உங்கள் சொந்த சாவியைப் பயன்படுத்துங்கள் (இந்த உலாவியில் மட்டுமே சேமிப்பு). Anthropic மற்றும் OpenAI-பாணி APIகளுடன் (Groq, OpenRouter, Together, Ollama) வேலை செய்யும். அல்லது உங்கள் சாதனத்தில் மாதிரியை இயக்குங்கள்.', gu: 'તમારી પોતાની કી વાપરો (ફક્ત આ બ્રાઉઝરમાં સંગ્રહિત). Anthropic અને OpenAI-શૈલી API (Groq, OpenRouter, Together, Ollama) સાથે કામ કરે. અથવા તમારા ઉપકરણ પર મોડેલ ચલાવો.', ur: 'اپنی کلید استعمال کریں (صرف اسی براؤزر میں محفوظ)۔ Anthropic اور OpenAI طرز کی APIs (Groq, OpenRouter, Together, Ollama) کے ساتھ کام کرتا ہے۔ یا اپنے ڈیوائس پر ماڈل چلائیں۔', es: 'Usa tu propia clave (guardada solo en este navegador). Funciona con APIs de Anthropic y estilo OpenAI (Groq, OpenRouter, Together, Ollama). O ejecuta un modelo en tu dispositivo.', fr: 'Utilisez votre clé (stockée uniquement dans ce navigateur). Compatible avec les API Anthropic et de type OpenAI (Groq, OpenRouter, Together, Ollama). Ou exécutez un modèle en local.', de: 'Eigenen Schlüssel verwenden (nur in diesem Browser gespeichert). Funktioniert mit Anthropic- und OpenAI-ähnlichen APIs (Groq, OpenRouter, Together, Ollama). Oder ein Modell auf dem Gerät ausführen.', pt: 'Use sua própria chave (armazenada só neste navegador). Funciona com APIs Anthropic e estilo OpenAI (Groq, OpenRouter, Together, Ollama). Ou rode um modelo no dispositivo.', zh: '使用你自己的密钥（仅存储在此浏览器）。支持 Anthropic 和 OpenAI 风格 API（Groq、OpenRouter、Together、Ollama）。或在设备端运行模型。', ar: 'استخدم مفتاحك الخاص (يُخزَّن في هذا المتصفح فقط). يعمل مع واجهات Anthropic و OpenAI (Groq وOpenRouter وTogether وOllama). أو شغّل نموذجًا على جهازك.', ru: 'Используйте свой ключ (хранится только в этом браузере). Работает с API Anthropic и в стиле OpenAI (Groq, OpenRouter, Together, Ollama). Или запустите модель на устройстве.', ja: '自分のキーを使用（このブラウザーのみに保存）。Anthropic と OpenAI 形式の API（Groq、OpenRouter、Together、Ollama）に対応。または端末でモデルを実行。', id: 'Gunakan kunci Anda sendiri (disimpan hanya di browser ini). Mendukung API Anthropic dan gaya OpenAI (Groq, OpenRouter, Together, Ollama). Atau jalankan model di perangkat Anda.' },
  ai_endpoint: { en: 'Endpoint', hi: 'एंडपॉइंट', bn: 'এন্ডপয়েন্ট', te: 'ఎండ్‌పాయింట్', mr: 'एंडपॉइंट', ta: 'எண்ட்பாயிண்ட்', gu: 'એન્ડપોઇન્ટ', ur: 'اینڈ پوائنٹ', es: 'Endpoint', fr: 'Point de terminaison', de: 'Endpunkt', pt: 'Endpoint', zh: '端点', ar: 'نقطة النهاية', ru: 'Эндпоинт', ja: 'エンドポイント', id: 'Endpoint' },
  ai_api_key: { en: 'API key', hi: 'API कुंजी', bn: 'API কী', te: 'API కీ', mr: 'API की', ta: 'API சாவி', gu: 'API કી', ur: 'API کلید', es: 'Clave de API', fr: 'Clé API', de: 'API-Schlüssel', pt: 'Chave de API', zh: 'API 密钥', ar: 'مفتاح API', ru: 'API-ключ', ja: 'API キー', id: 'Kunci API' },
  ai_model: { en: 'Model', hi: 'मॉडल', bn: 'মডেল', te: 'మోడల్', mr: 'मॉडेल', ta: 'மாதிரி', gu: 'મોડેલ', ur: 'ماڈل', es: 'Modelo', fr: 'Modèle', de: 'Modell', pt: 'Modelo', zh: '模型', ar: 'النموذج', ru: 'Модель', ja: 'モデル', id: 'Model' },
  ai_key_ph: { en: 'stored only in your browser', hi: 'केवल आपके ब्राउज़र में संग्रहीत', bn: 'শুধু আপনার ব্রাউজারে সংরক্ষিত', te: 'మీ బ్రౌజర్‌లో మాత్రమే నిల్వ', mr: 'फक्त तुमच्या ब्राउझरमध्ये संग्रहित', ta: 'உங்கள் உலாவியில் மட்டுமே சேமிப்பு', gu: 'ફક્ત તમારા બ્રાઉઝરમાં સંગ્રહિત', ur: 'صرف آپ کے براؤزر میں محفوظ', es: 'guardada solo en tu navegador', fr: 'stockée uniquement dans votre navigateur', de: 'nur in Ihrem Browser gespeichert', pt: 'armazenada só no seu navegador', zh: '仅存储在你的浏览器', ar: 'مخزَّن في متصفحك فقط', ru: 'хранится только в вашем браузере', ja: 'ブラウザーのみに保存', id: 'disimpan hanya di browser Anda' },
  ai_local: { en: 'Run AI on my device (WebGPU)', hi: 'मेरे डिवाइस पर AI चलाएं (WebGPU)', bn: 'আমার ডিভাইসে AI চালান (WebGPU)', te: 'నా పరికరంలో AI నడపండి (WebGPU)', mr: 'माझ्या डिव्हाइसवर AI चालवा (WebGPU)', ta: 'என் சாதனத்தில் AI இயக்கு (WebGPU)', gu: 'મારા ઉપકરણ પર AI ચલાવો (WebGPU)', ur: 'میرے ڈیوائس پر AI چلائیں (WebGPU)', es: 'Ejecutar IA en mi dispositivo (WebGPU)', fr: 'Exécuter l’IA sur mon appareil (WebGPU)', de: 'KI auf meinem Gerät ausführen (WebGPU)', pt: 'Executar IA no meu dispositivo (WebGPU)', zh: '在我的设备上运行 AI（WebGPU）', ar: 'تشغيل الذكاء الاصطناعي على جهازي (WebGPU)', ru: 'Запустить ИИ на моём устройстве (WebGPU)', ja: '自分の端末で AI を実行（WebGPU）', id: 'Jalankan AI di perangkat saya (WebGPU)' },
  ai_local_needs: { en: '— needs Chrome/Edge', hi: '— Chrome/Edge आवश्यक', bn: '— Chrome/Edge প্রয়োজন', te: '— Chrome/Edge అవసరం', mr: '— Chrome/Edge आवश्यक', ta: '— Chrome/Edge தேவை', gu: '— Chrome/Edge જરૂરી', ur: '— Chrome/Edge درکار', es: '— requiere Chrome/Edge', fr: '— nécessite Chrome/Edge', de: '— benötigt Chrome/Edge', pt: '— requer Chrome/Edge', zh: '— 需要 Chrome/Edge', ar: '— يتطلب Chrome/Edge', ru: '— нужен Chrome/Edge', ja: '— Chrome/Edge が必要', id: '— perlu Chrome/Edge' },
  ai_local_note: { en: '— private, ~300 MB on first use', hi: '— निजी, पहली बार ~300 MB', bn: '— ব্যক্তিগত, প্রথম ব্যবহারে ~300 MB', te: '— ప్రైవేట్, మొదటి వాడకంలో ~300 MB', mr: '— खाजगी, पहिल्या वापरात ~300 MB', ta: '— தனிப்பட்ட, முதல் பயன்பாட்டில் ~300 MB', gu: '— ખાનગી, પ્રથમ ઉપયોગે ~300 MB', ur: '— نجی، پہلی بار ~300 MB', es: '— privado, ~300 MB al usarlo por primera vez', fr: '— privé, ~300 Mo à la première utilisation', de: '— privat, ~300 MB beim ersten Mal', pt: '— privado, ~300 MB no primeiro uso', zh: '— 私密，首次使用约 300 MB', ar: '— خاص، ~300 ميغابايت عند أول استخدام', ru: '— приватно, ~300 МБ при первом использовании', ja: '— プライベート、初回約300MB', id: '— privat, ~300 MB saat pertama dipakai' },
  ai_resume: { en: 'Resume a chat…', hi: 'चैट फिर से शुरू करें…', bn: 'চ্যাট পুনরায় শুরু করুন…', te: 'చాట్ తిరిగి ప్రారంభించండి…', mr: 'गप्पा पुन्हा सुरू करा…', ta: 'அரட்டையைத் தொடரவும்…', gu: 'ચેટ ફરી શરૂ કરો…', ur: 'چیٹ دوبارہ شروع کریں…', es: 'Reanudar un chat…', fr: 'Reprendre une discussion…', de: 'Chat fortsetzen…', pt: 'Retomar uma conversa…', zh: '继续聊天…', ar: 'استئناف محادثة…', ru: 'Продолжить чат…', ja: 'チャットを再開…', id: 'Lanjutkan obrolan…' },
  ai_no_chats: { en: 'No saved chats', hi: 'कोई सहेजी गई चैट नहीं', bn: 'কোনো সংরক্ষিত চ্যাট নেই', te: 'సేవ్ చేసిన చాట్‌లు లేవు', mr: 'जतन केलेल्या गप्पा नाहीत', ta: 'சேமித்த அரட்டைகள் இல்லை', gu: 'કોઈ સાચવેલી ચેટ નથી', ur: 'کوئی محفوظ چیٹ نہیں', es: 'Sin chats guardados', fr: 'Aucune discussion enregistrée', de: 'Keine gespeicherten Chats', pt: 'Sem conversas salvas', zh: '没有已保存的聊天', ar: 'لا محادثات محفوظة', ru: 'Нет сохранённых чатов', ja: '保存済みチャットなし', id: 'Tidak ada obrolan tersimpan' },
  ai_new: { en: 'New', hi: 'नया', bn: 'নতুন', te: 'కొత్తది', mr: 'नवीन', ta: 'புதியது', gu: 'નવું', ur: 'نیا', es: 'Nuevo', fr: 'Nouveau', de: 'Neu', pt: 'Novo', zh: '新建', ar: 'جديد', ru: 'Новый', ja: '新規', id: 'Baru' },
  ai_save_md: { en: 'Save .md', hi: '.md सहेजें', bn: '.md সংরক্ষণ', te: '.md సేవ్', mr: '.md जतन करा', ta: '.md சேமி', gu: '.md સાચવો', ur: '.md محفوظ کریں', es: 'Guardar .md', fr: 'Enregistrer .md', de: '.md speichern', pt: 'Salvar .md', zh: '保存 .md', ar: 'حفظ .md', ru: 'Сохранить .md', ja: '.md を保存', id: 'Simpan .md' },
  ai_ask_ph: { en: 'Ask anything…', hi: 'कुछ भी पूछें…', bn: 'যা খুশি জিজ্ঞাসা করুন…', te: 'ఏదైనా అడగండి…', mr: 'काहीही विचारा…', ta: 'எதையும் கேள்…', gu: 'કંઈપણ પૂછો…', ur: 'کچھ بھی پوچھیں…', es: 'Pregunta lo que sea…', fr: 'Demandez n’importe quoi…', de: 'Frag irgendetwas…', pt: 'Pergunte qualquer coisa…', zh: '随便问…', ar: 'اسأل أي شيء…', ru: 'Спросите что угодно…', ja: '何でも質問…', id: 'Tanya apa saja…' },
  ai_need_key: { en: 'Add a key or enable on-device AI above to start', hi: 'शुरू करने के लिए ऊपर कुंजी जोड़ें या डिवाइस-AI सक्षम करें', bn: 'শুরু করতে উপরে কী যোগ করুন বা ডিভাইস-AI চালু করুন', te: 'ప్రారంభించడానికి పైన కీ జోడించండి లేదా పరికర-AIని ఆన్ చేయండి', mr: 'सुरू करण्यासाठी वर की जोडा किंवा डिव्हाइस-AI सुरू करा', ta: 'தொடங்க மேலே சாவியைச் சேர் அல்லது சாதன-AI இயக்கு', gu: 'શરૂ કરવા ઉપર કી ઉમેરો અથવા ઉપકરણ-AI ચાલુ કરો', ur: 'شروع کرنے کے لیے اوپر کلید شامل کریں یا ڈیوائس-AI فعال کریں', es: 'Añade una clave o activa la IA local arriba para empezar', fr: 'Ajoutez une clé ou activez l’IA locale ci-dessus pour commencer', de: 'Schlüssel hinzufügen oder Geräte-KI oben aktivieren, um zu starten', pt: 'Adicione uma chave ou ative a IA no dispositivo acima para começar', zh: '在上方添加密钥或启用设备端 AI 即可开始', ar: 'أضف مفتاحًا أو فعّل الذكاء على الجهاز أعلاه للبدء', ru: 'Добавьте ключ или включите ИИ на устройстве выше, чтобы начать', ja: '開始するには上でキーを追加するか端末内AIを有効化', id: 'Tambahkan kunci atau aktifkan AI di perangkat di atas untuk mulai' },
  pd_title: { en: 'Prompt to design', hi: 'प्रॉम्प्ट से डिज़ाइन', bn: 'প্রম্পট থেকে ডিজাইন', te: 'ప్రాంప్ట్ నుండి డిజైన్', mr: 'प्रॉम्प्ट ते डिझाइन', ta: 'ப்ராம்ப்ட் வடிவமைப்பு', gu: 'પ્રોમ્પ્ટથી ડિઝાઇન', ur: 'پرامپٹ سے ڈیزائن', es: 'Indicación a diseño', fr: 'Texte en design', de: 'Prompt zu Design', pt: 'Prompt para design', zh: '提示词生成设计', ar: 'موجّه إلى تصميم', ru: 'Запрос в дизайн', ja: 'プロンプトからデザイン', id: 'Prompt jadi desain' },
  pd_desc: { en: 'Describe what you want and get a finished, on-brand design in a click — generated on your device, nothing uploaded.', hi: 'जो चाहिए उसका वर्णन करें और एक क्लिक में तैयार, ब्रांड-अनुरूप डिज़ाइन पाएं — आपके डिवाइस पर बना, कुछ अपलोड नहीं होता।', bn: 'যা চান বর্ণনা দিন আর এক ক্লিকে তৈরি, ব্র্যান্ড-সঙ্গত ডিজাইন পান — আপনার ডিভাইসে তৈরি, কিছুই আপলোড হয় না।', te: 'మీకు కావాల్సింది వివరించి ఒక్క క్లిక్‌లో పూర్తి, బ్రాండ్‌కు తగిన డిజైన్ పొందండి — మీ పరికరంలో తయారు, ఏదీ అప్‌లోడ్ కాదు.', mr: 'तुम्हाला हवे ते वर्णन करा आणि एका क्लिकमध्ये तयार, ब्रँडनुसार डिझाइन मिळवा — तुमच्या डिव्हाइसवर तयार, काहीही अपलोड होत नाही.', ta: 'வேண்டியதை விவரித்து ஒரே கிளிக்கில் முடிக்கப்பட்ட, பிராண்டுக்கேற்ற வடிவமைப்பைப் பெறுங்கள் — உங்கள் சாதனத்தில் உருவாக்கப்படுகிறது, எதுவும் பதிவேற்றப்படாது.', gu: 'જે જોઈએ તે વર્ણવો અને એક ક્લિકમાં તૈયાર, બ્રાન્ડ-અનુરૂપ ડિઝાઇન મેળવો — તમારા ઉપકરણ પર બને, કંઈ અપલોડ થતું નથી.', ur: 'جو چاہیے بیان کریں اور ایک کلک میں مکمل، برانڈ کے مطابق ڈیزائن پائیں — آپ کے ڈیوائس پر بنتا ہے، کچھ اپ لوڈ نہیں ہوتا۔', es: 'Describe lo que quieres y obtén un diseño de marca terminado con un clic: generado en tu dispositivo, nada se sube.', fr: 'Décrivez ce que vous voulez et obtenez un design de marque fini en un clic — généré sur votre appareil, rien n’est envoyé.', de: 'Beschreiben Sie, was Sie möchten, und erhalten Sie per Klick ein fertiges, markengerechtes Design — auf dem Gerät erstellt, nichts wird hochgeladen.', pt: 'Descreva o que quer e obtenha um design de marca pronto num clique — gerado no seu dispositivo, nada é enviado.', zh: '描述你想要的，一键获得完整、符合品牌的设计——在设备端生成，不上传任何内容。', ar: 'صِف ما تريد واحصل على تصميم متوافق مع علامتك بنقرة واحدة — يُنشأ على جهازك ولا يُرفع شيء.', ru: 'Опишите, что нужно, и получите готовый фирменный дизайн одним кликом — создаётся на устройстве, ничего не загружается.', ja: '欲しいものを説明すれば、ワンクリックで完成したブランド準拠のデザインを生成 — 端末内で作成、何もアップロードしません。', id: 'Jelaskan yang Anda inginkan dan dapatkan desain sesuai merek dalam sekali klik — dibuat di perangkat Anda, tidak ada yang diunggah.' },
  pd_placeholder: { en: 'e.g. Summer sale — 30% off everything', hi: 'जैसे गर्मी की सेल — हर चीज़ पर 30% छूट', bn: 'যেমন গ্রীষ্মের সেল — সব কিছুতে ৩০% ছাড়', te: 'ఉదా. వేసవి సేల్ — అన్నిటిపై 30% తగ్గింపు', mr: 'उदा. उन्हाळी सेल — सर्वांवर 30% सूट', ta: 'எ.கா. கோடை விற்பனை — அனைத்திலும் 30% தள்ளுபடி', gu: 'દા.ત. ઉનાળુ સેલ — બધા પર 30% છૂટ', ur: 'مثلاً سمر سیل — ہر چیز پر 30% رعایت', es: 'p. ej. Rebajas de verano — 30% en todo', fr: 'p. ex. Soldes d’été — 30 % sur tout', de: 'z. B. Sommerschlussverkauf — 30 % auf alles', pt: 'ex.: Promoção de verão — 30% em tudo', zh: '例如：夏季促销——全场 7 折', ar: 'مثال: تخفيضات الصيف — خصم 30% على كل شيء', ru: 'напр. Летняя распродажа — скидка 30% на всё', ja: '例：サマーセール — 全品30%オフ', id: 'mis. Obral musim panas — diskon 30% semua' },
  pd_size: { en: 'Size', hi: 'आकार', bn: 'আকার', te: 'పరిమాణం', mr: 'आकार', ta: 'அளவு', gu: 'માપ', ur: 'سائز', es: 'Tamaño', fr: 'Taille', de: 'Größe', pt: 'Tamanho', zh: '尺寸', ar: 'الحجم', ru: 'Размер', ja: 'サイズ', id: 'Ukuran' },
  pd_create: { en: 'Create & edit →', hi: 'बनाएं और संपादित करें →', bn: 'তৈরি ও সম্পাদনা →', te: 'సృష్టించి సవరించు →', mr: 'तयार करा व संपादित करा →', ta: 'உருவாக்கி திருத்து →', gu: 'બનાવો અને સંપાદિત કરો →', ur: 'بنائیں اور ترمیم کریں →', es: 'Crear y editar →', fr: 'Créer et modifier →', de: 'Erstellen & bearbeiten →', pt: 'Criar e editar →', zh: '创建并编辑 →', ar: 'إنشاء وتحرير →', ru: 'Создать и редактировать →', ja: '作成して編集 →', id: 'Buat & edit →' },
  act_cancel: { en: 'Cancel', hi: 'रद्द करें', bn: 'বাতিল', te: 'రద్దు', mr: 'रद्द करा', ta: 'ரத்து', gu: 'રદ કરો', ur: 'منسوخ کریں', kn: 'ರದ್ದುಮಾಡಿ', ml: 'റദ്ദാക്കുക', pa: 'ਰੱਦ ਕਰੋ', or: 'ବାତିଲ୍ କରନ୍ତୁ', as: 'বাতিল কৰক', es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen', pt: 'Cancelar', zh: '取消', ar: 'إلغاء', ru: 'Отмена', ja: 'キャンセル', id: 'Batal' },
  wz_create_resume: { en: 'Create resume →', hi: 'रिज़्यूमे बनाएं →', bn: 'রেজ্যুমে তৈরি করুন →', te: 'రెజ్యూమ్ సృష్టించు →', mr: 'रेझ्युमे तयार करा →', ta: 'விவரக்குறிப்பை உருவாக்கு →', gu: 'રેઝ્યૂમે બનાવો →', ur: 'ریزیومے بنائیں →', es: 'Crear currículum →', fr: 'Créer le CV →', de: 'Lebenslauf erstellen →', pt: 'Criar currículo →', zh: '创建简历 →', ar: 'إنشاء السيرة الذاتية →', ru: 'Создать резюме →', ja: '履歴書を作成 →', id: 'Buat resume →' },
  wz_create_letter: { en: 'Create cover letter →', hi: 'कवर लेटर बनाएं →', bn: 'কভার লেটার তৈরি করুন →', te: 'కవర్ లెటర్ సృష్టించు →', mr: 'कव्हर लेटर तयार करा →', ta: 'அட்டைக் கடிதத்தை உருவாக்கு →', gu: 'કવર લેટર બનાવો →', ur: 'کور لیٹر بنائیں →', es: 'Crear carta →', fr: 'Créer la lettre →', de: 'Anschreiben erstellen →', pt: 'Criar carta →', zh: '创建求职信 →', ar: 'إنشاء خطاب التقديم →', ru: 'Создать письмо →', ja: 'カバーレターを作成 →', id: 'Buat surat lamaran →' },
  wz_prefill: { en: 'Pre-fill from text', hi: 'टेक्स्ट से पहले भरें', bn: 'টেক্সট থেকে পূর্বপূরণ', te: 'టెక్స్ట్ నుండి ముందుగా నింపు', mr: 'मजकुरातून आधीच भरा', ta: 'உரையிலிருந்து முன்நிரப்பு', gu: 'ટેક્સ્ટથી પૂર્વ-ભરો', ur: 'متن سے پہلے سے بھریں', es: 'Rellenar desde texto', fr: 'Pré-remplir depuis un texte', de: 'Aus Text vorausfüllen', pt: 'Preencher a partir de texto', zh: '从文本预填', ar: 'تعبئة مسبقة من نص', ru: 'Заполнить из текста', ja: 'テキストから自動入力', id: 'Isi otomatis dari teks' },
  wz_upload_photo: { en: 'Upload photo', hi: 'फ़ोटो अपलोड करें', bn: 'ছবি আপলোড করুন', te: 'ఫోటో అప్‌లోడ్', mr: 'फोटो अपलोड करा', ta: 'புகைப்படம் பதிவேற்று', gu: 'ફોટો અપલોડ કરો', ur: 'تصویر اپ لوڈ کریں', es: 'Subir foto', fr: 'Téléverser une photo', de: 'Foto hochladen', pt: 'Enviar foto', zh: '上传照片', ar: 'رفع صورة', ru: 'Загрузить фото', ja: '写真をアップロード', id: 'Unggah foto' },
  cap_start: { en: 'Start', hi: 'शुरू करें', bn: 'শুরু', te: 'ప్రారంభించు', mr: 'सुरू करा', ta: 'தொடங்கு', gu: 'શરૂ કરો', ur: 'شروع کریں', es: 'Iniciar', fr: 'Démarrer', de: 'Starten', pt: 'Iniciar', zh: '开始', ar: 'بدء', ru: 'Начать', ja: '開始', id: 'Mulai' },
  cap_stop: { en: 'Stop', hi: 'रोकें', bn: 'থামান', te: 'ఆపు', mr: 'थांबा', ta: 'நிறுத்து', gu: 'રોકો', ur: 'روکیں', es: 'Detener', fr: 'Arrêter', de: 'Stopp', pt: 'Parar', zh: '停止', ar: 'إيقاف', ru: 'Стоп', ja: '停止', id: 'Berhenti' },
  cap_retake: { en: 'Retake', hi: 'फिर से लें', bn: 'আবার নিন', te: 'మళ్లీ తీసుకో', mr: 'पुन्हा घ्या', ta: 'மீண்டும் எடு', gu: 'ફરી લો', ur: 'دوبارہ لیں', es: 'Repetir', fr: 'Reprendre', de: 'Wiederholen', pt: 'Refazer', zh: '重拍', ar: 'إعادة الالتقاط', ru: 'Переснять', ja: '撮り直し', id: 'Ambil ulang' },
  cap_camera: { en: 'Camera', hi: 'कैमरा', bn: 'ক্যামেরা', te: 'కెమెరా', mr: 'कॅमेरा', ta: 'கேமரா', gu: 'કૅમેરા', ur: 'کیمرا', es: 'Cámara', fr: 'Caméra', de: 'Kamera', pt: 'Câmera', zh: '摄像头', ar: 'الكاميرا', ru: 'Камера', ja: 'カメラ', id: 'Kamera' },
  cap_screen: { en: 'Screen', hi: 'स्क्रीन', bn: 'স্ক্রিন', te: 'స్క్రీన్', mr: 'स्क्रीन', ta: 'திரை', gu: 'સ્ક્રીન', ur: 'اسکرین', es: 'Pantalla', fr: 'Écran', de: 'Bildschirm', pt: 'Tela', zh: '屏幕', ar: 'الشاشة', ru: 'Экран', ja: '画面', id: 'Layar' },
  cap_mic: { en: 'Microphone', hi: 'माइक्रोफ़ोन', bn: 'মাইক্রোফোন', te: 'మైక్రోఫోన్', mr: 'मायक्रोफोन', ta: 'மைக்ரோஃபோன்', gu: 'માઇક્રોફોન', ur: 'مائیکروفون', es: 'Micrófono', fr: 'Microphone', de: 'Mikrofon', pt: 'Microfone', zh: '麦克风', ar: 'الميكروفون', ru: 'Микрофон', ja: 'マイク', id: 'Mikrofon' },
  prop_weight: { en: 'Weight', hi: 'वज़न', bn: 'ওজন', te: 'బరువు', mr: 'जाडी', ta: 'தடிமன்', gu: 'વજન', ur: 'وزن', es: 'Grosor', fr: 'Graisse', de: 'Stärke', pt: 'Peso', zh: '字重', ar: 'السماكة', ru: 'Насыщенность', ja: '太さ', id: 'Ketebalan' },
  prop_font: { en: 'Font', hi: 'फ़ॉन्ट', bn: 'ফন্ট', te: 'ఫాంట్', mr: 'फॉन्ट', ta: 'எழுத்துரு', gu: 'ફોન્ટ', ur: 'فونٹ', es: 'Fuente', fr: 'Police', de: 'Schriftart', pt: 'Fonte', zh: '字体', ar: 'الخط', ru: 'Шрифт', ja: 'フォント', id: 'Font' },
  prop_align: { en: 'Align', hi: 'संरेखण', bn: 'সারিবদ্ধ', te: 'అమరిక', mr: 'संरेखन', ta: 'சீரமை', gu: 'ગોઠવણી', ur: 'ترتیب', es: 'Alinear', fr: 'Aligner', de: 'Ausrichten', pt: 'Alinhar', zh: '对齐', ar: 'محاذاة', ru: 'Выравнивание', ja: '配置', id: 'Rata' },
  prop_rotation: { en: 'Rotation', hi: 'घुमाव', bn: 'ঘূর্ণন', te: 'భ్రమణం', mr: 'फिरवणे', ta: 'சுழற்சி', gu: 'પરિભ્રમણ', ur: 'گردش', es: 'Rotación', fr: 'Rotation', de: 'Drehung', pt: 'Rotação', zh: '旋转', ar: 'التدوير', ru: 'Поворот', ja: '回転', id: 'Rotasi' },
  prop_corner_radius: { en: 'Corner radius', hi: 'कोना त्रिज्या', bn: 'কোণের ব্যাসার্ধ', te: 'మూల వ్యాసార్ధం', mr: 'कोपरा त्रिज्या', ta: 'மூலை ஆரம்', gu: 'ખૂણા ત્રિજ્યા', ur: 'کونے کا رداس', es: 'Radio de esquina', fr: 'Rayon d’angle', de: 'Eckenradius', pt: 'Raio de canto', zh: '圆角半径', ar: 'نصف قطر الزاوية', ru: 'Радиус скругления', ja: '角の丸み', id: 'Radius sudut' },
  prop_thickness: { en: 'Thickness', hi: 'मोटाई', bn: 'পুরুত্ব', te: 'మందం', mr: 'जाडी', ta: 'தடிமன்', gu: 'જાડાઈ', ur: 'موٹائی', es: 'Grosor', fr: 'Épaisseur', de: 'Dicke', pt: 'Espessura', zh: '粗细', ar: 'السماكة', ru: 'Толщина', ja: '太さ', id: 'Ketebalan' },
  wt_regular: { en: 'Regular', hi: 'सामान्य', bn: 'নিয়মিত', te: 'సాధారణ', mr: 'सामान्य', ta: 'சாதாரண', gu: 'સામાન્ય', ur: 'عام', es: 'Normal', fr: 'Normal', de: 'Normal', pt: 'Regular', zh: '常规', ar: 'عادي', ru: 'Обычный', ja: '標準', id: 'Reguler' },
  wt_semibold: { en: 'Semibold', hi: 'सेमीबोल्ड', bn: 'সেমিবোল্ড', te: 'సెమీబోల్డ్', mr: 'सेमीबोल्ड', ta: 'அரைதடிமன்', gu: 'સેમિબોલ્ડ', ur: 'سیمی بولڈ', es: 'Seminegrita', fr: 'Demi-gras', de: 'Halbfett', pt: 'Seminegrito', zh: '半粗', ar: 'شبه عريض', ru: 'Полужирный', ja: 'セミボールド', id: 'Semitebal' },
  wt_bold: { en: 'Bold', hi: 'बोल्ड', bn: 'বোল্ড', te: 'బోల్డ్', mr: 'ठळक', ta: 'தடிமன்', gu: 'બોલ્ડ', ur: 'بولڈ', es: 'Negrita', fr: 'Gras', de: 'Fett', pt: 'Negrito', zh: '粗体', ar: 'عريض', ru: 'Жирный', ja: 'ボールド', id: 'Tebal' },
  wt_black: { en: 'Black', hi: 'ब्लैक', bn: 'ব্ল্যাক', te: 'బ్లాక్', mr: 'ब्लॅक', ta: 'கருமை', gu: 'બ્લેક', ur: 'بلیک', es: 'Negra', fr: 'Extra-gras', de: 'Schwarz', pt: 'Preto', zh: '特粗', ar: 'أسود', ru: 'Чёрный', ja: 'ブラック', id: 'Hitam' },
  al_left: { en: 'Left', hi: 'बाएं', bn: 'বাম', te: 'ఎడమ', mr: 'डावे', ta: 'இடது', gu: 'ડાબે', ur: 'بائیں', es: 'Izquierda', fr: 'Gauche', de: 'Links', pt: 'Esquerda', zh: '左', ar: 'يسار', ru: 'Слева', ja: '左', id: 'Kiri' },
  al_center: { en: 'Center', hi: 'मध्य', bn: 'কেন্দ্র', te: 'మధ్య', mr: 'मध्य', ta: 'மையம்', gu: 'મધ્ય', ur: 'درمیان', es: 'Centro', fr: 'Centre', de: 'Mitte', pt: 'Centro', zh: '居中', ar: 'وسط', ru: 'По центру', ja: '中央', id: 'Tengah' },
  al_right: { en: 'Right', hi: 'दाएं', bn: 'ডান', te: 'కుడి', mr: 'उजवे', ta: 'வலது', gu: 'જમણે', ur: 'دائیں', es: 'Derecha', fr: 'Droite', de: 'Rechts', pt: 'Direita', zh: '右', ar: 'يمين', ru: 'Справа', ja: '右', id: 'Kanan' },
  studio_select_hint: { en: 'Select an element to edit it, or add one from the left. Shift-click to select several; drag to move; arrow keys nudge; Ctrl/Cmd+D duplicates; Delete removes.', hi: 'संपादित करने के लिए कोई तत्व चुनें, या बाईं ओर से जोड़ें। कई चुनने के लिए Shift-क्लिक; खींचकर ले जाएं; तीर कुंजियाँ खिसकाती हैं; Ctrl/Cmd+D नकल; Delete हटाता है।', bn: 'সম্পাদনা করতে একটি উপাদান নির্বাচন করুন, বা বাঁ দিক থেকে যোগ করুন। একাধিক নির্বাচন করতে Shift-ক্লিক; টেনে সরান; তীর কী সরায়; Ctrl/Cmd+D নকল; Delete মোছে।', te: 'సవరించడానికి ఒక మూలకాన్ని ఎంచుకోండి, లేదా ఎడమ నుండి జోడించండి. చాలా ఎంచుకోవడానికి Shift-క్లిక్; లాగి తరలించండి; బాణం కీలు కదిలిస్తాయి; Ctrl/Cmd+D నకలు; Delete తొలగిస్తుంది.', mr: 'संपादित करण्यासाठी घटक निवडा, किंवा डावीकडून जोडा. अनेक निवडण्यासाठी Shift-क्लिक; ओढून हलवा; बाण की सरकवतात; Ctrl/Cmd+D नक्कल; Delete काढते.', ta: 'திருத்த ஒரு உறுப்பைத் தேர்ந்தெடுக்கவும், அல்லது இடதிலிருந்து சேர்க்கவும். பலவற்றைத் தேர்ந்தெடுக்க Shift-கிளிக்; இழுத்து நகர்த்து; அம்புக்குறி விசைகள் நகர்த்தும்; Ctrl/Cmd+D நகல்; Delete நீக்கும்.', gu: 'સંપાદિત કરવા તત્વ પસંદ કરો, અથવા ડાબેથી ઉમેરો. અનેક પસંદ કરવા Shift-ક્લિક; ખેંચીને ખસેડો; તીર કી ખસેડે છે; Ctrl/Cmd+D નકલ; Delete દૂર કરે છે.', ur: 'ترمیم کے لیے کوئی عنصر منتخب کریں، یا بائیں سے شامل کریں۔ کئی منتخب کرنے کے لیے Shift-کلک؛ گھسیٹ کر منتقل کریں؛ تیر کیز کھسکاتی ہیں؛ Ctrl/Cmd+D نقل؛ Delete ہٹاتا ہے۔', es: 'Selecciona un elemento para editarlo o añade uno desde la izquierda. Shift-clic para seleccionar varios; arrastra para mover; las flechas desplazan; Ctrl/Cmd+D duplica; Supr elimina.', fr: 'Sélectionnez un élément pour le modifier, ou ajoutez-en un à gauche. Maj-clic pour en sélectionner plusieurs ; glissez pour déplacer ; les flèches décalent ; Ctrl/Cmd+D duplique ; Suppr supprime.', de: 'Wählen Sie ein Element zum Bearbeiten oder fügen Sie links eines hinzu. Umschalt-Klick wählt mehrere; ziehen zum Verschieben; Pfeiltasten verschieben; Strg/Cmd+D dupliziert; Entf entfernt.', pt: 'Selecione um elemento para editá-lo ou adicione um pela esquerda. Shift-clique para selecionar vários; arraste para mover; as setas deslocam; Ctrl/Cmd+D duplica; Delete remove.', zh: '选择一个元素进行编辑，或从左侧添加。Shift+点击可多选；拖动移动；方向键微移；Ctrl/Cmd+D 复制；Delete 删除。', ar: 'حدّد عنصرًا لتحريره، أو أضف واحدًا من اليسار. Shift+نقر لتحديد عدة عناصر؛ اسحب للتحريك؛ مفاتيح الأسهم تحرّك؛ Ctrl/Cmd+D للنسخ؛ Delete للحذف.', ru: 'Выберите элемент для редактирования или добавьте слева. Shift-клик — выбрать несколько; перетаскивайте для перемещения; стрелки сдвигают; Ctrl/Cmd+D дублирует; Delete удаляет.', ja: '編集する要素を選択するか、左から追加します。Shift+クリックで複数選択、ドラッグで移動、矢印キーで微調整、Ctrl/Cmd+Dで複製、Deleteで削除。', id: 'Pilih elemen untuk mengeditnya, atau tambahkan dari kiri. Shift-klik untuk memilih beberapa; seret untuk memindahkan; tombol panah menggeser; Ctrl/Cmd+D menggandakan; Delete menghapus.' },
  studio_selected: { en: 'selected', hi: 'चयनित', bn: 'নির্বাচিত', te: 'ఎంచుకున్నవి', mr: 'निवडलेले', ta: 'தேர்ந்தெடுக்கப்பட்டது', gu: 'પસંદ કરેલ', ur: 'منتخب', es: 'seleccionados', fr: 'sélectionnés', de: 'ausgewählt', pt: 'selecionados', zh: '已选', ar: 'محدد', ru: 'выбрано', ja: '選択中', id: 'dipilih' },
  rh_contact: { en: 'CONTACT', hi: 'संपर्क', bn: 'যোগাযোগ', te: 'సంప్రదింపు', mr: 'संपर्क', ta: 'தொடர்பு', gu: 'સંપર્ક', ur: 'رابطہ', es: 'CONTACTO', fr: 'CONTACT', de: 'KONTAKT', pt: 'CONTATO', zh: '联系方式', ar: 'التواصل', ru: 'КОНТАКТЫ', ja: '連絡先', id: 'KONTAK' },
  rh_education: { en: 'EDUCATION', hi: 'शिक्षा', bn: 'শিক্ষা', te: 'విద్య', mr: 'शिक्षण', ta: 'கல்வி', gu: 'શિક્ષણ', ur: 'تعلیم', es: 'EDUCACIÓN', fr: 'FORMATION', de: 'AUSBILDUNG', pt: 'EDUCAÇÃO', zh: '教育背景', ar: 'التعليم', ru: 'ОБРАЗОВАНИЕ', ja: '学歴', id: 'PENDIDIKAN' },
  rh_experience: { en: 'EXPERIENCE', hi: 'अनुभव', bn: 'অভিজ্ঞতা', te: 'అనుభవం', mr: 'अनुभव', ta: 'அனுபவம்', gu: 'અનુભવ', ur: 'تجربہ', es: 'EXPERIENCIA', fr: 'EXPÉRIENCE', de: 'ERFAHRUNG', pt: 'EXPERIÊNCIA', zh: '工作经历', ar: 'الخبرة', ru: 'ОПЫТ', ja: '職歴', id: 'PENGALAMAN' },
  rh_photo: { en: 'PHOTO', hi: 'फ़ोटो', bn: 'ছবি', te: 'ఫోటో', mr: 'फोटो', ta: 'புகைப்படம்', gu: 'ફોટો', ur: 'تصویر', es: 'FOTO', fr: 'PHOTO', de: 'FOTO', pt: 'FOTO', zh: '照片', ar: 'صورة', ru: 'ФОТО', ja: '写真', id: 'FOTO' },
  rh_profile: { en: 'PROFILE', hi: 'प्रोफ़ाइल', bn: 'প্রোফাইল', te: 'ప్రొఫైల్', mr: 'प्रोफाइल', ta: 'சுயவிவரம்', gu: 'પ્રોફાઇલ', ur: 'پروفائل', es: 'PERFIL', fr: 'PROFIL', de: 'PROFIL', pt: 'PERFIL', zh: '简介', ar: 'الملف الشخصي', ru: 'ПРОФИЛЬ', ja: 'プロフィール', id: 'PROFIL' },
  rh_skills: { en: 'SKILLS', hi: 'कौशल', bn: 'দক্ষতা', te: 'నైపుణ్యాలు', mr: 'कौशल्ये', ta: 'திறன்கள்', gu: 'કૌશલ્ય', ur: 'مہارتیں', es: 'HABILIDADES', fr: 'COMPÉTENCES', de: 'FÄHIGKEITEN', pt: 'COMPETÊNCIAS', zh: '技能', ar: 'المهارات', ru: 'НАВЫКИ', ja: 'スキル', id: 'KEAHLIAN' },
  rh_summary: { en: 'SUMMARY', hi: 'सारांश', bn: 'সারসংক্ষেপ', te: 'సారాంశం', mr: 'सारांश', ta: 'சுருக்கம்', gu: 'સારાંશ', ur: 'خلاصہ', es: 'RESUMEN', fr: 'RÉSUMÉ', de: 'ZUSAMMENFASSUNG', pt: 'RESUMO', zh: '概述', ar: 'ملخص', ru: 'РЕЗЮМЕ', ja: '概要', id: 'RINGKASAN' },
  rf_prefill: { en: 'Pre-fill from your résumé', hi: 'अपने रिज़्यूमे से पहले भरें', bn: 'আপনার রেজ্যুমে থেকে পূর্বপূরণ', te: 'మీ రెజ్యూమ్ నుండి ముందుగా నింపు', mr: 'तुमच्या रेझ्युमेमधून आधीच भरा', ta: 'உங்கள் விவரக்குறிப்பிலிருந்து முன்நிரப்பு', gu: 'તમારા રેઝ્યૂમેથી પૂર્વ-ભરો', ur: 'اپنے ریزیومے سے پہلے سے بھریں', es: 'Rellenar desde tu currículum', fr: 'Pré-remplir depuis votre CV', de: 'Aus Ihrem Lebenslauf vorausfüllen', pt: 'Preencher a partir do seu currículo', zh: '从你的简历预填', ar: 'تعبئة مسبقة من سيرتك الذاتية', ru: 'Заполнить из вашего резюме', ja: '履歴書から自動入力', id: 'Isi otomatis dari resume Anda' },
  rf_paste_ph: { en: '…or paste your résumé text here', hi: '…या अपना रिज़्यूमे टेक्स्ट यहाँ पेस्ट करें', bn: '…অথবা আপনার রেজ্যুমে টেক্সট এখানে পেস্ট করুন', te: '…లేదా మీ రెజ్యూమ్ టెక్స్ట్‌ను ఇక్కడ అతికించండి', mr: '…किंवा तुमचा रेझ्युमे मजकूर येथे पेस्ट करा', ta: '…அல்லது உங்கள் விவரக்குறிப்பு உரையை இங்கே ஒட்டவும்', gu: '…અથવા તમારો રેઝ્યૂમે ટેક્સ્ટ અહીં પેસ્ટ કરો', ur: '…یا اپنا ریزیومے متن یہاں پیسٹ کریں', es: '…o pega aquí el texto de tu currículum', fr: '…ou collez ici le texte de votre CV', de: '…oder fügen Sie hier Ihren Lebenslauftext ein', pt: '…ou cole aqui o texto do seu currículo', zh: '…或将你的简历文本粘贴到此处', ar: '…أو الصق نص سيرتك الذاتية هنا', ru: '…или вставьте сюда текст вашего резюме', ja: '…または履歴書のテキストをここに貼り付け', id: '…atau tempel teks resume Anda di sini' },
  rf_full_name: { en: 'Full name', hi: 'पूरा नाम', bn: 'পুরো নাম', te: 'పూర్తి పేరు', mr: 'पूर्ण नाव', ta: 'முழுப் பெயர்', gu: 'પૂરું નામ', ur: 'پورا نام', es: 'Nombre completo', fr: 'Nom complet', de: 'Vollständiger Name', pt: 'Nome completo', zh: '全名', ar: 'الاسم الكامل', ru: 'Полное имя', ja: '氏名', id: 'Nama lengkap' },
  rf_title_role: { en: 'Title / role', hi: 'पद / भूमिका', bn: 'পদবি / ভূমিকা', te: 'హోదా / పాత్ర', mr: 'पद / भूमिका', ta: 'பதவி / பங்கு', gu: 'હોદ્દો / ભૂમિકા', ur: 'عہدہ / کردار', es: 'Cargo / función', fr: 'Titre / poste', de: 'Titel / Rolle', pt: 'Cargo / função', zh: '职位 / 角色', ar: 'المسمى / الدور', ru: 'Должность / роль', ja: '肩書き / 役割', id: 'Jabatan / peran' },
  rf_email: { en: 'Email', hi: 'ईमेल', bn: 'ইমেল', te: 'ఇమెయిల్', mr: 'ईमेल', ta: 'மின்னஞ்சல்', gu: 'ઇમેઇલ', ur: 'ای میل', es: 'Correo', fr: 'E-mail', de: 'E-Mail', pt: 'E-mail', zh: '邮箱', ar: 'البريد الإلكتروني', ru: 'Эл. почта', ja: 'メール', id: 'Email' },
  rf_phone: { en: 'Phone', hi: 'फ़ोन', bn: 'ফোন', te: 'ఫోన్', mr: 'फोन', ta: 'தொலைபேசி', gu: 'ફોન', ur: 'فون', es: 'Teléfono', fr: 'Téléphone', de: 'Telefon', pt: 'Telefone', zh: '电话', ar: 'الهاتف', ru: 'Телефон', ja: '電話', id: 'Telepon' },
  rf_location: { en: 'Location', hi: 'स्थान', bn: 'অবস্থান', te: 'స్థానం', mr: 'ठिकाण', ta: 'இடம்', gu: 'સ્થાન', ur: 'مقام', es: 'Ubicación', fr: 'Lieu', de: 'Ort', pt: 'Local', zh: '所在地', ar: 'الموقع', ru: 'Местоположение', ja: '所在地', id: 'Lokasi' },
  rf_link: { en: 'Link (portfolio / LinkedIn)', hi: 'लिंक (पोर्टफ़ोलियो / LinkedIn)', bn: 'লিঙ্ক (পোর্টফোলিও / LinkedIn)', te: 'లింక్ (పోర్ట్‌ఫోలియో / LinkedIn)', mr: 'दुवा (पोर्टफोलिओ / LinkedIn)', ta: 'இணைப்பு (போர்ட்ஃபோலியோ / LinkedIn)', gu: 'લિંક (પોર્ટફોલિયો / LinkedIn)', ur: 'لنک (پورٹ فولیو / LinkedIn)', es: 'Enlace (portafolio / LinkedIn)', fr: 'Lien (portfolio / LinkedIn)', de: 'Link (Portfolio / LinkedIn)', pt: 'Link (portfólio / LinkedIn)', zh: '链接（作品集 / LinkedIn）', ar: 'رابط (معرض الأعمال / LinkedIn)', ru: 'Ссылка (портфолио / LinkedIn)', ja: 'リンク（ポートフォリオ / LinkedIn）', id: 'Tautan (portofolio / LinkedIn)' },
  rf_jd: { en: 'Target job description (optional — tailors the summary & bullets)', hi: 'लक्षित नौकरी विवरण (वैकल्पिक — सारांश और बुलेट तैयार करता है)', bn: 'লক্ষ্য চাকরির বিবরণ (ঐচ্ছিক — সারসংক্ষেপ ও বুলেট মানানসই করে)', te: 'లక్ష్య ఉద్యోగ వివరణ (ఐచ్ఛికం — సారాంశం & బుల్లెట్‌లను సర్దుబాటు చేస్తుంది)', mr: 'लक्ष्य नोकरी वर्णन (पर्यायी — सारांश व बुलेट जुळवते)', ta: 'இலக்கு வேலை விவரம் (விருப்பம் — சுருக்கம் & புள்ளிகளை சரிசெய்யும்)', gu: 'લક્ષ્ય નોકરી વર્ણન (વૈકલ્પિક — સારાંશ અને બુલેટ ગોઠવે છે)', ur: 'ہدف ملازمت کی تفصیل (اختیاری — خلاصہ اور بلٹس تیار کرتا ہے)', es: 'Descripción del puesto (opcional — adapta el resumen y los puntos)', fr: 'Description du poste visé (facultatif — adapte le résumé et les puces)', de: 'Ziel-Stellenbeschreibung (optional — passt Zusammenfassung & Punkte an)', pt: 'Descrição da vaga (opcional — adapta o resumo e os tópicos)', zh: '目标职位描述（可选——据此定制摘要和要点）', ar: 'وصف الوظيفة المستهدفة (اختياري — يخصّص الملخص والنقاط)', ru: 'Описание целевой вакансии (необязательно — подстраивает резюме и пункты)', ja: '対象の求人内容（任意 — 概要と箇条書きを最適化）', id: 'Deskripsi pekerjaan target (opsional — menyesuaikan ringkasan & poin)' },
  rf_summary: { en: 'Summary', hi: 'सारांश', bn: 'সারসংক্ষেপ', te: 'సారాంశం', mr: 'सारांश', ta: 'சுருக்கம்', gu: 'સારાંશ', ur: 'خلاصہ', es: 'Resumen', fr: 'Résumé', de: 'Zusammenfassung', pt: 'Resumo', zh: '概述', ar: 'ملخص', ru: 'Резюме', ja: '概要', id: 'Ringkasan' },
  rf_skills: { en: 'Skills (one per line or comma-separated)', hi: 'कौशल (प्रति पंक्ति एक या अल्पविराम से)', bn: 'দক্ষতা (প্রতি লাইনে একটি বা কমা দিয়ে)', te: 'నైపుణ్యాలు (లైనుకొకటి లేదా కామాతో)', mr: 'कौशल्ये (प्रति ओळ एक किंवा स्वल्पविरामाने)', ta: 'திறன்கள் (வரிக்கு ஒன்று அல்லது கமாவால்)', gu: 'કૌશલ્ય (લાઇન દીઠ એક અથવા અલ્પવિરામથી)', ur: 'مہارتیں (فی سطر ایک یا کاما سے جدا)', es: 'Habilidades (una por línea o separadas por comas)', fr: 'Compétences (une par ligne ou séparées par des virgules)', de: 'Fähigkeiten (eine pro Zeile oder kommagetrennt)', pt: 'Competências (uma por linha ou separadas por vírgula)', zh: '技能（每行一个或用逗号分隔）', ar: 'المهارات (واحدة لكل سطر أو مفصولة بفواصل)', ru: 'Навыки (по одному в строке или через запятую)', ja: 'スキル（1行に1つ、またはカンマ区切り）', id: 'Keahlian (satu per baris atau dipisah koma)' },
  rf_experience: { en: 'Experience', hi: 'अनुभव', bn: 'অভিজ্ঞতা', te: 'అనుభవం', mr: 'अनुभव', ta: 'அனுபவம்', gu: 'અનુભવ', ur: 'تجربہ', es: 'Experiencia', fr: 'Expérience', de: 'Erfahrung', pt: 'Experiência', zh: '工作经历', ar: 'الخبرة', ru: 'Опыт', ja: '職歴', id: 'Pengalaman' },
  rf_add_role: { en: 'Add role', hi: 'भूमिका जोड़ें', bn: 'ভূমিকা যোগ করুন', te: 'పాత్ర జోడించు', mr: 'भूमिका जोडा', ta: 'பங்கைச் சேர்', gu: 'ભૂમિકા ઉમેરો', ur: 'کردار شامل کریں', es: 'Añadir cargo', fr: 'Ajouter un poste', de: 'Rolle hinzufügen', pt: 'Adicionar cargo', zh: '添加职位', ar: 'إضافة دور', ru: 'Добавить должность', ja: '職歴を追加', id: 'Tambah peran' },
  rf_role: { en: 'Role', hi: 'भूमिका', bn: 'ভূমিকা', te: 'పాత్ర', mr: 'भूमिका', ta: 'பங்கு', gu: 'ભૂમિકા', ur: 'کردار', es: 'Cargo', fr: 'Poste', de: 'Rolle', pt: 'Cargo', zh: '职位', ar: 'الدور', ru: 'Должность', ja: '役職', id: 'Peran' },
  rf_company: { en: 'Company', hi: 'कंपनी', bn: 'কোম্পানি', te: 'కంపెనీ', mr: 'कंपनी', ta: 'நிறுவனம்', gu: 'કંપની', ur: 'کمپنی', es: 'Empresa', fr: 'Entreprise', de: 'Unternehmen', pt: 'Empresa', zh: '公司', ar: 'الشركة', ru: 'Компания', ja: '会社', id: 'Perusahaan' },
  rf_dates: { en: 'Dates', hi: 'तिथियाँ', bn: 'তারিখ', te: 'తేదీలు', mr: 'तारखा', ta: 'தேதிகள்', gu: 'તારીખો', ur: 'تاریخیں', es: 'Fechas', fr: 'Dates', de: 'Zeitraum', pt: 'Datas', zh: '日期', ar: 'التواريخ', ru: 'Даты', ja: '期間', id: 'Tanggal' },
  rf_highlights: { en: 'Highlights (one bullet per line)', hi: 'मुख्य बातें (प्रति पंक्ति एक बुलेट)', bn: 'মূল বিষয় (প্রতি লাইনে একটি বুলেট)', te: 'ముఖ్యాంశాలు (లైనుకొక బుల్లెట్)', mr: 'ठळक मुद्दे (प्रति ओळ एक बुलेट)', ta: 'முக்கியக் குறிப்புகள் (வரிக்கு ஒரு புள்ளி)', gu: 'મુખ્ય બાબતો (લાઇન દીઠ એક બુલેટ)', ur: 'نمایاں نکات (فی سطر ایک بلٹ)', es: 'Logros (un punto por línea)', fr: 'Points forts (une puce par ligne)', de: 'Höhepunkte (ein Punkt pro Zeile)', pt: 'Destaques (um tópico por linha)', zh: '亮点（每行一个要点）', ar: 'أبرز النقاط (نقطة واحدة لكل سطر)', ru: 'Ключевые моменты (по одному пункту в строке)', ja: 'ハイライト（1行に1項目）', id: 'Sorotan (satu poin per baris)' },
  rf_education: { en: 'Education', hi: 'शिक्षा', bn: 'শিক্ষা', te: 'విద్య', mr: 'शिक्षण', ta: 'கல்வி', gu: 'શિક્ષણ', ur: 'تعلیم', es: 'Educación', fr: 'Formation', de: 'Ausbildung', pt: 'Educação', zh: '教育', ar: 'التعليم', ru: 'Образование', ja: '学歴', id: 'Pendidikan' },
  rf_add_education: { en: 'Add education', hi: 'शिक्षा जोड़ें', bn: 'শিক্ষা যোগ করুন', te: 'విద్య జోడించు', mr: 'शिक्षण जोडा', ta: 'கல்வியைச் சேர்', gu: 'શિક્ષણ ઉમેરો', ur: 'تعلیم شامل کریں', es: 'Añadir educación', fr: 'Ajouter une formation', de: 'Ausbildung hinzufügen', pt: 'Adicionar educação', zh: '添加教育', ar: 'إضافة تعليم', ru: 'Добавить образование', ja: '学歴を追加', id: 'Tambah pendidikan' },
  rf_degree: { en: 'Degree', hi: 'डिग्री', bn: 'ডিগ্রি', te: 'డిగ్రీ', mr: 'पदवी', ta: 'பட்டம்', gu: 'ડિગ્રી', ur: 'ڈگری', es: 'Título', fr: 'Diplôme', de: 'Abschluss', pt: 'Grau', zh: '学位', ar: 'الدرجة', ru: 'Степень', ja: '学位', id: 'Gelar' },
  rf_school: { en: 'School', hi: 'विद्यालय', bn: 'বিদ্যালয়', te: 'పాఠశాల', mr: 'शाळा', ta: 'பள்ளி', gu: 'શાળા', ur: 'اسکول', es: 'Centro', fr: 'École', de: 'Schule', pt: 'Instituição', zh: '学校', ar: 'المدرسة', ru: 'Учебное заведение', ja: '学校', id: 'Sekolah' },
  rf_style_accent: { en: 'Style & accent', hi: 'शैली और रंग', bn: 'স্টাইল ও রঙ', te: 'శైలి & యాక్సెంట్', mr: 'शैली व रंग', ta: 'பாணி & நிறம்', gu: 'શૈલી અને રંગ', ur: 'انداز اور رنگ', es: 'Estilo y color', fr: 'Style et accent', de: 'Stil & Akzent', pt: 'Estilo e cor', zh: '样式与配色', ar: 'النمط واللون', ru: 'Стиль и акцент', ja: 'スタイルとアクセント', id: 'Gaya & aksen' },
  rf_accent: { en: 'Accent', hi: 'रंग', bn: 'রঙ', te: 'యాక్సెంట్', mr: 'रंग', ta: 'நிறம்', gu: 'રંગ', ur: 'رنگ', es: 'Color', fr: 'Accent', de: 'Akzent', pt: 'Cor', zh: '强调色', ar: 'لون مميز', ru: 'Акцент', ja: 'アクセント', id: 'Aksen' },
  rf_ai_write: { en: 'Write with AI', hi: 'AI से लिखें', bn: 'AI দিয়ে লিখুন', te: 'AIతో రాయండి', mr: 'AI ने लिहा', ta: 'AI மூலம் எழுது', gu: 'AI થી લખો', ur: 'AI سے لکھیں', es: 'Escribir con IA', fr: 'Rédiger avec l’IA', de: 'Mit KI schreiben', pt: 'Escrever com IA', zh: '用 AI 撰写', ar: 'اكتب بالذكاء الاصطناعي', ru: 'Написать с ИИ', ja: 'AIで書く', id: 'Tulis dengan AI' },
  rf_ai_tailor: { en: 'Tailor to job', hi: 'नौकरी के अनुसार बनाएं', bn: 'চাকরির জন্য সাজান', te: 'ఉద్యోగానికి తగ్గట్టు', mr: 'नोकरीनुसार जुळवा', ta: 'வேலைக்கேற்ப அமை', gu: 'નોકરી અનુસાર ગોઠવો', ur: 'ملازمت کے مطابق بنائیں', es: 'Adaptar al puesto', fr: 'Adapter au poste', de: 'An Stelle anpassen', pt: 'Adaptar à vaga', zh: '按职位定制', ar: 'تخصيص للوظيفة', ru: 'Под вакансию', ja: '求人に合わせる', id: 'Sesuaikan dengan pekerjaan' },
  cl_your_details: { en: 'Your details', hi: 'आपका विवरण', bn: 'আপনার বিবরণ', te: 'మీ వివరాలు', mr: 'तुमचे तपशील', ta: 'உங்கள் விவரங்கள்', gu: 'તમારી વિગતો', ur: 'آپ کی تفصیلات', es: 'Tus datos', fr: 'Vos coordonnées', de: 'Ihre Angaben', pt: 'Seus dados', zh: '你的信息', ar: 'بياناتك', ru: 'Ваши данные', ja: 'あなたの情報', id: 'Detail Anda' },
  cl_date: { en: 'Date', hi: 'तिथि', bn: 'তারিখ', te: 'తేదీ', mr: 'तारीख', ta: 'தேதி', gu: 'તારીખ', ur: 'تاریخ', es: 'Fecha', fr: 'Date', de: 'Datum', pt: 'Data', zh: '日期', ar: 'التاريخ', ru: 'Дата', ja: '日付', id: 'Tanggal' },
  cl_addressed_to: { en: 'Addressed to', hi: 'प्रति', bn: 'প্রাপক', te: 'కు సంబోధించబడింది', mr: 'प्रति', ta: 'பெறுநர்', gu: 'પ્રતિ', ur: 'بنام', es: 'Dirigida a', fr: 'Destinataire', de: 'Adressiert an', pt: 'Destinatário', zh: '收件人', ar: 'موجّه إلى', ru: 'Кому адресовано', ja: '宛先', id: 'Ditujukan kepada' },
  cl_recipient_name: { en: 'Recipient name', hi: 'प्राप्तकर्ता का नाम', bn: 'প্রাপকের নাম', te: 'గ్రహీత పేరు', mr: 'प्राप्तकर्त्याचे नाव', ta: 'பெறுநர் பெயர்', gu: 'પ્રાપ્તકર્તાનું નામ', ur: 'وصول کنندہ کا نام', es: 'Nombre del destinatario', fr: 'Nom du destinataire', de: 'Name des Empfängers', pt: 'Nome do destinatário', zh: '收件人姓名', ar: 'اسم المستلم', ru: 'Имя получателя', ja: '宛名', id: 'Nama penerima' },
  cl_recipient_title: { en: 'Recipient title', hi: 'प्राप्तकर्ता का पद', bn: 'প্রাপকের পদবি', te: 'గ్రహీత హోదా', mr: 'प्राप्तकर्त्याचे पद', ta: 'பெறுநர் பதவி', gu: 'પ્રાપ્તકર્તાનો હોદ્દો', ur: 'وصول کنندہ کا عہدہ', es: 'Cargo del destinatario', fr: 'Titre du destinataire', de: 'Titel des Empfängers', pt: 'Cargo do destinatário', zh: '收件人职位', ar: 'منصب المستلم', ru: 'Должность получателя', ja: '宛先の肩書き', id: 'Jabatan penerima' },
  cl_greeting: { en: 'Greeting', hi: 'अभिवादन', bn: 'সম্ভাষণ', te: 'అభివాదన', mr: 'अभिवादन', ta: 'வாழ்த்து', gu: 'અભિવાદન', ur: 'سلام', es: 'Saludo', fr: 'Salutation', de: 'Anrede', pt: 'Saudação', zh: '称呼', ar: 'التحية', ru: 'Приветствие', ja: '挨拶', id: 'Salam' },
  cl_jd: { en: 'Paste job description (optional — tailors the letter)', hi: 'नौकरी विवरण पेस्ट करें (वैकल्पिक — पत्र तैयार करता है)', bn: 'চাকরির বিবরণ পেস্ট করুন (ঐচ্ছিক — চিঠি সাজায়)', te: 'ఉద్యోగ వివరణ అతికించండి (ఐచ్ఛికం — లేఖను సర్దుబాటు చేస్తుంది)', mr: 'नोकरी वर्णन पेस्ट करा (पर्यायी — पत्र जुळवते)', ta: 'வேலை விவரத்தை ஒட்டவும் (விருப்பம் — கடிதத்தை சரிசெய்யும்)', gu: 'નોકરી વર્ણન પેસ્ટ કરો (વૈકલ્પિક — પત્ર ગોઠવે)', ur: 'ملازمت کی تفصیل پیسٹ کریں (اختیاری — خط تیار کرتا ہے)', es: 'Pega la descripción del puesto (opcional — adapta la carta)', fr: 'Collez la description du poste (facultatif — adapte la lettre)', de: 'Stellenbeschreibung einfügen (optional — passt den Brief an)', pt: 'Cole a descrição da vaga (opcional — adapta a carta)', zh: '粘贴职位描述（可选——据此定制信件）', ar: 'الصق وصف الوظيفة (اختياري — يخصّص الخطاب)', ru: 'Вставьте описание вакансии (необязательно — подстраивает письмо)', ja: '求人内容を貼り付け（任意 — 手紙を最適化）', id: 'Tempel deskripsi pekerjaan (opsional — menyesuaikan surat)' },
  cl_body: { en: 'Body (separate paragraphs with a blank line)', hi: 'मुख्य भाग (पैराग्राफ खाली पंक्ति से अलग करें)', bn: 'মূল অংশ (অনুচ্ছেদ ফাঁকা লাইনে আলাদা করুন)', te: 'ముఖ్య భాగం (పేరాలను ఖాళీ లైన్‌తో వేరు చేయండి)', mr: 'मुख्य भाग (परिच्छेद रिक्त ओळीने वेगळे करा)', ta: 'உள்ளடக்கம் (பத்திகளை வெற்று வரியால் பிரிக்கவும்)', gu: 'મુખ્ય ભાગ (ફકરા ખાલી લાઇનથી અલગ કરો)', ur: 'متن (پیراگراف خالی سطر سے جدا کریں)', es: 'Cuerpo (separa los párrafos con una línea en blanco)', fr: 'Corps (séparez les paragraphes par une ligne vide)', de: 'Text (Absätze mit Leerzeile trennen)', pt: 'Corpo (separe os parágrafos com uma linha em branco)', zh: '正文（用空行分隔段落）', ar: 'النص (افصل الفقرات بسطر فارغ)', ru: 'Текст (разделяйте абзацы пустой строкой)', ja: '本文（段落は空行で区切る）', id: 'Isi (pisahkan paragraf dengan baris kosong)' },
  cl_closing: { en: 'Closing', hi: 'समापन', bn: 'সমাপ্তি', te: 'ముగింపు', mr: 'समारोप', ta: 'நிறைவு', gu: 'સમાપન', ur: 'اختتام', es: 'Despedida', fr: 'Formule de politesse', de: 'Schlussformel', pt: 'Fecho', zh: '结尾', ar: 'الخاتمة', ru: 'Завершение', ja: '結び', id: 'Penutup' },
  cl_ai_write: { en: 'Write my letter with AI', hi: 'AI से मेरा पत्र लिखें', bn: 'AI দিয়ে আমার চিঠি লিখুন', te: 'AIతో నా లేఖ రాయండి', mr: 'AI ने माझे पत्र लिहा', ta: 'AI மூலம் என் கடிதத்தை எழுது', gu: 'AI થી મારો પત્ર લખો', ur: 'AI سے میرا خط لکھیں', es: 'Escribir mi carta con IA', fr: 'Rédiger ma lettre avec l’IA', de: 'Meinen Brief mit KI schreiben', pt: 'Escrever minha carta com IA', zh: '用 AI 撰写我的信', ar: 'اكتب خطابي بالذكاء الاصطناعي', ru: 'Написать письмо с ИИ', ja: 'AIで手紙を書く', id: 'Tulis surat saya dengan AI' },
  srch_search: { en: 'Search', hi: 'खोजें', bn: 'খুঁজুন', te: 'శోధించు', mr: 'शोधा', ta: 'தேடு', gu: 'શોધો', ur: 'تلاش کریں', es: 'Buscar', fr: 'Rechercher', de: 'Suchen', pt: 'Buscar', zh: '搜索', ar: 'بحث', ru: 'Поиск', ja: '検索', id: 'Cari' },
  srch_searching: { en: 'Searching…', hi: 'खोज रहे हैं…', bn: 'খোঁজা হচ্ছে…', te: 'శోధిస్తోంది…', mr: 'शोधत आहे…', ta: 'தேடுகிறது…', gu: 'શોધી રહ્યું છે…', ur: 'تلاش جاری…', es: 'Buscando…', fr: 'Recherche…', de: 'Suche…', pt: 'Buscando…', zh: '搜索中…', ar: 'جارٍ البحث…', ru: 'Поиск…', ja: '検索中…', id: 'Mencari…' },
  srch_no_match: { en: 'No matching tools or documents found.', hi: 'कोई मेल खाता टूल या दस्तावेज़ नहीं मिला।', bn: 'মিলে যাওয়া টুল বা নথি পাওয়া যায়নি।', te: 'సరిపోలే సాధనాలు లేదా పత్రాలు కనుగొనబడలేదు.', mr: 'जुळणारे साधन किंवा दस्तऐवज सापडले नाहीत.', ta: 'பொருந்தும் கருவிகள் அல்லது ஆவணங்கள் இல்லை.', gu: 'મેળ ખાતા સાધનો કે દસ્તાવેજો મળ્યા નથી.', ur: 'کوئی مماثل ٹول یا دستاویز نہیں ملی۔', es: 'No se encontraron herramientas ni documentos.', fr: 'Aucun outil ni document correspondant.', de: 'Keine passenden Werkzeuge oder Dokumente gefunden.', pt: 'Nenhuma ferramenta ou documento correspondente.', zh: '未找到匹配的工具或文档。', ar: 'لم يُعثر على أدوات أو مستندات مطابقة.', ru: 'Подходящие инструменты или документы не найдены.', ja: '一致するツールや文書が見つかりません。', id: 'Tidak ada alat atau dokumen yang cocok.' },
  srch_tools: { en: 'Tools', hi: 'टूल', bn: 'টুল', te: 'సాధనాలు', mr: 'साधने', ta: 'கருவிகள்', gu: 'સાધનો', ur: 'ٹولز', es: 'Herramientas', fr: 'Outils', de: 'Werkzeuge', pt: 'Ferramentas', zh: '工具', ar: 'الأدوات', ru: 'Инструменты', ja: 'ツール', id: 'Alat' },
  pf_desc: { en: 'Click on the page to drop a fillable field, name it, then save a PDF with real form fields anyone can fill — all in your browser.', hi: 'भरने योग्य फ़ील्ड रखने के लिए पृष्ठ पर क्लिक करें, उसे नाम दें, फिर असली फ़ॉर्म फ़ील्ड वाला PDF सहेजें जिसे कोई भी भर सके — सब आपके ब्राउज़र में।', bn: 'পূরণযোগ্য ফিল্ড বসাতে পৃষ্ঠায় ক্লিক করুন, নাম দিন, তারপর আসল ফর্ম ফিল্ড সহ PDF সংরক্ষণ করুন যা যে কেউ পূরণ করতে পারে — সব আপনার ব্রাউজারে।', te: 'పూరించదగిన ఫీల్డ్ ఉంచడానికి పేజీపై క్లిక్ చేసి, పేరు పెట్టి, ఎవరైనా పూరించగల నిజమైన ఫారం ఫీల్డ్‌లతో PDFని సేవ్ చేయండి — అంతా మీ బ్రౌజర్‌లో.', mr: 'भरण्यायोग्य फील्ड ठेवण्यासाठी पृष्ठावर क्लिक करा, नाव द्या, मग कोणीही भरू शकेल असे खरे फॉर्म फील्ड असलेले PDF जतन करा — सर्व तुमच्या ब्राउझरमध्ये.', ta: 'நிரப்பக்கூடிய புலத்தை வைக்க பக்கத்தில் கிளிக் செய்து, பெயரிட்டு, யாரும் நிரப்பக்கூடிய உண்மையான படிவப் புலங்களுடன் PDF-ஐ சேமிக்கவும் — அனைத்தும் உங்கள் உலாவியில்.', gu: 'ભરી શકાય તેવું ફીલ્ડ મૂકવા પૃષ્ઠ પર ક્લિક કરો, નામ આપો, પછી કોઈપણ ભરી શકે તેવા સાચા ફોર્મ ફીલ્ડ સાથે PDF સાચવો — બધું તમારા બ્રાઉઝરમાં.', ur: 'قابلِ پُر فیلڈ رکھنے کے لیے صفحے پر کلک کریں، نام دیں، پھر حقیقی فارم فیلڈز والا PDF محفوظ کریں جسے کوئی بھی بھر سکے — سب آپ کے براؤزر میں۔', es: 'Haz clic en la página para colocar un campo rellenable, nómbralo y guarda un PDF con campos de formulario reales que cualquiera puede rellenar — todo en tu navegador.', fr: 'Cliquez sur la page pour déposer un champ à remplir, nommez-le, puis enregistrez un PDF avec de vrais champs de formulaire que tout le monde peut remplir — le tout dans votre navigateur.', de: 'Klicken Sie auf die Seite, um ein ausfüllbares Feld zu setzen, benennen Sie es und speichern Sie ein PDF mit echten Formularfeldern, die jeder ausfüllen kann — alles im Browser.', pt: 'Clique na página para soltar um campo preenchível, nomeie-o e salve um PDF com campos de formulário reais que qualquer um pode preencher — tudo no seu navegador.', zh: '点击页面放置可填写字段，命名后保存为带有真实表单字段、人人可填的 PDF——全部在浏览器中完成。', ar: 'انقر على الصفحة لإسقاط حقل قابل للتعبئة وسمِّه، ثم احفظ ملف PDF بحقول نموذج حقيقية يمكن لأي شخص تعبئتها — كل ذلك في متصفحك.', ru: 'Нажмите на страницу, чтобы добавить заполняемое поле, назовите его и сохраните PDF с настоящими полями формы, которые может заполнить любой — всё в браузере.', ja: 'ページをクリックして入力欄を配置し、名前を付けて、誰でも記入できる本物のフォーム欄付き PDF を保存 — すべてブラウザー内で。', id: 'Klik halaman untuk menaruh bidang isian, beri nama, lalu simpan PDF dengan bidang formulir asli yang bisa diisi siapa saja — semua di browser Anda.' },
  pf_field_type: { en: 'Field type', hi: 'फ़ील्ड प्रकार', bn: 'ফিল্ডের ধরন', te: 'ఫీల్డ్ రకం', mr: 'फील्ड प्रकार', ta: 'புலம் வகை', gu: 'ફીલ્ડ પ્રકાર', ur: 'فیلڈ کی قسم', es: 'Tipo de campo', fr: 'Type de champ', de: 'Feldtyp', pt: 'Tipo de campo', zh: '字段类型', ar: 'نوع الحقل', ru: 'Тип поля', ja: '欄の種類', id: 'Jenis bidang' },
  pf_text_field: { en: 'Text field', hi: 'टेक्स्ट फ़ील्ड', bn: 'টেক্সট ফিল্ড', te: 'టెక్స్ట్ ఫీల్డ్', mr: 'मजकूर फील्ड', ta: 'உரை புலம்', gu: 'ટેક્સ્ટ ફીલ્ડ', ur: 'ٹیکسٹ فیلڈ', es: 'Campo de texto', fr: 'Champ de texte', de: 'Textfeld', pt: 'Campo de texto', zh: '文本字段', ar: 'حقل نصي', ru: 'Текстовое поле', ja: 'テキスト欄', id: 'Bidang teks' },
  pf_checkbox: { en: 'Checkbox', hi: 'चेकबॉक्स', bn: 'চেকবক্স', te: 'చెక్‌బాక్స్', mr: 'चेकबॉक्स', ta: 'தேர்வுப்பெட்டி', gu: 'ચેકબોક્સ', ur: 'چیک باکس', es: 'Casilla', fr: 'Case à cocher', de: 'Kontrollkästchen', pt: 'Caixa de seleção', zh: '复选框', ar: 'مربع اختيار', ru: 'Флажок', ja: 'チェックボックス', id: 'Kotak centang' },
  pf_fields_placed: { en: 'fields placed', hi: 'फ़ील्ड रखे गए', bn: 'ফিল্ড স্থাপিত', te: 'ఫీల్డ్‌లు ఉంచబడ్డాయి', mr: 'फील्ड ठेवली', ta: 'புலங்கள் வைக்கப்பட்டன', gu: 'ફીલ્ડ મૂક્યાં', ur: 'فیلڈز رکھے گئے', es: 'campos colocados', fr: 'champs placés', de: 'Felder platziert', pt: 'campos colocados', zh: '个字段已放置', ar: 'حقول موضوعة', ru: 'полей размещено', ja: '個の欄を配置', id: 'bidang ditempatkan' },
  pf_field_name: { en: 'Field name', hi: 'फ़ील्ड का नाम', bn: 'ফিল্ডের নাম', te: 'ఫీల్డ్ పేరు', mr: 'फील्डचे नाव', ta: 'புலப் பெயர்', gu: 'ફીલ્ડનું નામ', ur: 'فیلڈ کا نام', es: 'Nombre del campo', fr: 'Nom du champ', de: 'Feldname', pt: 'Nome do campo', zh: '字段名称', ar: 'اسم الحقل', ru: 'Имя поля', ja: '欄の名前', id: 'Nama bidang' },
  pf_rendering: { en: 'Rendering PDF…', hi: 'PDF रेंडर हो रहा है…', bn: 'PDF রেন্ডার হচ্ছে…', te: 'PDF రెండర్ అవుతోంది…', mr: 'PDF रेंडर होत आहे…', ta: 'PDF காட்டப்படுகிறது…', gu: 'PDF રેન્ડર થઈ રહ્યું છે…', ur: 'PDF رینڈر ہو رہا ہے…', es: 'Renderizando PDF…', fr: 'Rendu du PDF…', de: 'PDF wird gerendert…', pt: 'Renderizando PDF…', zh: '正在渲染 PDF…', ar: 'جارٍ عرض PDF…', ru: 'Отрисовка PDF…', ja: 'PDF を描画中…', id: 'Merender PDF…' },
  pf_save: { en: 'Save fillable PDF', hi: 'भरने योग्य PDF सहेजें', bn: 'পূরণযোগ্য PDF সংরক্ষণ', te: 'పూరించదగిన PDF సేవ్', mr: 'भरण्यायोग्य PDF जतन करा', ta: 'நிரப்பக்கூடிய PDF சேமி', gu: 'ભરી શકાય તેવું PDF સાચવો', ur: 'قابلِ پُر PDF محفوظ کریں', es: 'Guardar PDF rellenable', fr: 'Enregistrer le PDF à remplir', de: 'Ausfüllbares PDF speichern', pt: 'Salvar PDF preenchível', zh: '保存可填写 PDF', ar: 'حفظ PDF قابل للتعبئة', ru: 'Сохранить заполняемый PDF', ja: '入力可能な PDF を保存', id: 'Simpan PDF isian' },
  pf_open_editor: { en: 'Open in PDF editor', hi: 'PDF एडिटर में खोलें', bn: 'PDF এডিটরে খুলুন', te: 'PDF ఎడిటర్‌లో తెరవండి', mr: 'PDF एडिटरमध्ये उघडा', ta: 'PDF எடிட்டரில் திற', gu: 'PDF એડિટરમાં ખોલો', ur: 'PDF ایڈیٹر میں کھولیں', es: 'Abrir en el editor PDF', fr: 'Ouvrir dans l’éditeur PDF', de: 'Im PDF-Editor öffnen', pt: 'Abrir no editor de PDF', zh: '在 PDF 编辑器中打开', ar: 'فتح في محرر PDF', ru: 'Открыть в PDF-редакторе', ja: 'PDF エディターで開く', id: 'Buka di editor PDF' },
  srch_docs: { en: 'Documents', hi: 'दस्तावेज़', bn: 'নথি', te: 'పత్రాలు', mr: 'दस्तऐवज', ta: 'ஆவணங்கள்', gu: 'દસ્તાવેજો', ur: 'دستاویزات', es: 'Documentos', fr: 'Documents', de: 'Dokumente', pt: 'Documentos', zh: '文档', ar: 'المستندات', ru: 'Документы', ja: 'ドキュメント', id: 'Dokumen' },
  cl_ai_tailor: { en: 'Tailor to this job', hi: 'इस नौकरी के अनुसार बनाएं', bn: 'এই চাকরির জন্য সাজান', te: 'ఈ ఉద్యోగానికి తగ్గట్టు', mr: 'या नोकरीनुसार जुळवा', ta: 'இந்த வேலைக்கேற்ப அமை', gu: 'આ નોકરી અનુસાર ગોઠવો', ur: 'اس ملازمت کے مطابق بنائیں', es: 'Adaptar a este puesto', fr: 'Adapter à ce poste', de: 'An diese Stelle anpassen', pt: 'Adaptar a esta vaga', zh: '按此职位定制', ar: 'تخصيص لهذه الوظيفة', ru: 'Под эту вакансию', ja: 'この求人に合わせる', id: 'Sesuaikan dengan pekerjaan ini' },
  join_requesting: {
    en: 'Requesting access…', hi: 'पहुँच का अनुरोध…', bn: 'অ্যাক্সেসের অনুরোধ…', te: 'యాక్సెస్ అభ్యర్థిస్తోంది…', mr: 'प्रवेशाची विनंती…', ta: 'அணுகல் கோரப்படுகிறது…', gu: 'ઍક્સેસની વિનંતી…', ur: 'رسائی کی درخواست…',
    es: 'Solicitando acceso…', fr: 'Demande d’accès…', de: 'Zugriff wird angefordert…', pt: 'Solicitando acesso…', zh: '正在请求访问…', ar: 'جارٍ طلب الوصول…', ru: 'Запрос доступа…', ja: 'アクセスを要求中…', id: 'Meminta akses…',
  },
  join_requesting_sub: {
    en: 'Waiting for the host to grant your invite — the room key is delivered only to you.',
    hi: 'होस्ट द्वारा आपका निमंत्रण स्वीकृत होने की प्रतीक्षा — रूम कुंजी केवल आपको दी जाती है।',
    bn: 'হোস্ট আপনার আমন্ত্রণ অনুমোদনের অপেক্ষায় — রুম কী শুধু আপনাকেই দেওয়া হয়।',
    te: 'మీ ఆహ్వానాన్ని హోస్ట్ మంజూరు చేయడానికి వేచి ఉంది — రూమ్ కీ మీకు మాత్రమే అందించబడుతుంది.',
    mr: 'होस्ट तुमचे आमंत्रण मंजूर करण्याची प्रतीक्षा — रूम की फक्त तुम्हालाच दिली जाते.',
    ta: 'உங்கள் அழைப்பை ஹோஸ்ட் அனுமதிக்கக் காத்திருக்கிறது — அறை விசை உங்களுக்கு மட்டுமே வழங்கப்படுகிறது.',
    gu: 'હોસ્ટ તમારું આમંત્રણ મંજૂર કરે તેની રાહ — રૂમ કી ફક્ત તમને જ અપાય છે.',
    ur: 'میزبان کی جانب سے آپ کی دعوت منظور ہونے کا انتظار — روم کلید صرف آپ کو دی جاتی ہے۔',
    es: 'Esperando a que el anfitrión apruebe tu invitación — la clave de la sala se entrega solo a ti.',
    fr: 'En attente que l’hôte valide votre invitation — la clé de la salle n’est remise qu’à vous.',
    de: 'Warten auf die Freigabe Ihrer Einladung durch den Host — der Raumschlüssel geht nur an Sie.',
    pt: 'Aguardando o anfitrião aprovar seu convite — a chave da sala é entregue apenas a você.',
    zh: '等待主持人批准您的邀请——房间密钥仅交付给您。',
    ar: 'في انتظار موافقة المضيف على دعوتك — يُسلَّم مفتاح الغرفة إليك وحدك.',
    ru: 'Ожидание подтверждения приглашения хостом — ключ комнаты передаётся только вам.',
    ja: 'ホストが招待を承認するのを待っています — ルームキーはあなただけに届きます。',
    id: 'Menunggu host menyetujui undangan Anda — kunci ruang hanya dikirim kepada Anda.',
  },
  join_denied: {
    en: 'Access denied', hi: 'पहुँच अस्वीकृत', bn: 'অ্যাক্সেস অস্বীকৃত', te: 'యాక్సెస్ తిరస్కరించబడింది', mr: 'प्रवेश नाकारला', ta: 'அணுகல் மறுக்கப்பட்டது', gu: 'ઍક્સેસ નકારી', ur: 'رسائی مسترد',
    es: 'Acceso denegado', fr: 'Accès refusé', de: 'Zugriff verweigert', pt: 'Acesso negado', zh: '访问被拒绝', ar: 'تم رفض الوصول', ru: 'Доступ запрещён', ja: 'アクセスが拒否されました', id: 'Akses ditolak',
  },
  join_denied_forwarded: {
    en: 'This invite was already used on another device. Ask the host for your own link.',
    hi: 'यह निमंत्रण पहले से किसी अन्य डिवाइस पर उपयोग हो चुका है। होस्ट से अपना लिंक माँगें।',
    bn: 'এই আমন্ত্রণটি ইতিমধ্যে অন্য ডিভাইসে ব্যবহৃত হয়েছে। হোস্টের কাছে নিজের লিঙ্ক চান।',
    te: 'ఈ ఆహ్వానం ఇప్పటికే మరో పరికరంలో ఉపయోగించబడింది. మీ స్వంత లింక్ కోసం హోస్ట్‌ను అడగండి.',
    mr: 'हे आमंत्रण आधीच दुसऱ्या डिव्हाइसवर वापरले गेले आहे. होस्टकडून स्वतःचा दुवा मागा.',
    ta: 'இந்த அழைப்பு ஏற்கனவே மற்றொரு சாதனத்தில் பயன்படுத்தப்பட்டது. உங்கள் சொந்த இணைப்பை ஹோஸ்டிடம் கேளுங்கள்.',
    gu: 'આ આમંત્રણ પહેલેથી બીજા ઉપકરણ પર વપરાયું છે. હોસ્ટ પાસેથી તમારી પોતાની લિંક માગો.',
    ur: 'یہ دعوت پہلے ہی کسی اور ڈیوائس پر استعمال ہو چکی ہے۔ میزبان سے اپنا لنک طلب کریں۔',
    es: 'Esta invitación ya se usó en otro dispositivo. Pide al anfitrión tu propio enlace.',
    fr: 'Cette invitation a déjà été utilisée sur un autre appareil. Demandez votre propre lien à l’hôte.',
    de: 'Diese Einladung wurde bereits auf einem anderen Gerät verwendet. Bitten Sie den Host um Ihren eigenen Link.',
    pt: 'Este convite já foi usado em outro dispositivo. Peça ao anfitrião o seu próprio link.',
    zh: '此邀请已在另一台设备上使用。请向主持人索取您自己的链接。',
    ar: 'استُخدمت هذه الدعوة بالفعل على جهاز آخر. اطلب من المضيف رابطك الخاص.',
    ru: 'Это приглашение уже использовано на другом устройстве. Попросите у хоста свою ссылку.',
    ja: 'この招待はすでに別のデバイスで使用されています。ホストにあなた専用のリンクを依頼してください。',
    id: 'Undangan ini sudah digunakan di perangkat lain. Minta tautan Anda sendiri kepada host.',
  },
  join_denied_timeout: {
    en: 'No response from the host. They may be offline — try again when they’re in the room.',
    hi: 'होस्ट से कोई उत्तर नहीं। वे ऑफ़लाइन हो सकते हैं — जब वे रूम में हों तब पुनः प्रयास करें।',
    bn: 'হোস্টের কাছ থেকে কোনো সাড়া নেই। তারা অফলাইন থাকতে পারে — তারা রুমে থাকলে আবার চেষ্টা করুন।',
    te: 'హోస్ట్ నుండి స్పందన లేదు. వారు ఆఫ్‌లైన్‌లో ఉండవచ్చు — వారు రూమ్‌లో ఉన్నప్పుడు మళ్లీ ప్రయత్నించండి.',
    mr: 'होस्टकडून प्रतिसाद नाही. ते ऑफलाइन असू शकतात — ते रूममध्ये असताना पुन्हा प्रयत्न करा.',
    ta: 'ஹோஸ்டிடமிருந்து பதில் இல்லை. அவர்கள் ஆஃப்லைனில் இருக்கலாம் — அவர்கள் அறையில் இருக்கும்போது மீண்டும் முயற்சிக்கவும்.',
    gu: 'હોસ્ટ તરફથી કોઈ જવાબ નથી. તેઓ ઓફલાઇન હોઈ શકે — તેઓ રૂમમાં હોય ત્યારે ફરી પ્રયાસ કરો.',
    ur: 'میزبان کی طرف سے کوئی جواب نہیں۔ وہ آف لائن ہو سکتے ہیں — جب وہ روم میں ہوں تو دوبارہ کوشش کریں۔',
    es: 'El anfitrión no responde. Puede estar desconectado: inténtalo de nuevo cuando esté en la sala.',
    fr: 'Aucune réponse de l’hôte. Il est peut-être hors ligne — réessayez lorsqu’il est dans la salle.',
    de: 'Keine Antwort vom Host. Möglicherweise offline — versuchen Sie es erneut, wenn er im Raum ist.',
    pt: 'Sem resposta do anfitrião. Ele pode estar offline — tente novamente quando estiver na sala.',
    zh: '主持人没有响应。对方可能已离线——请在其进入房间时重试。',
    ar: 'لا يوجد رد من المضيف. قد يكون غير متصل — حاول مرة أخرى عندما يكون في الغرفة.',
    ru: 'Хост не отвечает. Возможно, он не в сети — попробуйте снова, когда он будет в комнате.',
    ja: 'ホストから応答がありません。オフラインの可能性があります — ルームにいるときに再試行してください。',
    id: 'Tidak ada respons dari host. Mereka mungkin offline — coba lagi saat mereka di ruang.',
  },
  join_denied_invalid: {
    en: 'This invite link isn’t valid or has been revoked. Ask the host for a new one.',
    hi: 'यह निमंत्रण लिंक मान्य नहीं है या रद्द कर दिया गया है। होस्ट से नया माँगें।',
    bn: 'এই আমন্ত্রণ লিঙ্কটি বৈধ নয় বা প্রত্যাহার করা হয়েছে। হোস্টের কাছে নতুন চান।',
    te: 'ఈ ఆహ్వాన లింక్ చెల్లుబాటు కాదు లేదా రద్దు చేయబడింది. హోస్ట్‌ను కొత్తది అడగండి.',
    mr: 'हा आमंत्रण दुवा वैध नाही किंवा रद्द केला आहे. होस्टकडून नवीन मागा.',
    ta: 'இந்த அழைப்பு இணைப்பு செல்லுபடியாகாது அல்லது ரத்து செய்யப்பட்டது. ஹோஸ்டிடம் புதியதைக் கேளுங்கள்.',
    gu: 'આ આમંત્રણ લિંક માન્ય નથી અથવા રદ કરાઈ છે. હોસ્ટ પાસેથી નવી માગો.',
    ur: 'یہ دعوتی لنک درست نہیں یا منسوخ کر دیا گیا ہے۔ میزبان سے نیا طلب کریں۔',
    es: 'Este enlace de invitación no es válido o ha sido revocado. Pide uno nuevo al anfitrión.',
    fr: 'Ce lien d’invitation n’est pas valide ou a été révoqué. Demandez-en un nouveau à l’hôte.',
    de: 'Dieser Einladungslink ist ungültig oder wurde widerrufen. Bitten Sie den Host um einen neuen.',
    pt: 'Este link de convite não é válido ou foi revogado. Peça um novo ao anfitrião.',
    zh: '此邀请链接无效或已被撤销。请向主持人索取新链接。',
    ar: 'رابط الدعوة هذا غير صالح أو تم إلغاؤه. اطلب رابطًا جديدًا من المضيف.',
    ru: 'Эта ссылка-приглашение недействительна или отозвана. Попросите у хоста новую.',
    ja: 'この招待リンクは無効か取り消されています。ホストに新しいものを依頼してください。',
    id: 'Tautan undangan ini tidak valid atau telah dicabut. Minta yang baru kepada host.',
  },
  join_go_library: {
    en: 'Go to library', hi: 'लाइब्रेरी पर जाएँ', bn: 'লাইব্রেরিতে যান', te: 'లైబ్రరీకి వెళ్లండి', mr: 'लायब्ररीवर जा', ta: 'நூலகத்திற்குச் செல்', gu: 'લાઇબ્રેરી પર જાઓ', ur: 'لائبریری پر جائیں',
    es: 'Ir a la biblioteca', fr: 'Aller à la bibliothèque', de: 'Zur Bibliothek', pt: 'Ir para a biblioteca', zh: '前往库', ar: 'الذهاب إلى المكتبة', ru: 'В библиотеку', ja: 'ライブラリへ', id: 'Ke pustaka',
  },
};

const STORE = 'pyntra:lang';
const isLang = (v: string): v is Lang => LANGUAGES.some((l) => l.code === v);

/** Best language: saved choice → browser language → English. */
export function detectLang(): Lang {
  try { const saved = localStorage.getItem(STORE); if (saved && isLang(saved)) return saved; } catch { /* */ }
  const nav = (typeof navigator !== 'undefined' ? (navigator.language || '') : '').slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : 'en';
}

// Global reactive store for the current language.
let current: Lang = (() => { try { return detectLang(); } catch { return 'en'; } })();
const listeners = new Set<() => void>();

/** The current UI language (non-reactive read). */
export function getLang(): Lang { return current; }

/** Subscribe to language changes (returns an unsubscribe). */
export function subscribeLang(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }

export function setLang(lang: Lang): void {
  current = lang;
  try { localStorage.setItem(STORE, lang); } catch { /* */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }
  listeners.forEach((l) => l());
}

/** React hook: the current language, re-rendering the component when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang);
}

/** Translate a key into a language, falling back to English. */
export function t(key: StrKey, lang: Lang): string {
  return STRINGS[key][lang] ?? STRINGS[key].en ?? key;
}

/**
 * Translate a dynamic home-grid / template key (see homeStrings.ts), falling back
 * to the given English text (e.g. a template's own name) when no entry exists.
 * Separate from t() so the large, id-keyed template set doesn't bloat StrKey.
 */
export function tx(key: string, lang: Lang, fallback: string): string {
  const e = HOME_STRINGS[key];
  return (e && (e[lang] ?? e.en)) ?? fallback;
}
