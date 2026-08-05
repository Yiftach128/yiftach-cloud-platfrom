/** Formatting helpers for the image list. */

/** Human-readable image size, e.g. "182.4 MB". Decimal units, matching `docker images`. */
export function formatSizeBytes(sizeBytes: number): string {
    if (sizeBytes < 1000) {
        return `${sizeBytes} B`;
    }
    if (sizeBytes < 1000 * 1000) {
        return `${(sizeBytes / 1000).toFixed(1)} kB`;
    }
    if (sizeBytes < 1000 * 1000 * 1000) {
        return `${(sizeBytes / (1000 * 1000)).toFixed(1)} MB`;
    }
    return `${(sizeBytes / (1000 * 1000 * 1000)).toFixed(2)} GB`;
}

/** Shortens "sha256:<64 hex>" to Docker's familiar 12-character short id. */
export function shortImageId(id: string): string {
    const prefix: string = 'sha256:';
    let hex: string;
    if (id.startsWith(prefix)) {
        hex = id.substring(prefix.length);
    } else {
        hex = id;
    }
    return hex.substring(0, 12);
}
