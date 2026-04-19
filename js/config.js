// @ts-check
'use strict';

/**
 * @typedef {Object} PayoutResult
 * @property {number} rank     Rank (1-based)
 * @property {number} amount   Số tiền đã làm tròn theo CRF (VND)
 * @property {number} pct      % của pool
 */

/**
 * @typedef {Object} DisplayRow
 * @property {number} startRank
 * @property {number} endRank
 * @property {number} amount            Số tiền của từng rank trong nhóm
 * @property {PayoutResult[]} results   Các rank thuộc nhóm
 */

/**
 * @typedef {Object} Preset
 * @property {string} desc
 * @property {number|null} defaultItm
 * @property {number|null} defaultMinCash
 * @property {number[]|null} topPct
 * @property {number|null} groupDecay
 */

/**
 * @typedef {Object} AppState
 * @property {string} preset
 * @property {string} entries
 * @property {string} buyin
 * @property {string} rake
 * @property {string} staff
 * @property {string} itmPct
 * @property {string} minCash
 * @property {string} rounding
 * @property {boolean} poolMode
 * @property {string} directPool
 * @property {string} slope
 * @property {string} grpStart
 * @property {string} decay
 * @property {string} slopeNum
 * @property {string} grpStartNum
 * @property {string} gDecayNum
 * @property {Object<string, number>} [overrides]  rank → amount (VND)
 * @property {boolean} [compareOn]
 * @property {string|null} [shadowPreset]
 */

/* ═══════════════════════════════════════════════════════
   CONFIG — Constants · WPT Data · Presets · Global State
   ═══════════════════════════════════════════════════════ */

/* ── Constants ── */
const PRESET_TOP_N = 20;
const STORAGE_KEY  = 'quads_payout_v1';

/* ══ WPT DYNAMIC ANCHORS
   Values = % of pool at that entry count (1-in-8 structure)
   Anchor 100P: column "97-104 entries"  (Payout B sheet)
   Anchor 250P: column "249-256 entries"
   Anchor 400P: column "401-408 entries" (approx)           ══ */
const WPT_A100 = [
  30.50, 18.75, 11.50, 7.50, 5.85, 4.675, 3.975, 3.45, 3.05, 2.75,
   2.75,  2.75,  2.50, 2.35, 2.25, 1.95, 1.925, 1.825, 1.50, 1.40
];
const WPT_A250 = [
  22.976, 16.681, 10.250, 6.235, 4.815, 3.990, 3.400, 2.965, 2.544, 2.165,
   2.165,  2.165,  1.850, 1.850, 1.850, 1.535, 1.535, 1.535, 1.225, 1.225
];
const WPT_A400 = [
  20.910, 14.639, 9.373, 6.165, 4.735, 3.938, 3.295, 2.698, 2.091, 1.742,
   1.742,  1.742, 1.480, 1.480, 1.480, 1.208, 1.208, 1.208, 1.005, 1.005
];

/* ── Static presets ── */
const PRESETS = {
  wpt: {
    desc: 'WPT Main Tour. Cấu trúc 1-in-8 (12.5% ITM). Tự động điều chỉnh phân bổ theo số người tham dự (100–400). Dựa trên bảng tính WPT Official Payout Calculator.',
    defaultItm: 12.5, defaultMinCash: 2.0,
    topPct: null, groupDecay: null // computed dynamically
  },
  wsop: {
    desc: 'WSOP Circuit 2026. Calibrated từ 3 event tại Planet Hollywood: 71–1349 entries. Phân bổ đều hơn APT/WPT, phù hợp field lớn. 1st ≈ 13–28% tuỳ field.',
    defaultItm: 15, defaultMinCash: 2.0,
    topPct: [14.0,9.0,6.2,4.5,3.4,2.55,1.92,1.52,1.18,0.95,
              0.95,0.78,0.78,0.64,0.64,0.64,0.64,0.53,0.53,0.53],
    groupDecay: 0.95
  },
  apt: {
    desc: 'APT Asia Pacific Tour. Calibrated từ APT Jeju 2026 Main Event & APT Taiwan 2025 (Ultra Stack). Top-heavy hơn WSOP, 1st/2nd ratio ≈ 1.7. Phù hợp field 50–400.',
    defaultItm: 13, defaultMinCash: 1.5,
    topPct: [25.0,14.8,10.0,7.3,5.8,4.4,3.3,2.55,2.05,1.72,
              1.72,1.48,1.48,1.28,1.28,1.10,1.10,0.96,0.96,0.96],
    groupDecay: 0.90
  },
  triton: {
    desc: 'Triton Super High Roller. Rất dốc về đỉnh — 1st ≈ 30–45%, 1st/2nd ratio ≈ 1.65. Chỉ phù hợp field nhỏ 20–100 người.',
    defaultItm: 10, defaultMinCash: 2.0,
    topPct: [28.0,16.5,10.5,7.2,5.5,4.1,3.2,2.6,2.1,1.75,
              1.50,1.28,1.10,0.95,0.82,0.72,0.63,0.55,0.48,0.42],
    groupDecay: 0.84
  },
  custom: {
    desc: 'Tuỳ chỉnh: sử dụng slope (độ dốc rank), số rank lẻ và hệ số suy giảm nhóm để tạo cấu trúc riêng.',
    defaultItm: null, defaultMinCash: 1.5,
    topPct: null, groupDecay: null
  }
};

/* ── Global mutable state ── */
let CP       = 'wsop';         // current preset key
let CResults = [];             // last buildPayout results
let CPool    = 0;              // current prize pool
let CRF      = 10000;         // current rounding factor
let CIndivN  = PRESET_TOP_N;  // individual rank count
let CEntries = 0;             // current entries
let CDisplayRows = [];        // rows shown in table
let CMinCash     = 0;         // min cash VND

const OVR            = new Map();  // manual overrides: rank → amount
let PENDING_OVR      = null;       // overrides khôi phục từ localStorage, áp dụng sau run() đầu tiên
const expandedGroups = new Set();  // expanded group start ranks
