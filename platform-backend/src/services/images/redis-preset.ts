import type { ImagePreset } from './interfaces.ts';

/**
 * Redis 8, official image. Takes no environment variables — configuration
 * (including auth) is done via command arguments or a config file.
 */
export const redisPreset: ImagePreset = {
    name: 'redis',
    displayName: 'Redis',
    description: 'In-memory key-value store, typically used as a cache or message broker.',
    image: 'redis:8',
    containerPort: 6379,
    envVars: [],
};
