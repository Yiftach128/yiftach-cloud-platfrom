/**
 * Turns a raw `GET /containers/{id}/logs` payload into log lines. Three wire
 * details are quarantined here:
 *
 * - Non-TTY containers emit Docker's multiplexed stream framing: each frame is an
 *   8-byte header (byte 0 = stream type, bytes 1-3 zero, bytes 4-7 = big-endian
 *   payload length) followed by the payload. TTY containers emit raw bytes.
 * - docker-modem resolves non-stream responses as `parseJSON(body) || buffer`, so a
 *   TTY container whose entire output happens to parse as JSON arrives as a parsed
 *   value instead of a Buffer.
 * - Logs are always requested with timestamps, so every line arrives prefixed with
 *   an RFC3339Nano timestamp and one space; the prefix becomes the line's
 *   `timestamp` field.
 */

import type { ContainerLogLine } from './interfaces.ts';

const STREAM_TYPE_STDERR = 2;
const FRAME_HEADER_LENGTH = 8;

export function parseContainerLogs(payload: unknown, tty: boolean): ContainerLogLine[] {
    const buffer = toBuffer(payload);
    if (tty) {
        return parseRawStream(buffer);
    }
    return parseMultiplexedStream(buffer);
}

function toBuffer(payload: unknown): Buffer {
    if (Buffer.isBuffer(payload)) {
        return payload;
    }
    if (typeof payload === 'string') {
        return Buffer.from(payload, 'utf8');
    }
    return Buffer.from(JSON.stringify(payload), 'utf8');
}

/** TTY output: one raw byte stream, no framing, everything counts as stdout. */
function parseRawStream(buffer: Buffer): ContainerLogLine[] {
    const lines: ContainerLogLine[] = [];
    const segments = buffer.toString('utf8').split('\n');
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment === undefined) {
            continue;
        }
        if (i === segments.length - 1 && segment === '') {
            continue; // trailing newline, not an empty last line
        }
        lines.push(toLogLine('stdout', segment));
    }
    return lines;
}

/**
 * Non-TTY output: walk the frames, reassemble lines per stream. The json-file log
 * driver emits one frame per line, so the per-stream carry for a frame that stops
 * mid-line is almost always empty — it exists for other drivers and for safety.
 */
function parseMultiplexedStream(buffer: Buffer): ContainerLogLine[] {
    const lines: ContainerLogLine[] = [];
    const carry: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

    let offset = 0;
    while (offset + FRAME_HEADER_LENGTH <= buffer.length) {
        const streamType = buffer.readUInt8(offset);
        const payloadLength = buffer.readUInt32BE(offset + 4);

        let end = offset + FRAME_HEADER_LENGTH + payloadLength;
        if (end > buffer.length) {
            end = buffer.length; // truncated trailing frame: keep what is there
        }
        const chunk = buffer.toString('utf8', offset + FRAME_HEADER_LENGTH, end);
        offset = end;

        let stream: 'stdout' | 'stderr';
        if (streamType === STREAM_TYPE_STDERR) {
            stream = 'stderr';
        } else {
            stream = 'stdout'; // 0 (stdin) and unknown types fold into stdout
        }

        const segments = (carry[stream] + chunk).split('\n');
        const lastSegment = segments[segments.length - 1];
        if (lastSegment === undefined) {
            carry[stream] = '';
        } else {
            carry[stream] = lastSegment; // '' when the chunk ended on a newline
        }
        for (let i = 0; i < segments.length - 1; i++) {
            const segment = segments[i];
            if (segment === undefined) {
                continue;
            }
            lines.push(toLogLine(stream, segment));
        }
    }

    if (carry.stdout !== '') {
        lines.push(toLogLine('stdout', carry.stdout));
    }
    if (carry.stderr !== '') {
        lines.push(toLogLine('stderr', carry.stderr));
    }
    return lines;
}

/**
 * Splits the timestamp prefix ("2026-08-02T18:46:42.037262344Z message") off a
 * reassembled line. Every line should carry one, since logs are always requested
 * with timestamps; a line that unexpectedly does not becomes all text.
 */
function toLogLine(stream: 'stdout' | 'stderr', rawLine: string): ContainerLogLine {
    const line = stripTrailingCr(rawLine);

    const separator = line.indexOf(' ');
    if (separator === -1) {
        return { stream: stream, timestamp: '', text: line };
    }

    const prefix = line.slice(0, separator);
    if (Number.isNaN(new Date(prefix).getTime())) {
        return { stream: stream, timestamp: '', text: line };
    }
    return { stream: stream, timestamp: prefix, text: line.slice(separator + 1) };
}

function stripTrailingCr(line: string): string {
    if (line.endsWith('\r')) {
        return line.slice(0, -1);
    }
    return line;
}
