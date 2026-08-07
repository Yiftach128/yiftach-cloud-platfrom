/**
 * Undoes a dockerode BuildKit-decoder quirk: protobufjs hands it bytes fields as
 * base64 strings, and its `Buffer.from(log.msg)` never decodes them — so build
 * *step output* (RUN commands' stdout) reaches us still base64-encoded, while
 * vertex headers arrive as plain text. A line is decoded only when it is
 * unmistakably base64-encoded readable text; anything else passes through
 * unchanged. Returns the resulting lines (decoded chunks may hold several).
 *
 * Moved from the platform's docker-image-service.ts when builds moved into
 * this service.
 */

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function decodeBuildKitLogLine(line: string): string[] {
    if (line.length < 8 || line.length % 4 !== 0 || !BASE64_PATTERN.test(line)) {
        return [line];
    }

    const decoded: string = Buffer.from(line, 'base64').toString('utf8');
    if (!isReadableText(decoded)) {
        return [line];
    }

    const lines: string[] = [];
    for (const raw of decoded.split('\n')) {
        const text = raw.trimEnd();
        if (text !== '') {
            lines.push(text);
        }
    }
    return lines;
}

/** True when the text holds no control characters beyond tab/newline/CR/ESC (ANSI colors). */
function isReadableText(text: string): boolean {
    if (text.includes('�')) {
        return false; // invalid UTF-8 replacement character — this was not text
    }
    for (const character of text) {
        const code = character.codePointAt(0);
        if (code === undefined) {
            continue;
        }
        const isAllowedControl = code === 9 || code === 10 || code === 13 || code === 27;
        if ((code < 32 && !isAllowedControl) || code === 127) {
            return false;
        }
    }
    return true;
}
