import type { ImagePreset } from './interfaces.ts';

/** Grafana 13.1, official image. Grafana publishes no major-only tag, so the minor is pinned. */
export const grafanaPreset: ImagePreset = {
    name: 'grafana',
    displayName: 'Grafana',
    description: 'Dashboards and visualization for metrics, logs, and traces.',
    image: 'grafana/grafana:13.1',
    containerPort: 3000,
    envVars: [
        {
            name: 'GF_SECURITY_ADMIN_USER',
            description: 'Admin username.',
            required: false,
            defaultValue: 'admin',
        },
        {
            name: 'GF_SECURITY_ADMIN_PASSWORD',
            description:
                'Initial admin password; Grafana asks to change it on first login. '
                + 'Defaults to "admin".',
            required: false,
        },
    ],
};
