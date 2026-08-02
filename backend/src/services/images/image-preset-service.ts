/**
 * Image preset catalog — the fixed set of Docker images the platform knows how to
 * create containers from. Pure data, no daemon access.
 */

import type { ImagePreset } from './interfaces.ts';
import { mongoPreset } from './mongo-preset.ts';
import { postgresPreset } from './postgres-preset.ts';
import { redisPreset } from './redis-preset.ts';

export * from './interfaces.ts';

export class ImagePresetService {
    /** All presets, in stable display order. Returns a fresh array each call. */
    getPresets(): ImagePreset[] {
        return [mongoPreset, redisPreset, postgresPreset];
    }
}
