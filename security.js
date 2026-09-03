/**
 * Life Saver Security & Anti-Tampering Module
 * Complete Client-Side Anti-Inspect, Anti-Screenshot, Anti-Copy, & Anti-Debugging Suite
 * Hardened Control Key & DevTools Suppression
 */
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

    // 7. Anti-Debugging & Continuous Breakpoint Trap
    let isDevToolsOpen = false;

    function antiDebuggerTrap() {
        const startTime = performance.now();
        (function () {
            return false;
        })['constructor']('debugger')();

        const endTime = performance.now();
        if (endTime - startTime > 100) {
            isDevToolsOpen = true;
            showConsoleBanner();
        }
    }

    setInterval(antiDebuggerTrap, 200);

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




