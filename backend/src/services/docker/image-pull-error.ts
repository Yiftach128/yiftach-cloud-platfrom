/**
 * Pulling an image from its registry failed. The dominant cause is an image or
 * tag that does not exist, so the error handler maps this to 404; the daemon's
 * own message (kept in `message`) carries the true cause either way.
 */
export class ImagePullError extends Error {
    /** The image reference that could not be pulled. */
    readonly image: string;

    constructor(image: string, detail: string) {
        super(`Cannot pull image "${image}": ${detail}`);
        this.name = 'ImagePullError';
        this.image = image;
    }
}
