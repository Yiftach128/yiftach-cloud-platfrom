/** Formatting helpers for the build-agents table. */

/** Uptime as the two largest units: "2d 4h", "3h 12m", "5m 30s" or "42s". */
export function formatUptime(startedAtIso: string): string {
    let totalSeconds: number = Math.floor((Date.now() - Date.parse(startedAtIso)) / 1000);
    if (totalSeconds < 0) {
        totalSeconds = 0;
    }
    const days: number = Math.floor(totalSeconds / 86_400);
    const hours: number = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes: number = Math.floor((totalSeconds % 3_600) / 60);
    const seconds: number = totalSeconds % 60;
    if (days > 0) {
        return `${days}d ${hours}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}
