import fs from 'node:fs';

const SOURCE = 'JSON';

// Logging
export const log = {
    info:  function (log = '', source = 'GENERAL') { info (log, source); },
    warn:  function (log = '', source = 'GENERAL') { warn (log, source); },
    error: function (log = '', source = 'GENERAL') { error(log, source); },
    data:  function (log = '', source = 'GENERAL') { data (log, source); }
}
export function info (log = '', source = 'GENERAL') { if (log) { console.log(`[${getFullTimestamp()}] [${source}] ${log}`); } }
export function warn (log = '', source = 'GENERAL') { if (log) { console.warn(`[${getFullTimestamp()}] [${source}] ${log}`); } }
export function error(log = '', source = 'GENERAL') { if (log) { console.error(`[${getFullTimestamp()}] [${source}] ${log}`); } }
export function data (log = '', source = 'GENERAL') { if (log) { console.info(`[${getFullTimestamp()}] [${source}]`, log)} }

// Timing
export function sleep(seconds) { return new Promise(resolve => setTimeout(resolve, Math.max(seconds, 0) * 1000)); }

// Comparisons
export function equals(first, second) {
    switch (first) {
        case second: return true;
        default: return false;
    }
}

// Timestamps
const short_timespans = ['ms', 's', 'm', 'h', 'd', 'mo', 'y'];
const long_timespans =  ['millisecond', 'second', 'minute', 'hour', 'day', 'month', 'year'];
const timespan_dividers = [0, 1000, 60, 60, 24, 365];

export function getFullTimestamp(date = new Date()) { return `${getDatestamp(date)} ${getTimestamp(date)}`; }
export function getDatestamp(date = new Date()) { return `${date.getDate() < 10 ? '0' : ''}${date.getDate()}-${(1 + date.getMonth()) < 10 ? '0' : ''}${1 + date.getMonth()}-${date.getFullYear()}`; }
export function getTimestamp(date = new Date()) { return `${date.toLocaleTimeString()}`; }
export function getTimeDifference(from = 0, to = 0, shortened_words = true, showMilliseconds = false) {
    const names = shortened_words ? short_timespans : long_timespans;


    const fromTime = new Date(Math.min(from, to));
    const toTime = new Date(Math.max(from, to));

    let years = toTime.getFullYear() - fromTime.getFullYear();
    let months = toTime.getMonth() - fromTime.getMonth();
    let days = toTime.getDate() - fromTime.getDate();
    let hours = toTime.getHours() - fromTime.getHours();
    let minutes = toTime.getMinutes() - fromTime.getMinutes();
    let seconds = toTime.getSeconds() - fromTime.getSeconds();
    let milliseconds = toTime.getMilliseconds() - fromTime.getMilliseconds();

    // Adjust negative values
    if (milliseconds < 0) { milliseconds += 1000; seconds--; }
    if (seconds < 0) { seconds += 60; minutes--; }
    if (minutes < 0) { minutes += 60; hours--; }
    if (hours < 0) { hours += 24; days--; }
    if (days < 0) {
        // Get previous month's last day
        const prevMonth = new Date(toTime.getFullYear(), toTime.getMonth(), 0);
        const lastDayOfPrevMonth = prevMonth.getDate();
        days += lastDayOfPrevMonth;
        months--;
    }
    if (months < 0) { months += 12; years--; }

    // Build array of time components
    const times = [milliseconds, seconds, minutes, hours, days, months, years];

    // Get first non-zero that gets displayed
    let first = 0;
    for (let i = (showMilliseconds ? 0 : 1); i < times.length; i++) {
        if (times[i] > 0) {
            first = i;
            break;
        }
    }

    // Build result string
    let result = '';
    for (let i = times.length - 1; i >= (showMilliseconds ? 0 : 1); i--) {
        if (times[i] > 0) {
            const unit = times[i];
            const name = names[i];
            const plural = unit > 1 && !shortened_words ? 's' : '';
            result += `${result.length > 0 ? (i === first ? ' and ' : ', ') : ''}${unit} ${name}${plural}`;
        }
    }
    return result || '0 ' + names[0];
}

// File handling
export const json = {
    save: function (source, data) { const filepath = new URL(source, import.meta.url); try { fs.writeFileSync(filepath, JSON.stringify(data, null, 2)); } catch (e) { log.warn(`JSON file was not able to be overwritten, does the file exist?`, SOURCE) } },
    load: function (source) { return JSON.parse(fs.readFileSync(new URL(source, import.meta.url))); }
}

// String manipulation
export function concat(list, separator = '', prefix = '', start = 0, count = list.length) {
    const end = Math.min(start + count, list.length);
    let result = '';
    for (let i = start; i < end; i++) { result += (i <= start ? '' : separator) + prefix + list[i]; }
    return result;
}

// Randomizing
export function randomInt(min, max) {
    const _min = Math.min(min, max);
    const _max = Math.max(min, max);
    return Math.floor(_min) + Math.floor(Math.random() * (_max - _min)); }

// Math
export function clamp(value, min, max) {
    const _min = Math.min(min, max);
    const _max = Math.max(min, max);
    return Math.min(Math.max(value, _min), _max);
}

// urlToBase64
export async function urlToBase64(url) {
    try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const response = await fetch(url);
            if (!response.ok) { throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`); }
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            return base64;
        }
    } catch (error) {
        throw new Error(`Error converting URL to base64: ${error.message}`);
    }
}

/**
 * Maps a value on a number range into the same spot of a different number range
 * @param value
 * @param startRange1
 * @param endRange1
 * @param startRange2
 * @param endRange2
 */
export function map(value, startRange1, endRange1, startRange2, endRange2) {
    const diff1 = endRange1 - startRange1;
    const diff2 = endRange2 - startRange2;
    const factor = (value - startRange1) / diff1;
    return (factor * diff2) + startRange2;
}
