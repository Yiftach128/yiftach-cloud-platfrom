/**
 * Public types for the image preset service.
 *
 * A preset describes one Docker image the platform knows how to create containers
 * from: what to pull, which port the service listens on, and which environment
 * variables the client must or may supply.
 */

/** One environment variable a preset's image understands. */
export interface PresetEnvVar {
    /** Variable name exactly as the image expects it, e.g. "POSTGRES_PASSWORD". */
    name: string;
    /** What the variable controls, shown next to the client's input. */
    description: string;
    /** True when the container cannot start without a value. */
    required: boolean;
    /**
     * Static value the image falls back to when unset. Omitted when the image has
     * no static default (dynamic defaults are described in `description` instead).
     */
    defaultValue?: string;
}

export interface ImagePreset {
    /** Stable identifier clients reference when creating a container, e.g. "mongo". */
    name: string;
    /** Human-readable label, e.g. "MongoDB". */
    displayName: string;
    /** One-sentence description for the catalog UI. */
    description: string;
    /** Full image reference to create from, e.g. "mongo:8" (pinned major). */
    image: string;
    /** Port the service listens on inside the container. */
    containerPort: number;
    /** Environment variables the client can or must supply. Empty when the image needs none. */
    envVars: PresetEnvVar[];
}
