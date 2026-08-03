/**
 * Converts an RFC3339 timestamp into the unix "seconds[.fraction]" form the
 * daemon's log endpoint requires for `since` — unlike the docker CLI, the raw
 * Engine API does not accept date strings there. The fraction digits are carried
 * over as text so nanosecond precision survives; parsing through a JS Date would
 * truncate them to milliseconds.
 */

/**
 * Expects a parseable RFC3339 timestamp, e.g. "2026-08-02T22:21:27.122576307Z".
 * Garbage input yields a string the daemon rejects with a 400.
 */
export function toDaemonTimestamp(timestamp: string): string {
    const dotIndex = timestamp.indexOf('.');
    if (dotIndex === -1) {
        return String(Math.floor(Date.parse(timestamp) / 1000));
    }

    const base = timestamp.slice(0, dotIndex);
    const rest = timestamp.slice(dotIndex + 1);

    // The fraction digits end where the zone designator (Z, +hh:mm, -hh:mm) begins.
    let digitCount = 0;
    while (rest.charAt(digitCount) >= '0' && rest.charAt(digitCount) <= '9') {
        digitCount++;
    }
    if (digitCount === 0) {
        return String(Math.floor(Date.parse(timestamp) / 1000));
    }

    const fraction = rest.slice(0, digitCount);
    const zone = rest.slice(digitCount);
    const seconds = Math.floor(Date.parse(base + zone) / 1000);
    return `${seconds}.${fraction}`;
}
