import type { ImagePreset } from './interfaces.ts';

/**
 * MongoDB 8, official image. Root credentials are optional, but the image only
 * enables authentication when username and password are set together.
 */
export const mongoPreset: ImagePreset = {
    name: 'mongo',
    displayName: 'MongoDB',
    description: 'Document database for JSON-like data.',
    image: 'mongo:8',
    containerPort: 27017,
    envVars: [
        {
            name: 'MONGO_INITDB_ROOT_USERNAME',
            description:
                'Root username. Set together with MONGO_INITDB_ROOT_PASSWORD to enable '
                + 'authentication; leave both unset to run without auth.',
            required: false,
        },
        {
            name: 'MONGO_INITDB_ROOT_PASSWORD',
            description: 'Root password. Required whenever MONGO_INITDB_ROOT_USERNAME is set.',
            required: false,
        },
    ],
};
