/**
 * LifeSaver-Care — Real-Time Floating Emergency Blood Alert System
 * 
 * Strict specifications:
 * - Persistent floating emergency alert banner at top of main website below navbar
 * - Does not break normal scrolling, does not cover screen, does not prevent mouse/touch scroll
 * - Real-time continuous Firebase RTDB listener for active 'blood_requests'
 * - Displays exact submitted details: Requester, Blood Group, Units, Hospital, Address, Contact
 * - Privacy protection: displays public phone or guarded phone according to requester privacy
 * - Desktop: Side-by-side cards with clean horizontal layout
 * - Mobile: Clean responsive stacking or horizontal scroll
 * - Deletion: When requester or admin deletes/closes request, alert disappears for everyone in real time
 * - Lightweight animation (opacity 0->1, translateY(-8px)->0, 400ms)
 * - Zero page reloads, zero scroll position jumps
 * - Single controlled listener, zero duplicate listeners
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9qUADNpQwX5iFp_qELRSGhHFswi-NoBc",
    authDomain: "life-saver-be5cf.firebaseapp.com",
    databaseURL: "https://life-saver-be5cf-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "life-saver-be5cf",
    storageBucket: "life-saver-be5cf.firebasestorage.app",
    messagingSenderId: "549675407162",
    appId: "1:549675407162:web:ba3c8878834cb4123ba203"
};

let app;
try {
    app = initializeApp(firebaseConfig);
} catch (e) {
    app = initializeApp(firebaseConfig, "emergency-alert-system");
}
const db = getDatabase(app);

// Guarded Phone Masking Helper
function maskGuardedPhone(phone) {
    if (!phone) return '+91 ••••• •••••';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 6) return '+91 ••••• •••••';
    const firstTwo = digits.length >= 10 ? digits.slice(-10, -8) : digits.slice(0, 2);
    const lastThree = digits.slice(-3);
    return `+91 ${firstTwo}••• ••${lastThree}`;
}

// Relative Time Helper
function formatTimeAgo(dateStr) {
    if (!dateStr) return 'Just now';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (isNaN(diffSec) || diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

// Inject CSS styles for subtle entrance animation & responsive cards
function ensureStyles() {
    if (document.getElementById("emergencyAlertStyles")) return;
    const style = document.createElement("style");
    style.id = "emergencyAlertStyles";
    style.textContent = `
        @keyframes emergencyAlertSlideIn {
            from {
                opacity: 0;
                transform: translateY(-8px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .emergency-alert-card-enter {
            animation: emergencyAlertSlideIn 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        #liveSOSCardsTrack::-webkit-scrollbar {
            height: 6px;
        }
        #liveSOSCardsTrack::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 9999px;
        }
        #liveSOSCardsTrack::-webkit-scrollbar-thumb {
            background: rgba(239, 68, 68, 0.6);
            border-radius: 9999px;
        }
        #liveSOSCardsTrack::-webkit-scrollbar-thumb:hover {
            background: rgba(220, 38, 38, 0.9);
        }
    `;
    document.head.appendChild(style);
}

// Injects or connects the top live emergency banner element
function ensureEmergencyBanner() {
    ensureStyles();
    let banner = document.getElementById("liveSOSAlertBanner");
    if (!banner) {
        banner = document.createElement("aside");
        banner.id = "liveSOSAlertBanner";
        banner.setAttribute("aria-label", "Urgent Emergency Blood Alerts");
        banner.className = "hidden sticky top-[54px] sm:top-[60px] z-30 w-full px-3 sm:px-6 py-2.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 dark:from-red-950/95 dark:via-slate-900/95 dark:to-red-950/95 text-white shadow-xl border-b border-red-400/50 dark:border-red-900/60 backdrop-blur-md transition-all";
        banner.innerHTML = `
            <div class="max-w-7xl mx-auto flex flex-col gap-2">
                <!-- Banner Top Row: Status Header & Quick Actions -->
                <div class="flex items-center justify-between gap-2 text-xs">
                    <div class="flex items-center gap-2 font-bold shrink-0">
                        <span class="bg-white text-red-600 dark:bg-red-600 dark:text-white text-[10px] sm:text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 shadow-sm flex items-center gap-1.5 border border-red-200 dark:border-red-500">
                            <span class="w-2 h-2 rounded-full bg-red-600 dark:bg-white animate-ping inline-block"></span>
                            🩸 URGENT BLOOD NEEDED (<span id="liveSOSCount">0</span>)
                        </span>
                        <span class="hidden md:inline text-[11px] text-white/90 font-medium">
                            Active patient emergency requests broadcasting live across LifeSaver-Care
                        </span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <a href="blood.html#postNeedBloodSection" id="liveSosPostBtn" class="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3 py-1 rounded-xl text-xs transition shadow-sm flex items-center gap-1 shrink-0 cursor-pointer">
                            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
                            <span>Post Blood Request</span>
                        </a>
                        <a href="blood.html" class="bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-1 rounded-xl text-xs transition border border-white/30 flex items-center gap-1 shrink-0">
                            <i data-lucide="list" class="w-3.5 h-3.5"></i>
                            <span>All Requests</span>
                        </a>
                    </div>
                </div>

                <!-- Banner Bottom Row: Multiple Emergency Alerts (Side-by-Side on Desktop, Responsive Horizontal Track on Mobile) -->
                <div id="liveSOSCardsTrack" class="flex items-stretch gap-3 overflow-x-auto py-1 scrollbar-thin scroll-smooth min-w-0">
                    <!-- Dynamically populated emergency request cards -->
                </div>
            </div>
        `;
        
        const nav = document.querySelector('nav') || document.querySelector('header');
        if (nav && nav.parentNode) {
            if (nav.nextSibling) {
                nav.parentNode.insertBefore(banner, nav.nextSibling);
            } else {
                nav.parentNode.appendChild(banner);
            }
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }

        // Attach auth check to "Post Blood Request" button on banner
        const postBtn = banner.querySelector("#liveSosPostBtn");
        if (postBtn) {
            postBtn.addEventListener("click", (e) => {
                if (typeof window.isUserLoggedIn === "function" && !window.isUserLoggedIn()) {
                    e.preventDefault();
                    if (typeof window.openPostBloodAuthModal === "function") {
                        window.openPostBloodAuthModal();
                    } else {
                        sessionStorage.setItem('ls_auth_redirect', 'post-blood');
                        window.location.href = 'auth.html?mode=login&redirect=post-blood';
                    }
                }
            });
        }
    }
    return banner;
}

// Track rendered cards to avoid duplicate rendering or jarring reflow
let previousCardKeys = [];

// Render active blood cards side-by-side
function renderEmergencyCards(activeList) {
    const banner = ensureEmergencyBanner();
    const track = document.getElementById("liveSOSCardsTrack");
    const countEl = document.getElementById("liveSOSCount");

    if (!track) return;

    if (!activeList || activeList.length === 0) {
        banner.classList.add("hidden");
        previousCardKeys = [];
        return;
    }

    if (countEl) countEl.textContent = activeList.length;

    const currentKeys = activeList.map(r => r.key);
    const isSameList = previousCardKeys.length === currentKeys.length && 
                       previousCardKeys.every((k, i) => k === currentKeys[i]);

    // If completely identical list, no need to tear down DOM
    if (isSameList) {
        banner.classList.remove("hidden");
        return;
    }

    previousCardKeys = currentKeys;
    track.innerHTML = "";

    const isBloodPage = window.location.pathname.endsWith("blood.html");

    activeList.forEach(req => {
        const card = document.createElement("div");
        card.id = `sos-card-${req.key}`;
        card.className = "emergency-alert-card-enter flex flex-col justify-between p-3 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-2 border-red-500 shadow-md shrink-0 w-[290px] sm:w-[320px] md:w-[340px] text-xs transition";
        
        const attendant = req.requesterName || req.name || 'Patient Attendant';
        const bloodGroup = (req.bloodGroup || 'Blood').toUpperCase();
        const units = parseInt(req.units, 10) || 1;
        const hospital = req.hospital || 'Hospital';
        const hospitalAddress = req.hospitalAddress || '';
        const city = req.city || 'Emergency';
        const rawPhone = req.contactNumber || req.phone || '';
        const timeAgo = formatTimeAgo(req.createdAt || req.timestamp);

        // Privacy System Adherence:
        // If requester explicitly marked public -> show raw number
        // Otherwise protect/mask phone number and guide through Privacy Shield contact mechanism
        const isExplicitlyPublic = req.privacy === 'public' || req.phonePrivacy === 'public' || req.isPublic === true;
        const phoneDisplay = isExplicitlyPublic && rawPhone 
            ? `<strong class="font-mono text-red-600 dark:text-red-400 font-bold">${rawPhone}</strong>`
            : `<strong class="font-mono text-slate-700 dark:text-slate-300">${maskGuardedPhone(rawPhone)}</strong> <span class="text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.2 rounded font-bold border border-emerald-200 dark:border-emerald-900">🛡️ Guarded</span>`;

        card.innerHTML = `
            <div>
                <!-- Card Header: Blood Group Needed & Units -->
                <div class="flex items-center justify-between gap-1.5 border-b border-red-100 dark:border-red-900/40 pb-1.5 mb-1.5">
                    <span class="inline-flex items-center gap-1 text-[11px] font-black text-red-600 dark:text-red-400 uppercase tracking-wide">
                        <span class="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span> 🩸 URGENT BLOOD
                    </span>
                    <span class="bg-red-600 text-white font-black text-[11px] px-2 py-0.5 rounded-lg shadow-sm">
                        ${bloodGroup} • ${units} ${units === 1 ? 'Unit' : 'Units'}
                    </span>
                </div>

                <!-- Requester Need Description -->
                <div class="font-black text-xs text-slate-900 dark:text-white leading-snug mb-1">
                    ${attendant} needs <span class="text-red-600 dark:text-red-400 font-black">${bloodGroup}</span> blood
                </div>

                <!-- Hospital & Address Information -->
                <div class="space-y-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                    <div class="font-bold truncate flex items-center gap-1" title="${hospital}">
                        <span>🏥</span> <span class="truncate">${hospital}</span>
                    </div>
                    <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1" title="${hospitalAddress ? hospitalAddress + ', ' + city : city}">
                        <span>📍</span> <span class="truncate">${hospitalAddress ? hospitalAddress + ' (' + city + ')' : city}</span>
                    </div>
                    <div class="text-[11px] pt-1 flex items-center gap-1">
                        <span>📞</span> <span class="truncate">Contact: ${phoneDisplay}</span>
                    </div>
                </div>
            </div>

            <!-- Card Footer: Time Stamp & Action Button -->
            <div class="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span class="text-[10px] font-mono text-slate-400 dark:text-slate-500">${timeAgo}</span>
                <button type="button" class="btn-sos-help bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black text-xs px-3 py-1.5 rounded-xl shadow-md shadow-red-500/20 transition flex items-center gap-1.5 cursor-pointer">
                    <i data-lucide="heart-handshake" class="w-3.5 h-3.5 text-white"></i>
                    <span>VIEW / HELP</span>
                </button>
            </div>
        `;

        const helpBtn = card.querySelector(".btn-sos-help");
        if (helpBtn) {
            helpBtn.onclick = () => {
                if (isBloodPage) {
                    if (typeof window.openBloodMatchModal === 'function') {
                        window.openBloodMatchModal(req.key);
                    } else if (typeof window.openPrivacyTicketByKey === 'function') {
                        window.openPrivacyTicketByKey(req.key);
                    }
                } else {
                    window.location.href = `blood.html?ticket=${encodeURIComponent(req.key)}`;
                }
            };
        }

        track.appendChild(card);
    });

    banner.classList.remove("hidden");
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Single Controlled Real-Time Listener
function initEmergencyAlertSystem() {
    if (window.__emergencyAlertSystemInitialized) return;
    window.__emergencyAlertSystemInitialized = true;

    // Fast local cache hydration for zero layout shift
    try {
        const cached = JSON.parse(localStorage.getItem("ls_active_blood_requests") || "[]");
        if (Array.isArray(cached) && cached.length > 0) {
            renderEmergencyCards(cached);
        }
    } catch (e) {}

    // Listen to Firebase RTDB node 'blood_requests' in real time
    onValue(ref(db, 'blood_requests'), (snapshot) => {
        const activeList = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                const r = data[key];
                if (!r) return;
                const status = (r.status || 'active').toLowerCase().trim();
                // Filter only truly active/urgent blood requests
                if (status === 'completed' || status === 'fulfilled' || status === 'deleted' || status === 'closed' || status === 'cancelled') {
                    return;
                }
                activeList.push({ key, ...r });
            });
        }

        // Sort newest urgent requests first using createdAt or timestamp
        activeList.sort((a, b) => {
            const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
            const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
            return timeB - timeA;
        });

        try {
            localStorage.setItem("ls_active_blood_requests", JSON.stringify(activeList));
        } catch (e) {}

        // Render cards without moving the user's scroll position or reloading
        renderEmergencyCards(activeList);
    }, (err) => {
        console.warn("[EmergencyAlertSystem] Realtime listener notice:", err);
    });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmergencyAlertSystem);
} else {
    initEmergencyAlertSystem();
}
