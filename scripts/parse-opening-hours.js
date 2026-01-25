/**
 * OSM opening_hours parser
 * @see https://wiki.openstreetmap.org/wiki/Key:opening_hours
 */

const DAY_MAP = {
    mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 0,
    lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 0,
    lu: 1, ma: 2, me: 3, je: 4, ve: 5, sa: 6, di: 0
};
const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function parseTime(str) {
    const m = str.match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}

function parseTimeRanges(str) {
    return str.replace(/–/g, '-').split(',').map(p => {
        const m = p.trim().match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        return m ? { open: m[1], close: m[2], openMinutes: parseTime(m[1]), closeMinutes: parseTime(m[2]) } : null;
    }).filter(Boolean);
}

function parseDays(str) {
    const days = new Set();
    str.toLowerCase().split(',').forEach(part => {
        const range = part.trim().match(/^(\w{2,3})-(\w{2,3})$/);
        if (range && DAY_MAP[range[1]] !== undefined && DAY_MAP[range[2]] !== undefined) {
            let cur = DAY_MAP[range[1]];
            while (true) {
                days.add(cur);
                if (cur === DAY_MAP[range[2]]) break;
                cur = (cur + 1) % 7;
            }
        } else if (DAY_MAP[part.trim()] !== undefined) {
            days.add(DAY_MAP[part.trim()]);
        }
    });
    return [...days].sort((a, b) => a - b);
}

function parseRule(str) {
    str = str.replace(/"[^"]*"/g, '').trim();
    if (!str) return null;

    const lower = str.toLowerCase();
    if (['closed', 'off', 'no', 'unknown', 'sunrise-sunset'].includes(lower)) {
        return { days: ALL_DAYS, times: [], closed: true };
    }
    if (lower === '24/7') {
        return { days: ALL_DAYS, times: [{ open: '00:00', close: '24:00', openMinutes: 0, closeMinutes: 1440 }] };
    }

    str = str.replace(/^PH[,;\s]*/i, '').trim();
    if (!str) return null;

    const match = str.match(/^([A-Za-z,\-]+)\s+(.+)$/);
    if (!match) {
        const times = parseTimeRanges(str);
        return times.length ? { days: ALL_DAYS, times } : null;
    }

    const [, daysPart, timesPart] = match;
    if (['off', 'closed'].includes(timesPart.toLowerCase())) {
        return { days: parseDays(daysPart), times: [], closed: true };
    }
    return { days: parseDays(daysPart), times: parseTimeRanges(timesPart) };
}

function parseOpeningHours(str) {
    if (!str || typeof str !== 'string') return null;

    str = str.replace(/(\d)\s*,\s*([a-zA-Z]{2,3})/g, '$1; $2');

    const result = Object.fromEntries(ALL_DAYS.map(d => [d, { day: DAY_NAMES[d], times: [], closed: false }]));

    str.split(';').forEach(rule => {
        const trimmed = rule.trim();
        if (!trimmed || trimmed.toLowerCase().startsWith('ph')) return;

        const parsed = parseRule(trimmed);
        if (!parsed?.days) return;

        parsed.days.forEach(day => {
            if (parsed.closed) {
                result[day].closed = true;
                result[day].times = [];
            } else {
                result[day].times = parsed.times;
                result[day].closed = false;
            }
        });
    });

    return result;
}

function formatForDisplay(parsed) {
    if (!parsed) return ['Horaires non disponibles'];
    return [1, 2, 3, 4, 5, 6, 0].map(d => {
        const { day, times, closed } = parsed[d];
        const name = day.charAt(0).toUpperCase() + day.slice(1);
        return closed || !times.length ? `${name}: Fermé` : `${name}: ${times.map(t => `${t.open}-${t.close}`).join(', ')}`;
    });
}

function isCurrentlyOpen(parsed, date = new Date()) {
    if (!parsed) return null;
    const schedule = parsed[date.getDay()];
    if (!schedule || schedule.closed || !schedule.times.length) return false;
    const mins = date.getHours() * 60 + date.getMinutes();
    return schedule.times.some(t => mins >= t.openMinutes && mins < t.closeMinutes);
}

const REVERSE_DAY_MAP = {
    1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa', 0: 'Su'
};

const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mo to Su

/**
 * Groups consecutive days into ranges.
 * Example: [1, 2, 3, 5] (Mon, Tue, Wed, Fri) -> [{start: 1, end: 3}, {start: 5, end: 5}]
 */
function groupConsecutive(indices) {
    if (!indices.length) return [];

    // 1. Sort indices based on their position in the week (Mo->Su)
    // ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0] so we map input days to their 0-6 index in this array
    const orderedIndices = indices.map(d => ORDERED_DAYS.indexOf(d)).sort((a, b) => a - b);

    const ranges = [];
    let start = orderedIndices[0];
    let prev = orderedIndices[0];

    // 2. Iterate and check if current index is exactly previous index + 1
    for (let i = 1; i < orderedIndices.length; i++) {
        if (orderedIndices[i] === prev + 1) {
            prev = orderedIndices[i];
        } else {
            // Gap detected, close current range and start new one
            ranges.push({ start, end: prev });
            start = orderedIndices[i];
            prev = orderedIndices[i];
        }
    }
    ranges.push({ start, end: prev });
    return ranges;
}

function formatDayRanges(days) {
    const ranges = groupConsecutive(days);
    return ranges.map(r => {
        const startDay = REVERSE_DAY_MAP[ORDERED_DAYS[r.start]];
        if (r.start === r.end) return startDay;
        const endDay = REVERSE_DAY_MAP[ORDERED_DAYS[r.end]];
        return `${startDay}-${endDay}`;
    }).join(',');
}

function toOSMFormat(parsed) {
    if (!parsed) return "";

    const groups = [];
    let currentGroup = null;

    // Iterate days in order (Mo->Su) to build groups of identical opening hours
    for (const dayIndex of ORDERED_DAYS) {
        const dayData = parsed[dayIndex];

        if (dayData.closed || !dayData.times.length) {
            // If closed, close current group (gap in opening days)
            if (currentGroup) {
                groups.push(currentGroup);
                currentGroup = null;
            }
            continue;
        }

        const is24h = dayData.times.some(t => t.open === '00:00' && t.close === '24:00');
        const timesStr = dayData.times.map(t => `${t.open}-${t.close}`).join(',');

        // Normalize time string for comparison: if 24/7, force specific string
        const normalizedTimes = is24h ? '00:00-24:00' : timesStr;

        // Verify if we can extend the current group (same hours as previous day)
        if (currentGroup && currentGroup.times === normalizedTimes) {
            currentGroup.days.push(dayIndex);
        } else {
            // Hours changed, save current group and start a new one
            if (currentGroup) groups.push(currentGroup);
            currentGroup = { days: [dayIndex], times: normalizedTimes };
        }
    }
    if (currentGroup) groups.push(currentGroup);


    if (groups.length === 1 && groups[0].days.length === 7 && groups[0].times === '00:00-24:00') {
        return "Mo-Su 00:00-24:00";
    }

    return groups.map(g => {
        const daysStr = formatDayRanges(g.days);
        return `${daysStr} ${g.times}`;
    }).join('; ');
}

module.exports = { parseOpeningHours, formatForDisplay, isCurrentlyOpen, parseTime, parseDays, parseTimeRanges, toOSMFormat };
