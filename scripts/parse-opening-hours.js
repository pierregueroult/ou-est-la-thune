/**
 * OSM opening_hours parser
 * inspired by open-source parsing found on github (lost the link :/)
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


const MANUAL_OVERRIDES = {
    "Du lundi au samedi, uniquement sur rendez-vous": null,
    "Jorraire a la con ... mar-ven : 8H45-12H30, 13H45-17H45. Jeu : 8H45-12H30, 14H45-17H45. Sam : 8H45-13H00": "Tu-Fr 08:45-12:30,13:45-17:45; Th 08:45-12:30,14:45-17:45; Sa 08:45-13:00",
    "Lundi : fermé ; Mardi, mercredi, jeudi, vendredi 08:45-12:00 13:30-17:45 ; Samedi 08:45-12:00 13:30-16:00": "Mo off; Tu-Fr 08:45-12:00,13:30-17:45; Sa 08:45-12:00,13:30-16:00",
    "Lundi au samedi sur rdv": null,
    "Rendez vous uniquement ( COVID)": null,
    "Sur rendez vous": null,
    "\"sur rendez-vous\"": null,
    "on appointment": null,
    "ouvert sur rendez-vous sur bred.fr, appli BRED, ou 0806060211": null,
    "réception clients sur rendez vous": null,
    "sur RDV": null,
    "sur rdv, tel 04 84 68 84 20": null,
    "sur rendez-vous": null,
    "uniquement sur rdv l'après-midi": null,
    "uniquement sur rendez-vous l'après-midi": null,
    "Crédit Agricole": null,
    "H24": "Mo-Su 00:00-24:00",
    "Mo-Sa 9:30-20:-30": "Mo-Sa 09:30-20:30",
};

const FRENCH_DAYS = {
    lundi: 'Mo', mardi: 'Tu', mercredi: 'We', jeudi: 'Th', vendredi: 'Fr', samedi: 'Sa', dimanche: 'Su',
    lun: 'Mo', mar: 'Tu', mer: 'We', jeu: 'Th', ven: 'Fr', sam: 'Sa', dim: 'Su'
};
const FRENCH_DAY_REGEX = new RegExp(Object.keys(FRENCH_DAYS).join('|') + '\\.?', 'gi');

function preprocess(str) {
    if (!str) return str;

    const cleanStr = str.replace(/^["']|["']$/g, '').trim();
    if (cleanStr in MANUAL_OVERRIDES) return MANUAL_OVERRIDES[cleanStr];

    return cleanStr
        .replace(FRENCH_DAY_REGEX, m => FRENCH_DAYS[m.replace('.', '').toLowerCase()])
        .replace(/\s+(au|à)\s+/gi, '-')
        .replace(/ferm[ée]s?/gi, 'off')
        .replace(/(\d{1,2})[hH](\d{2})/g, '$1:$2')
        .replace(/:(\W)(\d{2})/, ':$2')
        .replace(/\b(\d{2})(\d{2})\b/g, (m, h, min) =>
            +h <= 24 && +min < 60 ? `${h}:${min}` : m
        );
}


function parseOpeningHours(str) {
    if (!str || typeof str !== 'string') return null;

    str = preprocess(str);
    if (!str) return null;

    str = str.replace(/(\d)\s*,\s*([a-zA-Z]{2,3})/g, '$1; $2');

    const result = Object.fromEntries(ALL_DAYS.map(d => [d, { day: DAY_NAMES[d], times: [], closed: false }]));

    str.split(';').forEach(rule => {
        const trimmed = rule.trim();
        if (!trimmed) return;

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


function groupConsecutive(indices) {
    if (!indices.length) return [];

    const orderedIndices = indices.map(d => ORDERED_DAYS.indexOf(d)).sort((a, b) => a - b);

    const ranges = [];
    let start = orderedIndices[0];
    let prev = orderedIndices[0];


    for (let i = 1; i < orderedIndices.length; i++) {
        if (orderedIndices[i] === prev + 1) {
            prev = orderedIndices[i];
        } else {
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

    for (const dayIndex of ORDERED_DAYS) {
        const dayData = parsed[dayIndex];

        if (dayData.closed || !dayData.times.length) {
            if (currentGroup) {
                groups.push(currentGroup);
                currentGroup = null;
            }
            continue;
        }

        const is24h = dayData.times.some(t => t.open === '00:00' && t.close === '24:00');
        const timesStr = dayData.times.map(t => `${t.open}-${t.close}`).join(',');

        const normalizedTimes = is24h ? '00:00-24:00' : timesStr;

        if (currentGroup && currentGroup.times === normalizedTimes) {
            currentGroup.days.push(dayIndex);
        } else {
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
