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
        html, body {
            overflow-x: clip;
        }
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
        #liveSOSAlertBanner {
            position: sticky !important;
            z-index: 39 !important;
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

// Dynamically calibrate banner top offset based on active navbar height
function updateBannerNavOffset() {
    const banner = document.getElementById("liveSOSAlertBanner");
    if (!banner) return;
    const nav = document.querySelector('nav') || document.querySelector('header');
    if (nav) {
        const navH = Math.round(nav.offsetHeight || 60);
        banner.style.top = `${navH}px`;
    } else {
        banner.style.top = '0px';
    }
}

// Injects or connects the top live emergency banner element
function ensureEmergencyBanner() {
    ensureStyles();
    let banner = document.getElementById("liveSOSAlertBanner");
    if (!banner || !banner.querySelector("#liveSOSCardsTrack")) {
        if (!banner) {
            banner = document.createElement("aside");
            banner.id = "liveSOSAlertBanner";
            banner.setAttribute("aria-label", "Urgent Emergency Blood Alerts");
        }
        banner.className = "hidden sticky z-30 w-full px-3 sm:px-4 py-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 dark:from-red-950/95 dark:via-slate-900/95 dark:to-red-950/95 text-white shadow-lg border-b border-red-400/50 dark:border-red-900/60 backdrop-blur-md transition-all";
        banner.innerHTML = `
            <div class="max-w-7xl mx-auto flex flex-col gap-1.5">
                <!-- Compact Top Row: Status Header & Quick Actions -->
                <div class="flex items-center justify-between gap-2 text-[11px]">
                    <div class="flex items-center gap-2 font-bold shrink-0">
                        <span class="bg-white text-red-600 dark:bg-red-600 dark:text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 shadow-sm flex items-center gap-1 border border-red-200 dark:border-red-500">
                            <span class="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-white animate-ping inline-block"></span>
                            🩸 URGENT BLOOD (<span id="liveSOSCount">0</span>)
                        </span>
                        <span class="hidden sm:inline text-[10px] text-white/85 font-medium truncate">
                            Live patient emergency requests broadcasting across LifeSaver-Care
                        </span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <a href="blood.html#postNeedBloodSection" id="liveSosPostBtn" class="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-2.5 py-0.5 rounded-lg text-[10px] sm:text-[11px] transition shadow-sm flex items-center gap-1 shrink-0 cursor-pointer">
                            <i data-lucide="plus-circle" class="w-3 h-3"></i>
                            <span>Post Blood Request</span>
                        </a>
                        <a href="blood.html" class="bg-white/20 hover:bg-white/30 text-white font-bold px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] transition border border-white/30 flex items-center gap-1 shrink-0">
                            <i data-lucide="list" class="w-3 h-3"></i>
                            <span>All Requests</span>
                        </a>
                    </div>
                </div>

                <!-- Compact Bottom Row: Sleek, compact cards side-by-side -->
                <div id="liveSOSCardsTrack" class="flex items-stretch gap-2.5 overflow-x-auto py-0.5 scrollbar-thin scroll-smooth min-w-0">
                    <!-- Dynamically populated compact emergency request cards -->
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
        } else if (!banner.parentNode) {
            document.body.insertBefore(banner, document.body.firstChild);
        }

        // Attach dynamic nav height listener
        updateBannerNavOffset();
        window.addEventListener('resize', updateBannerNavOffset);
        window.addEventListener('scroll', updateBannerNavOffset, { passive: true });
        if (window.ResizeObserver && nav) {
            try { new ResizeObserver(updateBannerNavOffset).observe(nav); } catch(e) {}
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
    updateBannerNavOffset();
    return banner;
}

// Standalone Top-Middle View & Help Dialog
function openEmergencyViewHelpModal(req) {
    let modal = document.getElementById("emergencyViewHelpModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "emergencyViewHelpModal";
        modal.className = "fixed inset-0 z-[100] flex items-start justify-center pt-6 sm:pt-10 px-3 sm:px-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto";
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.add("hidden");
        };
        document.body.appendChild(modal);
    }

    const attendant = req.requesterName || req.name || 'Patient Attendant';
    const bloodGroup = (req.bloodGroup || 'Blood').toUpperCase();
    const units = parseInt(req.units, 10) || 1;
    const hospital = req.hospital || 'Hospital';
    const hospitalAddress = req.hospitalAddress || '';
    const city = req.city || 'Emergency Registry';
    const rawPhone = req.contactNumber || req.phone || '';
    const details = req.emergencyDetails || 'Urgent transfusion required for hospitalized patient.';
    const timeAgo = formatTimeAgo(req.createdAt || req.timestamp);

    const isExplicitlyPrivate = req.privacy === 'private' || req.phonePrivacy === 'private' || req.isPublic === false;
    const cleanPhone = rawPhone.replace(/\D/g, '');

    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-900 text-slate-900 dark:text-white w-full max-w-md rounded-2xl p-4 sm:p-5 border-2 border-red-500/80 shadow-2xl relative my-0 animate-in fade-in slide-in-from-top-4 duration-200">
            <!-- Close Button -->
            <button onclick="document.getElementById('emergencyViewHelpModal').classList.add('hidden')" class="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold p-1 rounded-xl text-base transition cursor-pointer" title="Close">✕</button>

            <!-- Modal Header -->
            <div class="flex items-center gap-2.5 mb-3">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white flex items-center justify-center text-base shadow-md shadow-red-500/25 shrink-0 font-black">
                    🩸
                </div>
                <div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900">Live SOS Broadcast</span>
                        <span class="text-[9px] font-mono text-slate-400">${timeAgo}</span>
                    </div>
                    <h2 class="text-sm sm:text-base font-black text-slate-900 dark:text-white mt-0.5">${bloodGroup} Blood Needed (${units} ${units === 1 ? 'Unit' : 'Units'})</h2>
                </div>
            </div>

            <!-- Urgent Requirement Details Card -->
            <div class="bg-red-50/70 dark:bg-red-950/30 rounded-xl p-3 border border-red-200/80 dark:border-red-900/50 mb-3 space-y-1.5 text-xs">
                <div class="flex items-center justify-between">
                    <span class="text-slate-600 dark:text-slate-400 text-[11px]">Patient Attendant:</span>
                    <strong class="text-slate-900 dark:text-white font-bold text-[11px]">${attendant}</strong>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-slate-600 dark:text-slate-400 text-[11px]">Units Required:</span>
                    <span class="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded-md shadow-sm">${units} ${units === 1 ? 'Unit' : 'Units'} (${bloodGroup})</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-slate-600 dark:text-slate-400 text-[11px]">Hospital:</span>
                    <strong class="text-slate-900 dark:text-white font-bold text-[11px] text-right truncate max-w-[180px]" title="${hospital}">${hospital}</strong>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-slate-600 dark:text-slate-400 text-[11px]">Address & City:</span>
                    <span class="text-slate-700 dark:text-slate-300 font-semibold text-[11px] text-right truncate max-w-[190px]">${hospitalAddress ? hospitalAddress + ', ' + city : city}</span>
                </div>
                ${details ? `
                <div class="pt-1 border-t border-red-200/60 dark:border-red-900/40 text-[10px]">
                    <span class="text-slate-500 dark:text-slate-400">Emergency Details:</span>
                    <p class="text-slate-800 dark:text-slate-200 font-medium italic mt-0.5">${details}</p>
                </div>
                ` : ''}
            </div>

            <!-- Action Buttons: Call, WhatsApp, Match Donors -->
            <div class="space-y-1.5">
                ${!isExplicitlyPrivate && cleanPhone ? `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <a href="tel:${cleanPhone}" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 px-3 rounded-xl text-xs transition shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 cursor-pointer text-center no-underline">
                        <i data-lucide="phone-call" class="w-3.5 h-3.5"></i>
                        <span>Call: ${rawPhone}</span>
                    </a>
                    <a href="https://wa.me/91${cleanPhone.slice(-10)}?text=${encodeURIComponent('Hello ' + attendant + ', I saw your urgent request for ' + bloodGroup + ' blood at ' + hospital + ' on LifeSaver-Care. I would like to help.')}" target="_blank" rel="noopener noreferrer" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-2 px-3 rounded-xl text-xs transition shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 cursor-pointer text-center no-underline">
                        <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                        <span>WhatsApp</span>
                    </a>
                </div>
                ` : `
                <div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-center text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    🛡️ Requester Phone: <span class="font-mono font-bold">${maskGuardedPhone(rawPhone)}</span> (Guarded Contact)
                </div>
                `}

                <a href="blood.html?ticket=${encodeURIComponent(req.key)}" class="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black py-2 px-3 rounded-xl text-xs transition shadow-md shadow-red-500/20 flex items-center justify-center gap-1.5 cursor-pointer text-center no-underline">
                    <i data-lucide="users" class="w-3.5 h-3.5"></i>
                    <span>🎯 Open Full Ticket & Match Donors</span>
                </a>
            </div>

            <!-- Footer Close -->
            <div class="mt-2.5 pt-1.5 text-center border-t border-slate-100 dark:border-slate-800">
                <button onclick="document.getElementById('emergencyViewHelpModal').classList.add('hidden')" class="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                    Dismiss
                </button>
            </div>
        </div>
    `;

    modal.classList.remove("hidden");
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}
window.openEmergencyViewHelpModal = openEmergencyViewHelpModal;

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
        updateBannerNavOffset();
        return;
    }

    previousCardKeys = currentKeys;
    track.innerHTML = "";

    activeList.forEach(req => {
        const card = document.createElement("div");
        card.id = `sos-card-${req.key}`;
        card.className = "emergency-alert-card-enter flex flex-col justify-between p-2 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-red-500/80 shadow-md shrink-0 w-[220px] sm:w-[245px] md:w-[255px] text-[10px] transition";
        
        const attendant = req.requesterName || req.name || 'Patient Attendant';
        const bloodGroup = (req.bloodGroup || 'Blood').toUpperCase();
        const units = parseInt(req.units, 10) || 1;
        const hospital = req.hospital || 'Hospital';
        const hospitalAddress = req.hospitalAddress || '';
        const city = req.city || 'Emergency';
        const rawPhone = req.contactNumber || req.phone || '';
        const timeAgo = formatTimeAgo(req.createdAt || req.timestamp);

        // Privacy System Adherence:
        const isExplicitlyPrivate = req.privacy === 'private' || req.phonePrivacy === 'private' || req.isPublic === false;
        const phoneDisplay = !isExplicitlyPrivate && rawPhone 
            ? `<a href="tel:${rawPhone}" class="font-mono text-red-600 dark:text-red-400 font-bold hover:underline" onclick="event.stopPropagation();">${rawPhone}</a>`
            : `<strong class="font-mono text-slate-700 dark:text-slate-300">${maskGuardedPhone(rawPhone)}</strong> <span class="text-[8px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-1 py-0.1 rounded font-bold">🛡️</span>`;

        card.innerHTML = `
            <div>
                <!-- Card Header: Blood Group Needed & Units -->
                <div class="flex items-center justify-between gap-1 border-b border-red-100 dark:border-red-900/40 pb-0.5 mb-1">
                    <span class="inline-flex items-center gap-1 text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-tight">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                        🩸 ${bloodGroup} • ${units} ${units === 1 ? 'Unit' : 'Units'}
                    </span>
                    <span class="text-[9px] font-mono text-slate-400 dark:text-slate-500 shrink-0">${timeAgo}</span>
                </div>

                <!-- Requester Need Description -->
                <div class="font-black text-[10px] text-slate-900 dark:text-white truncate leading-tight mb-0.5" title="${attendant} needs ${bloodGroup} blood">
                    ${attendant} needs <span class="text-red-600 dark:text-red-400">${bloodGroup}</span>
                </div>

                <!-- Hospital & Address Information -->
                <div class="space-y-0.2 text-[9px] text-slate-600 dark:text-slate-300">
                    <div class="truncate flex items-center gap-1 font-semibold" title="${hospital}">
                        <span>🏥</span> <span class="truncate">${hospital}</span>
                    </div>
                    <div class="truncate flex items-center gap-1 text-slate-500 dark:text-slate-400 text-[8.5px]" title="${hospitalAddress ? hospitalAddress + ', ' + city : city}">
                        <span>📍</span> <span class="truncate">${hospitalAddress ? hospitalAddress + ' (' + city + ')' : city}</span>
                    </div>
                </div>
            </div>

            <!-- Card Footer: Contact & Action Button -->
            <div class="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                <div class="text-[9.5px] truncate max-w-[125px] sm:max-w-[145px]">
                    <span>📞</span> ${phoneDisplay}
                </div>
                <button type="button" class="btn-sos-help bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black text-[9px] px-1.5 py-0.5 rounded-md shadow-sm transition flex items-center gap-0.5 shrink-0 cursor-pointer">
                    <i data-lucide="heart-handshake" class="w-3 h-3 text-white"></i>
                    <span>VIEW / HELP</span>
                </button>
            </div>
        `;

        const helpBtn = card.querySelector(".btn-sos-help");
        if (helpBtn) {
            helpBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Opens View & Help Dialog directly at the TOP SIDE MIDDLE OF THE PAGE
                openEmergencyViewHelpModal(req);
            };
        }

        track.appendChild(card);
    });

    banner.classList.remove("hidden");
    updateBannerNavOffset();
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
