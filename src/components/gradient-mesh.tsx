/** Fixed, decorative ambient background — three soft color blobs (see .gradient-mesh in globals.css). Purely visual, no interaction. */
export function GradientMesh() {
  return (
    <div className="gradient-mesh" aria-hidden="true">
      <div className="mesh-blob" />
    </div>
  );
}
