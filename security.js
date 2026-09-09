/**
 * Life Saver Security & Anti-Tampering Module
 * Complete Client-Side Anti-Inspect, Anti-Screenshot, Anti-Copy, & Anti-Debugging Suite
 * Hardened Control Key & DevTools Suppression
 */
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

(function () {
    'use strict';

    // 1. Inject CSS Rules (No Selection, No Dragging, No Printing)
    const style = document.createElement('style');
    style.textContent = `
        html, body {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-user-drag: none !important;
        }

        input, textarea {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
        }

        @media print {
            html, body {
                display: none !important;
            }
        }
    `;
    if (document.head) {
        document.head.appendChild(style);
    } else {
        document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    }

    // 2. Security Banner Notice
    const showConsoleBanner = () => {
        try {
            console.clear();
            console.log(
                '%cSTOP!',
                'color: #ef4444; font-size: 50px; font-weight: bold; -webkit-text-stroke: 1px black;'
            );
            console.log(
                '%cAll Developer Tools, Ctrl+U, Ctrl+Shift+I, and inspection shortcuts are disabled on this site.',
                'font-size: 14px; color: #dc2626; font-weight: bold; font-family: sans-serif;'
            );
        } catch (e) {}
    };

    showConsoleBanner();

    // 3. Helper to Kill Events Instantly
    const killEvent = function (e) {
        if (!e) return false;
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        e.returnValue = false;
        return false;
    };

    // 4. Block Right Click (Context Menu) Unconditionally Everywhere
    window.oncontextmenu = killEvent;
    document.oncontextmenu = killEvent;
    document.addEventListener('contextmenu', killEvent, { capture: true, passive: false });

    // 5. Block Copy, Cut, SelectStart (Allow in input and textarea for usability)
    const isInputTarget = function (e) {
        const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
    };

    document.addEventListener('copy', function (e) {
        if (!isInputTarget(e)) return killEvent(e);
    }, { capture: true, passive: false });
    document.addEventListener('cut', function (e) {
        if (!isInputTarget(e)) return killEvent(e);
    }, { capture: true, passive: false });
    document.addEventListener('selectstart', function (e) {
        if (!isInputTarget(e)) {
            return killEvent(e);
        }
    }, { capture: true, passive: false });
    document.addEventListener('dragstart', killEvent, { capture: true, passive: false });

    // 6. DevTools & Inspection Shortcut Suppression System
    const masterKeyHandler = function (e) {
        if (!e) return false;

        const key = (e.key ? e.key.toLowerCase() : '');
        const code = (e.code ? e.code.toLowerCase() : '');
        const keyCode = e.keyCode || e.which;
        const isCtrl = e.ctrlKey || e.metaKey;
        const isAlt = e.altKey;
        const isShift = e.shiftKey;

        // A. Direct check for 'u' (Ctrl+U / View Source)
        if ((key === 'u' || code === 'keyu' || keyCode === 85) && isCtrl) {
            return killEvent(e);
        }

        // B. Direct check for 'i', 'j', 'c' with Ctrl+Shift (DevTools Inspector/Console)
        if (isCtrl && isShift && (key === 'i' || key === 'j' || key === 'c' || code === 'keyi' || code === 'keyj' || code === 'keyc')) {
            return killEvent(e);
        }

        // C. F12 key check
        if (key === 'f12' || code === 'f12' || keyCode === 123) {
            return killEvent(e);
        }

        // D. PrintScreen key check
        if (key === 'printscreen' || code === 'printscreen' || keyCode === 44 || key === 'prtsc' || key === 'prtscr') {
            document.body.style.filter = 'blur(30px)';
            setTimeout(() => {
                document.body.style.filter = 'none';
            }, 1000);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('');
            }
            return killEvent(e);
        }
    };

    // Attach master key handler across window, document, body using direct handlers and capture listeners
    window.onkeydown = masterKeyHandler;
    window.onkeyup = masterKeyHandler;
    window.onkeypress = masterKeyHandler;

    document.onkeydown = masterKeyHandler;
    document.onkeyup = masterKeyHandler;
    document.onkeypress = masterKeyHandler;

    window.addEventListener('keydown', masterKeyHandler, { capture: true, passive: false });
    window.addEventListener('keyup', masterKeyHandler, { capture: true, passive: false });
    window.addEventListener('keypress', masterKeyHandler, { capture: true, passive: false });

    document.addEventListener('keydown', masterKeyHandler, { capture: true, passive: false });
    document.addEventListener('keyup', masterKeyHandler, { capture: true, passive: false });
    document.addEventListener('keypress', masterKeyHandler, { capture: true, passive: false });

    // 7. Security Status
    let isDevToolsOpen = false;

    // 8. Window Dimension Change Detection
    function detectDevToolsByDimension() {
        const threshold = 160;
        const widthDiff = window.outerWidth - window.innerWidth > threshold;
        const heightDiff = window.outerHeight - window.innerHeight > threshold;

        if (widthDiff || heightDiff) {
            if (!isDevToolsOpen) {
                isDevToolsOpen = true;
                showConsoleBanner();
            }
        }
    }

    window.addEventListener('resize', detectDevToolsByDimension);
})();

