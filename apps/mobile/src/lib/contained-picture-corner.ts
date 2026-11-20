/**
 * Where something sits at the bottom-end corner of a picture drawn with
 * `contentFit="contain"` (RAPP-892), such as the report flag on a gallery photo.
 *
 * A contained picture keeps its own shape inside the frame, so a picture of
 * another shape leaves an empty band on two sides. The band is the same on
 * both sides, so the picture's bottom-end corner is that far in from the
 * frame's, and the inset is added on top. Start and end mirror in right to
 * left by themselves, because the band is even.
 */
export function containedPictureCornerOffsets({
  frameWidth,
  frameAspectRatio,
  pictureAspectRatio,
  inset,
}: {
  readonly frameWidth: number;
  /** Width over height of the frame. */
  readonly frameAspectRatio: number;
  /** Width over height of the picture itself. */
  readonly pictureAspectRatio: number;
  readonly inset: number;
}): { readonly end: number; readonly bottom: number } {
  const frameHeight = frameWidth / frameAspectRatio;
  const isWiderThanFrame = pictureAspectRatio >= frameAspectRatio;
  const pictureWidth = isWiderThanFrame ? frameWidth : frameHeight * pictureAspectRatio;
  const pictureHeight = isWiderThanFrame ? frameWidth / pictureAspectRatio : frameHeight;
  return {
    end: (frameWidth - pictureWidth) / 2 + inset,
    bottom: (frameHeight - pictureHeight) / 2 + inset,
  };
}
