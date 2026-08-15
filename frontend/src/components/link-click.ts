import type { MouseEvent } from 'react';
import type { NavigateFunction } from 'react-router';

/**
 * Shared onClick for antd-owned anchors (Button href, Typography.Link) that
 * navigate in-app: a plain left click is intercepted and routed through the
 * SPA router; modified clicks (ctrl/meta/shift/alt) and non-left buttons are
 * left to the browser so the real href opens in a new tab or window.
 * react-router's <Link> does this itself — use it where antd is not the one
 * rendering the anchor.
 */
export function navigateOnPlainClick(
    event: MouseEvent<HTMLElement>,
    navigate: NavigateFunction,
    path: string,
): void {
    if (event.defaultPrevented) {
        return;
    }
    if (event.button !== 0) {
        return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
    }
    event.preventDefault();
    navigate(path);
}