/**
 * Life Saver Global Navigation, Scrolling & Modal Architecture
 */
window.lockBodyScroll = function () {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
};

window.unlockBodyScroll = function () {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
};

// Global Page Top Enforcement
function enforceInitialPageTop() {
    const hash = window.location.hash;
    if (hash && hash.length > 1 && !hash.toLowerCase().includes('modal')) {
        try {
            const target = document.querySelector(hash);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        } catch (e) {}
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforceInitialPageTop);
} else {
    enforceInitialPageTop();
}
window.addEventListener('load', enforceInitialPageTop);
window.addEventListener('pageshow', function (e) {
    window.unlockBodyScroll();
    if (e.persisted || !window.location.hash || window.location.hash === '#') {
        enforceInitialPageTop();
    }
});

// Clean link navigation guard: always unlock scroll when navigating away
document.addEventListener('click', function (e) {
    const anchor = e.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript:')) return;

    // Same-page hash anchor
    if (href.startsWith('#')) {
        const targetId = href.substring(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            e.preventDefault();
            window.unlockBodyScroll();
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.pushState(null, '', href);
        }
        return;
    }

    // External or other HTML page link
    window.unlockBodyScroll();
    const drawer = document.getElementById('mobileNavDrawer');
    if (drawer && drawer.classList.contains('open')) {
        drawer.classList.remove('open');
    }
    const menu = document.getElementById('navToolsDropdown');
    if (menu && menu.classList.contains('show')) {
        menu.classList.remove('show');
    }
}, { capture: true });

// Close modals / drawers on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
        window.unlockBodyScroll();
        document.querySelectorAll('.fixed:not(.hidden)').forEach(modal => {
            if (modal.id && modal.id !== 'mainNavbar') {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
        const drawer = document.getElementById('mobileNavDrawer');
        if (drawer) drawer.classList.remove('open');
        const menu = document.getElementById('navToolsDropdown');
        if (menu) menu.classList.remove('show');
    }
});

function toggleNavToolsMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('navToolsDropdown');
    if (menu) {
        menu.classList.toggle('show');
        if (menu.classList.contains('show') && window.lucide) {
            lucide.createIcons();
        }
    }
}

function toggleMobileNav(e) {
    if (e) e.stopPropagation();
    const drawer = document.getElementById('mobileNavDrawer');
    if (drawer) {
        drawer.classList.toggle('open');
        if (drawer.classList.contains('open')) {
            window.lockBodyScroll();
            if (window.lucide) lucide.createIcons();
        } else {
            window.unlockBodyScroll();
        }
    }
}

// Close dropdown menu when clicking anywhere outside
document.addEventListener('click', function (e) {
    const menu = document.getElementById('navToolsDropdown');
    const btn = document.getElementById('navThreeDotsBtn') || document.getElementById('navToolsBtn');
    if (menu && menu.classList.contains('show')) {
        if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
            menu.classList.remove('show');
        }
    }
});

/**
 * LIFE SAVER FULL-SITE MULTI-LANGUAGE TRANSLATION DICTIONARY & ENGINE
 * Supported Languages: EN (English), TE (Telugu), HI (Hindi)
 */
