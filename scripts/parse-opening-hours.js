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

function toOSMFormat(parsed) {
    if (!parsed) return "";

    // Order: Mo(1) to Su(0)
    const orderedDays = [1, 2, 3, 4, 5, 6, 0];
    const groups = [];
    let currentGroup = null;

    for (const dayIndex of orderedDays) {
        const dayData = parsed[dayIndex];
        const timesStr = dayData.times
            .map(t => `${t.open}-${t.close}`)
            .join(',');

        // 24/7 check per day
        const is24h = dayData.times.some(t => t.open === '00:00' && t.close === '24:00');
        const formattedTimes = is24h ? '24/7' : timesStr;

        if (dayData.closed || !dayData.times.length) {
            if (currentGroup) {
                groups.push(currentGroup);
                currentGroup = null;
            }
            continue;
        }

        if (currentGroup && currentGroup.times === formattedTimes) {
            currentGroup.days.push(dayIndex);
        } else {
            if (currentGroup) {
                groups.push(currentGroup);
            }
            currentGroup = {
                days: [dayIndex],
                times: formattedTimes
            };
        }
    }
    if (currentGroup) groups.push(currentGroup);

    const allDaysOpenSame = groups.length === 1 && groups[0].days.length === 7;
    if (allDaysOpenSame && groups[0].times === '24/7') {
        return "Mo-Su 00:00-24:00";
    }

    return groups.map(g => {
        let dayRange = "";
        const days = g.days;

        let ranges = [];
        let start = 0;

        const orderedIndices = days.map(d => orderedDays.indexOf(d));

        let rangeStart = orderedIndices[0];
        let prev = orderedIndices[0];

        for (let i = 1; i < orderedIndices.length; i++) {
            if (orderedIndices[i] === prev + 1) {
                prev = orderedIndices[i];
            } else {
                ranges.push({ start: rangeStart, end: prev });
                rangeStart = orderedIndices[i];
                prev = orderedIndices[i];
            }
        }
        ranges.push({ start: rangeStart, end: prev });

        dayRange = ranges.map(r => {
            if (r.start === r.end) return REVERSE_DAY_MAP[orderedDays[r.start]];
            return REVERSE_DAY_MAP[orderedDays[r.start]] + "-" + REVERSE_DAY_MAP[orderedDays[r.end]];
        }).join(',');

        let times = g.times;
        if (times === '24/7') {
            times = '00:00-24:00';
        }
        return `${dayRange} ${times}`;
    }).join('; ');
}

module.exports = { parseOpeningHours, formatForDisplay, isCurrentlyOpen, parseTime, parseDays, parseTimeRanges, toOSMFormat };
