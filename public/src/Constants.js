// ============================================================================
// Constants.js — Game loop tuning constants
// ============================================================================
// Loaded before all other modules. Exposes constants as browser globals.
// ============================================================================

/** Fixed logic timestep in milliseconds (60 updates per second) */
const FIXED_DT = 1000 / 60;

/** Fixed timestep in seconds (for movement calculations) */
const FIXED_DT_SEC = FIXED_DT / 1000;

/** Max accumulated frame time in ms — prevents spiral of death after stalls */
const MAX_FRAME_TIME = 100;

/** Max number of catch-up ticks per frame — prevents burst storms */
const MAX_TICKS_PER_FRAME = 5;

// Browser global
if (typeof window !== 'undefined') {
    window.FIXED_DT = FIXED_DT;
    window.FIXED_DT_SEC = FIXED_DT_SEC;
    window.MAX_FRAME_TIME = MAX_FRAME_TIME;
    window.MAX_TICKS_PER_FRAME = MAX_TICKS_PER_FRAME;
}

// Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FIXED_DT, FIXED_DT_SEC, MAX_FRAME_TIME, MAX_TICKS_PER_FRAME };
}