const i18nDict = {
    EN: {
        // Navigation & Buttons
        nav_home: "Home",
        nav_hospitals: "Hospitals",
        nav_blood: "Blood",
        nav_ambulance: "Ambulance",
        nav_organ: "Organ",
        nav_emergency: "Emergency Guide",
        btn_sos: "SOS 108",
        btn_ai: "AI Triage Assistant",
        btn_install: "Install App",
        btn_contact: "Contact Us",
        btn_account: "Account",
        btn_admin: "Admin Login",

        // Hero Section
        hero_badge: "24/7 Rapid Emergency Healthcare Network",
        hero_title: "Every Second Counts. <br class=\"hidden md:inline\"/><span class=\"text-shimmer\">Connect & Save Lives Nearby.</span>",
        hero_sub: "Locate blood donors instantly, request emergency ambulances, search accredited hospitals, or pledge organ donations in real-time.",
        
        // Homepage Services Cards
        card_hospitals_title: "Find Hospitals",
        card_hospitals_desc: "Locate nearby hospitals with ICU beds, emergency rooms, and GPS navigation.",
        card_blood_title: "Donate & Find Blood",
        card_blood_desc: "Search verified donors by blood group & city, or register as a blood donor.",
        card_ambulance_title: "Emergency Ambulance",
        card_ambulance_desc: "Request immediate emergency transport with live GPS tracking & traffic corridors.",
        card_organ_title: "Organ Donation",
        card_organ_desc: "Pledge to donate organs, view registered organ donors, or request matching organs.",
        card_emergency_title: "First Aid Guide",
        card_emergency_desc: "Interactive CPR, choking, burn care, and cardiac arrest protocols.",

        // Emergency Page
        emg_hero_title: "Emergency First Aid & Triage Guide",
        emg_hero_sub: "Immediate step-by-step action protocols for life-threatening medical situations.",
        emg_knowledge_title: "📚 Health Knowledge Library",
        emg_knowledge_sub: "Public 24/7 Emergency Helplines, 30-Second Bystander Survival Protocols, and Verified Health Education Resources for Registered Life Saver Members.",
        emg_protocols_title: "🚨 30-Second Bystander Survival Protocols",
        emg_protocols_sub: "Immediate public rescue steps to keep a patient alive until the 108 ambulance arrives",
        emg_cpr_btn: "🫁 Adult CPR Protocol",
        emg_choking_btn: "🗣️ Choking (Heimlich)",
        emg_bleeding_btn: "🩸 Bleeding Control",
        emg_burns_btn: "🐍 Snakebite / Burns",
        emg_gps_title: "📍 Live GPS Location Broadcast",
        emg_gps_sub: "Detect your current position to send to first responders or emergency contacts",
        emg_gps_refresh: "Refresh Geolocation",
        emg_gps_share: "Share Coordinates on WhatsApp",
        emg_gps_copy: "Copy Location Link",
        emg_helplines_title: "Immediate Helpline Directory (Public 24/7 Access)",
        emg_helpline_ambulance: "National Ambulance",
        emg_helpline_police: "Police Control Room",
        emg_helpline_fire: "Fire Brigade",
        
        emg_cpr_title: "🫁 Adult CPR Protocol (Chest Compressions)",
        emg_cpr_step1: "Place heel of one hand in center of victim's chest. Interlock other hand on top.",
        emg_cpr_step2: "Push hard and fast: 100 to 120 compressions per minute (to rhythm of 'Stayin Alive').",
        emg_cpr_step3: "Allow full chest recoil after each compression. Do not stop until ambulance arrives.",

        emg_choking_title: "🗣️ Choking Rescue (Heimlich Maneuver)",
        emg_choking_step1: "Stand behind choking person, wrap arms around their waist.",
        emg_choking_step2: "Make a fist with one hand, place thumb side above navel, perform quick upward thrusts.",
        emg_choking_step3: "Repeat thrusts until lodged object is dislodged or person coughs.",

        emg_bleeding_title: "🩸 Bleeding Control & Pressure Protocol",
        emg_bleeding_step1: "Apply firm, continuous direct pressure to wound using clean cloth or sterile gauze.",
        emg_bleeding_step2: "Elevate injured limb above heart level if no bone fracture is suspected.",
        emg_bleeding_step3: "Do not remove soaked cloths; place additional cloths directly on top and maintain pressure.",

        emg_burns_title: "🐍 Snakebite & Severe Burn Protocol",
        emg_burns_step1: "Snakebite: Keep patient calm and limb immobilized below heart level. Do NOT cut wound or suck venom!",
        emg_burns_step2: "Burns: Cool burn under cool running tap water for 10-15 minutes. Do NOT apply ice or toothpaste! Cover with clean cloth."
    },

    TE: {
        // Navigation & Buttons
        nav_home: "హోమ్",
        nav_hospitals: "ఆసుపత్రులు",
        nav_blood: "రక్తదానం",
        nav_ambulance: "అంబులెన్స్",
        nav_organ: "అవయవ దానం",
        nav_emergency: "ఎమర్జెన్సీ గైడ్",
        btn_sos: "SOS 108",
        btn_ai: "AI ఎమర్జెన్సీ గైడ్",
        btn_install: "యాప్ ఇన్‌స్టాల్",
        btn_contact: "సంప్రదించండి",
        btn_account: "ఖాతా",
        btn_admin: "అడ్మిన్ లాగిన్",

        // Hero Section
        hero_badge: "24/7 అత్యవసర ఆరోగ్య రక్షణ నెట్‌వర్క్",
        hero_title: "ప్రతి క్షణం అమూల్యం. <br class=\"hidden md:inline\"/><span class=\"text-shimmer\">కనెక్ట్ అవ్వండి, ప్రాణాలను కాపాడండి.</span>",
        hero_sub: "రక్త దాతలను తక్షణమే కనుగొనండి, అత్యవసర అంబులెన్స్‌లను అభ్యర్థించండి, గుర్తింపు పొందిన ఆసుపత్రులను శోధించండి, లేదా అవయవ దానానికి ప్రతిజ్ఞ చేయండి.",
        
        // Homepage Services Cards
        card_hospitals_title: "ఆసుపత్రులను కనుగొనండి",
        card_hospitals_desc: "ICU బెడ్లు, ఎమర్జెన్సీ రూమ్‌లు మరియు GPS నావిగేషన్‌తో సమీప ఆసుపత్రులను కనుగొనండి.",
        card_blood_title: "రక్తం దానం చేయండి & కనుగొనండి",
        card_blood_desc: "రక్త గ్రూప్ & నగరం ద్వారా ధృవీకరించబడిన దాతలను శోధించండి లేదా రక్త దాతగా నమోదు చేయండి.",
        card_ambulance_title: "అత్యవసర అంబులెన్స్",
        card_ambulance_desc: "లైవ్ GPS ట్రాకింగ్ & ట్రాఫిక్ కారిడార్లతో తక్షణ అత్యవసర రవాణాను అభ్యర్థించండి.",
        card_organ_title: "అవయవ దానం",
        card_organ_desc: "అవయవాలను దానం చేయడానికి ప్రతిజ్ఞ చేయండి, నమోదిత అవయవ దాతలను చూడండి.",
        card_emergency_title: "ప్రథమ చికిత్స మార్గదర్శి",
        card_emergency_desc: "CPR, ఊపిరి ఆడకపోవడం, కాలిన గాయాలు మరియు గుండెపోటు కోసం మార్గదర్శకాలు.",

        // Emergency Page
        emg_hero_title: "అత్యవసర ప్రథమ చికిత్స గైడ్",
        emg_hero_sub: "ప్రాణాపాయ వైద్య అత్యవసర పరిస్థితులకు తక్షణ చర్యల మార్గదర్శిని.",
        emg_knowledge_title: "📚 ఆరోగ్య విజ్ఞాన నిధి",
        emg_knowledge_sub: "ఉచిత 24/7 అత్యవసర హెల్ప్‌లైన్‌లు, 30-సెకన్ల ప్రథమ చికిత్స మార్గదర్శకాలు మరియు ధృవీకరించబడిన ఆరోగ్య సమాచారం.",
        emg_protocols_title: "🚨 30-సెకన్ల అత్యవసర ప్రథమ చికిత్స మార్గదర్శకాలు",
        emg_protocols_sub: "108 అంబులెన్స్ వచ్చే వరకు రోగి ప్రాణాలను కాపాడే తక్షణ చర్యలు",
        emg_cpr_btn: "🫁 అడల్ట్ సిపిఆర్ ప్రొటోకాల్",
        emg_choking_btn: "🗣️ ఊపిరి ఆడకపోవడం (హైమ్లిచ్)",
        emg_bleeding_btn: "🩸 రక్తస్రావం నియంత్రణ",
        emg_burns_btn: "🐍 పాముకాటు / కాలిన గాయాలు",
        emg_gps_title: "📍 లైవ్ GPS స్థానం",
        emg_gps_sub: "అత్యవసర సహాయం కోసం మీ ప్రస్తుత స్థానాన్ని పంపండి",
        emg_gps_refresh: "GPS రిఫ్రెష్",
        emg_gps_share: "వాట్సాప్‌లో షేర్ చేయండి",
        emg_gps_copy: "లింక్ కాపీ చేయండి",
        emg_helplines_title: "అత్యవసర హెల్ప్‌లైన్ నంబర్లు (24/7 ఉచిత సేవ)",
        emg_helpline_ambulance: "జాతీయ అంబులెన్స్",
        emg_helpline_police: "పోలీస్ కంట్రోల్ రూమ్",
        emg_helpline_fire: "ఫైర్ బ్రిగేడ్",

        emg_cpr_title: "🫁 అడల్ట్ సిపిఆర్ ప్రొటోకాల్ (ఛాతీ ఒత్తిడి)",
        emg_cpr_step1: "బాధితుడి ఛాతీ మధ్య భాగంలో ఒక చేయి అరచేతిని ఉంచి, దానిపై మరొక చేయి ఉంచండి.",
        emg_cpr_step2: "'Stayin Alive' లయ ప్రకారం నిమిషానికి 100 నుండి 120 సార్లు వేగంగా మరియు గట్టిగా నొక్కండి.",
        emg_cpr_step3: "ప్రతి ఒత్తిడి తర్వాత ఛాతీని పూర్తిగా పైకి రానివ్వండి. 108 అంబులెన్స్ వచ్చే వరకు కొనసాగించండి.",

        emg_choking_title: "🗣️ ఊపిరి ఆడకపోవడం (హైమ్లిచ్ విన్యాసం)",
        emg_choking_step1: "ఊపిరి ఆడని వ్యక్తి వెనుక నిలబడి వారి నడుము చుట్టూ చేతులు ఉంచండి.",
        emg_choking_step2: "ఒక చేతితో ముష్టిని చేసి, బొడ్డు పైభాగంలో ఉంచి, మరొక చేతితో పట్టుకోండి.",
        emg_choking_step3: "అడ్డుపడిన పదార్థం బయటకు వచ్చే వరకు వేగంగా పైకి తోయండి.",

        emg_bleeding_title: "🩸 రక్తస్రావం నియంత్రణ ప్రొటోకాల్",
        emg_bleeding_step1: "శుభ్రమైన గుడ్డ లేదా గాజ్‌తో గాయంపై గట్టిగా, నిరంతరం ఒత్తిడి చేయండి.",
        emg_bleeding_step2: "ఎముక విరగకపోతే గాయపడిన భాగాన్ని గుండె కంటే పైకి లేపండి.",
        emg_bleeding_step3: "రక్తం నానిన గుడ్డను తొలగించకండి; దానిపై మరిన్ని గుడ్డలు ఉంచి ఒత్తిడి చేయండి.",

        emg_burns_title: "🐍 పాముకాటు & తీవ్ర కాలిన గాయాల ప్రొటోకాల్",
        emg_burns_step1: "పాముకాటు: బాధితుడిని ప్రశాంతంగా ఉంచండి. గాయాన్ని కోయకండి, విషం పీల్చకండి!",
        emg_burns_step2: "కాలిన గాయాలు: 10-15 నిమిషాలు మంచినీటితో చల్లబరచండి. ఐస్ లేదా టూత్‌పేస్ట్ రాయకండి!"
    },

    HI: {
        // Navigation & Buttons
        nav_home: "होम",
        nav_hospitals: "अस्पताल",
        nav_blood: "रक्तदान",
        nav_ambulance: "एम्बुलेंस",
        nav_organ: "अंग दान",
        nav_emergency: "आपातकालीन गाइड",
        btn_sos: "SOS 108",
        btn_ai: "AI आपातकालीन गाइड",
        btn_install: "ऐप इंस्टॉल करें",
        btn_contact: "संपर्क करें",
        btn_account: "खाता",
        btn_admin: "एडमिन लॉगिन",

        // Hero Section
        hero_badge: "24/7 त्वरित आपातकालीन स्वास्थ्य नेटवर्क",
        hero_title: "हर सेकंड कीमती है। <br class=\"hidden md:inline\"/><span class=\"text-shimmer\">जुड़ें और जीवन बचाएं।</span>",
        hero_sub: "तुरंत रक्तदाताओं को खोजें, आपातकालीन एम्बुलेंस का अनुरोध करें, मान्यता प्राप्त अस्पतालों की खोज करें, या अंग दान का संकल्प लें।",
        
        // Homepage Services Cards
        card_hospitals_title: "अस्पताल खोजें",
        card_hospitals_desc: "आईसीयू बेड, आपातकालीन कक्ष और जीपीएस नेविगेशन वाले नजदीकी अस्पतालों का पता लगाएं।",
        card_blood_title: "रक्तदान करें और खोजें",
        card_blood_desc: "रक्त समूह और शहर के अनुसार सत्यापित दाताओं को खोजें, या रक्तदाता के रूप में पंजीकरण करें।",
        card_ambulance_title: "आपातकालीन एम्बुलेंस",
        card_ambulance_desc: "लाइव जीपीएस ट्रैकिंग और ट्रैफिक कॉरिडोर के साथ तत्काल आपातकालीन परिवहन का अनुरोध करें।",
        card_organ_title: "अंग दान",
        card_organ_desc: "अंग दान करने का संकल्प लें, पंजीकृत अंग दाताओं को देखें।",
        card_emergency_title: "प्राथमिक चिकित्सा गाइड",
        card_emergency_desc: "सीपीआर, घुटन, जलने की देखभाल और कार्डियक अरेस्ट प्रोटोकॉल।",

        // Emergency Page
        emg_hero_title: "आपातकालीन प्राथमिक चिकित्सा गाइड",
        emg_hero_sub: "जीवन-घातक चिकित्सा आपात स्थिति के लिए त्वरित चरण-दर-चरण मार्गदर्शिका।",
        emg_knowledge_title: "📚 स्वास्थ्य ज्ञान पुस्तकालय",
        emg_knowledge_sub: "सार्वजनिक 24/7 आपातकालीन हेल्पलाइन, 30-सेकंड प्राथमिक चिकित्सा गाइड, और सत्यापित स्वास्थ्य शिक्षा संसाधन।",
        emg_protocols_title: "🚨 30-सेकंड आपातकालीन प्राथमिक चिकित्सा प्रोटोकॉल",
        emg_protocols_sub: "108 एम्बुलेंस आने तक रोगी को जीवित रखने के लिए तत्काल कदम",
        emg_cpr_btn: "🫁 वयस्क सीपीआर प्रोटोकॉल",
        emg_choking_btn: "🗣️ घुटन (हैमलिच)",
        emg_bleeding_btn: "🩸 रक्तस्राव नियंत्रण",
        emg_burns_btn: "🐍 सांप का काटना / जलना",
        emg_gps_title: "📍 लाइव जीपीएस लोकेशन",
        emg_gps_sub: "आपातकालीन सहायता के लिए अपना वर्तमान स्थान भेजें",
        emg_gps_refresh: "जीपीएस रीफ्रेश करें",
        emg_gps_share: "व्हाट्सएप पर शेयर करें",
        emg_gps_copy: "लिंक कॉपी करें",
        emg_helplines_title: "तत्काल हेल्पलाइन नंबर (24/7 नि: शुल्क)",
        emg_helpline_ambulance: "राष्ट्रीय एम्बुलेंस",
        emg_helpline_police: "पुलिस कंट्रोल रूम",
        emg_helpline_fire: "फायर ब्रिगेड",

        emg_cpr_title: "🫁 वयस्क सीपीआर प्रोटोकॉल (छाती दबाना)",
        emg_cpr_step1: "मरीज की छाती के केंद्र में एक हाथ की हथेली रखें और दूसरे हाथ से उंगलियां बांधें।",
        emg_cpr_step2: "'Stayin Alive' की गति से प्रति मिनट 100 से 120 बार तेजी और मजबूती से दबाएं।",
        emg_cpr_step3: "प्रत्येक दबाव के बाद छाती को पूरी तरह वापस आने दें। 108 एम्बुलेंस आने तक इसे जारी रखें।",

        emg_choking_title: "🗣️ घुटन बचाव (हैमलिच पैंतरा)",
        emg_choking_step1: "पीड़ित व्यक्ति के पीछे खड़े हों और उनकी कमर के चारों ओर हाथ बांधें।",
        emg_choking_step2: "नाभि के ऊपर मुट्ठी रखें और ऊपर की ओर तेज झटका दें।",
        emg_choking_step3: "फंसी हुई वस्तु बाहर निकलने तक झटके दें।",

        emg_bleeding_title: "🩸 रक्तस्राव नियंत्रण प्रोटोकॉल",
        emg_bleeding_step1: "साफ कपड़े या धुंध से घाव पर सीधा और लगातार दबाव डालें।",
        emg_bleeding_step2: "यदि हड्डी न टूटी हो तो चोटिल हिस्से को दिल के स्तर से ऊपर उठाएं।",
        emg_bleeding_step3: "खून से भीगे कपड़े को न हटाएं, उसके ऊपर और कपड़े रखकर दबाव बनाएं।",

        emg_burns_title: "🐍 सांप काटने और जलने का प्रोटोकॉल",
        emg_burns_step1: "सांप का काटना: मरीज को शांत रखें। घाव को न काटें और न ही जहर चूसें!",
        emg_burns_step2: "जलना: जलने पर 10-15 मिनट ठंडा पानी डालें। बर्फ या टूथपेस्ट न लगाएं!"
    }
};

