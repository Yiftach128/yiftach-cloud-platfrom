import type { ImagePreset } from './interfaces.ts';

/** PostgreSQL 17, official image. */
export const postgresPreset: ImagePreset = {
    name: 'postgres',
    displayName: 'PostgreSQL',
    description: 'Relational SQL database.',
    image: 'postgres:17',
    containerPort: 5432,
    envVars: [
        {
            name: 'POSTGRES_PASSWORD',
            description: 'Superuser password. The container refuses to start without it.',
            required: true,
        },
        {
            name: 'POSTGRES_USER',
            description: 'Superuser name.',
            required: false,
            defaultValue: 'postgres',
        },
        {
            name: 'POSTGRES_DB',
            description:
                'Name of the default database created on first start. Defaults to the '
                + 'value of POSTGRES_USER.',
            required: false,
        },
    ],
};
