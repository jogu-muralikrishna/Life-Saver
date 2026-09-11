/**
 * LifeSaver-Care — Real-Time Emergency Blood Alert System
 * 
 * Features:
 * - Persistent top floating banner below navbar across all pages
 * - Real-time continuous Firebase RTDB listener for active 'blood_requests'
 * - Side-by-side cards on desktop with responsive horizontal track on mobile
 * - Automatic filtering of completed/fulfilled/deleted/closed requests
 * - Newest urgent requests sorted first
 * - Guarded phone privacy masking
 * - Zero intrusive animations, high contrast dark/light mode support
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

// Injects or connects the top live emergency banner element
function ensureEmergencyBanner() {
    let banner = document.getElementById("liveSOSAlertBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "liveSOSAlertBanner";
        banner.className = "hidden sticky top-[54px] sm:top-[60px] z-30 px-3 sm:px-6 py-2 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-xl border-b border-red-500/50 backdrop-blur-md";
        banner.innerHTML = `
            <div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                <div class="flex items-center gap-2 font-bold shrink-0">
                    <span class="bg-white text-red-600 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase shrink-0 shadow-sm animate-pulse flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-red-600 animate-ping inline-block"></span> 🚨 Live Urgent Blood Needs (<span id="liveSOSCount">0</span>)
                    </span>
                </div>
                <!-- SIDE BY SIDE ACTIVE BLOOD CARDS TRACK -->
                <div id="liveSOSCardsTrack" class="flex items-center gap-2.5 overflow-x-auto py-1 scrollbar-thin flex-1 min-w-0">
                    <!-- Dynamically populated side-by-side cards -->
                </div>
                <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <a href="blood.html#postNeedBloodSection" class="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs transition shadow-sm flex items-center gap-1 shrink-0">
                        <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Post Blood Need
                    </a>
                    <a href="blood.html" class="bg-white text-red-700 hover:bg-red-50 font-black px-3 py-1.5 rounded-xl text-xs transition shadow-sm flex items-center gap-1 shrink-0">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i> View All
                    </a>
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
    }
    return banner;
}

// Render active blood cards side-by-side
function renderEmergencyCards(activeList) {
    const banner = ensureEmergencyBanner();
    const track = document.getElementById("liveSOSCardsTrack");
    const countEl = document.getElementById("liveSOSCount");

    if (!track) return;

    if (activeList.length === 0) {
        banner.classList.add("hidden");
        return;
    }

    if (countEl) countEl.textContent = activeList.length;
    track.innerHTML = "";

    const isBloodPage = window.location.pathname.endsWith("blood.html");

    activeList.forEach(req => {
        const card = document.createElement(isBloodPage ? "div" : "a");
        if (!isBloodPage) {
            card.href = `blood.html?ticket=${encodeURIComponent(req.key)}`;
        } else {
            card.onclick = () => {
                if (typeof window.openBloodMatchModal === 'function') {
                    window.openBloodMatchModal(req.key);
                } else if (typeof window.openPrivacyTicketByKey === 'function') {
                    window.openPrivacyTicketByKey(req.key);
                }
            };
        }
        card.className = "inline-flex items-center gap-2 bg-black/30 hover:bg-black/45 border border-white/30 px-3 py-1.5 rounded-xl text-xs shrink-0 transition backdrop-blur-sm shadow-sm cursor-pointer text-white no-underline";
        
        const attendant = req.requesterName || req.name || 'Attendant';
        const units = req.units || 1;
        const hospital = req.hospital || 'Hospital';
        const city = req.city || 'Emergency';
        const masked = maskGuardedPhone(req.phone);

        card.innerHTML = `
            <span class="bg-white text-red-600 font-black text-[11px] px-2 py-0.5 rounded-lg shadow-sm shrink-0 flex items-center gap-1">
                <span>🩸</span> <span>${req.bloodGroup}</span> <span class="font-bold text-slate-700">(${units}U)</span>
            </span>
            <span class="font-bold text-white truncate max-w-[160px] sm:max-w-[240px]" title="${hospital}, ${city}">
                🏥 ${hospital} • ${city}
            </span>
            <span class="text-white/90 text-[11px] shrink-0 font-medium hidden md:inline">
                📞 ${attendant}: <strong class="font-mono text-white">${masked}</strong>
            </span>
            <span class="bg-white text-red-700 hover:bg-red-50 font-black text-[10px] px-2.5 py-1 rounded-lg transition shadow-sm shrink-0 flex items-center gap-1">
                <i data-lucide="heart-handshake" class="w-3 h-3 text-red-600"></i> HELP / CONTACT
            </span>
        `;
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

    // Fast local cache hydration for zero flicker
    try {
        const cached = JSON.parse(localStorage.getItem("ls_active_blood_requests") || "[]");
        if (Array.isArray(cached) && cached.length > 0) {
            renderEmergencyCards(cached);
        }
    } catch (e) {}

    onValue(ref(db, 'blood_requests'), (snapshot) => {
        const activeList = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                const r = data[key];
                if (!r) return;
                const status = (r.status || 'Active').toLowerCase().trim();
                // Filter only truly active/urgent blood requests
                if (status === 'completed' || status === 'fulfilled' || status === 'deleted' || status === 'closed' || status === 'cancelled') {
                    return;
                }
                activeList.push({ key, ...r });
            });
        }

        // Sort newest urgent requests first
        activeList.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
            const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        try {
            localStorage.setItem("ls_active_blood_requests", JSON.stringify(activeList));
        } catch (e) {}

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