/**
 * Apply Site-wide Language Translation
 */
function applySiteLanguage(lang) {
    const targetLang = (lang && i18nDict[lang]) ? lang : 'EN';
    localStorage.setItem('site_lang', targetLang);
    const dict = i18nDict[targetLang];

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = dict[key];
            } else {
                el.innerHTML = dict[key];
            }
        }
    });

    // Backwards-compatibility element direct updates
    const titleEl = document.getElementById("txtHeroTitle");
    if (titleEl && dict.hero_title) titleEl.innerHTML = dict.hero_title;

    const subEl = document.getElementById("txtHeroSubtitle");
    if (subEl && dict.hero_sub) subEl.innerText = dict.hero_sub;

    const aiBtn = document.getElementById("btnAIAssist");
    if (aiBtn && dict.btn_ai) {
        aiBtn.innerHTML = `<i data-lucide="bot" class="w-4 h-4 text-blue-500"></i> <span>${dict.btn_ai}</span>`;
    }

    // Trigger protocol re-render on emergency page if available
    if (typeof window.switchProtocol === 'function') {
        window.switchProtocol(window.currentProtocolType || 'cpr');
    }

    // Update active state indicator on language pill buttons
    document.querySelectorAll('.lang-pill').forEach(btn => {
        const btnLang = btn.getAttribute('data-lang');
        if (btnLang === targetLang) {
            btn.classList.add('bg-red-600', 'text-white');
            btn.classList.remove('text-slate-700', 'dark:text-slate-200');
        } else {
            btn.classList.remove('bg-red-600', 'text-white');
            btn.classList.add('text-slate-700', 'dark:text-slate-200');
        }
    });

    if (window.lucide) {
        lucide.createIcons();
    }
}

function changeLanguage(lang) {
    applySiteLanguage(lang);
}

// Auto-apply saved language preference on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    const savedLang = localStorage.getItem('site_lang') || 'EN';
    applySiteLanguage(savedLang);
});






