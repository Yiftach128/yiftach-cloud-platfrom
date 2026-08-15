import { useState } from 'react';
import type { ReactElement } from 'react';

import type { PresetIconProps } from './interfaces.ts';

/** Square edge of the icon box, px; fixed via width/height attributes so loading causes no layout shift. */
const ICON_SIZE = 40;

/** Vite serves these straight from public/; the file for a preset is `<name>.svg`. */
const ICONS_BASE_PATH = '/icons/';

/** Generic grey glyph shown when a preset has no icon file of its own. */
const DEFAULT_ICON_PATH = '/icons/default.svg';

/**
 * Brand icon for a preset managed service, keyed by the preset's `name`.
 * Falls back to the default icon when `/icons/<name>.svg` fails to load.
 */
function PresetIcon(props: PresetIconProps): ReactElement {
    /* The name whose own icon failed, rather than a boolean — comparing it
       against the current prop self-heals if this instance is ever reused
       for a different preset name. */
    const [failedName, setFailedName] = useState<string | null>(null);

    let src: string;
    if (failedName === props.name) {
        src = DEFAULT_ICON_PATH;
    } else {
        src = ICONS_BASE_PATH + props.name + '.svg';
    }

    /* If default.svg itself is missing this re-sets the same value; React
       bails out and src never changes, so the browser cannot request-loop. */
    const handleError = (): void => {
        setFailedName(props.name);
    };

    return (
        <img
            src={src}
            alt=""
            width={ICON_SIZE}
            height={ICON_SIZE}
            draggable={false}
            onError={handleError}
        />
    );
}

export default PresetIcon;
