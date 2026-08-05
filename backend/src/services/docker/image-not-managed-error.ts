/**
 * A delete targeted an image that does not carry the platform's managed label —
 * i.e. an image the platform did not build. Mapped to 409 by the error handler:
 * the image exists, but being unmanaged conflicts with the requested operation.
 */
export class ImageNotManagedError extends Error {
    /** The image id or reference the request named. */
    readonly image: string;

    constructor(image: string) {
        super(
            `Image "${image}" is not managed by this platform`
                + ' (no cloudplatform.managed=true label); refusing to delete it',
        );
        this.name = 'ImageNotManagedError';
        this.image = image;
    }
}
