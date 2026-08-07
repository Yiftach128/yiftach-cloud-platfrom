import { Router } from 'express';

import type { ImagePresetService } from '../services/images/image-preset-service.ts';

/** GET /images/presets — the catalog of images the platform can create containers from. */
export function getImagePresetsRoute(presets: ImagePresetService): Router {
    return Router().get('/images/presets', (_req, res) => {
        res.json(presets.getPresets());
    });
}
