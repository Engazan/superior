interface Props {
  dataUrl: string
  alt: string
}

/** Native image preview. The data URL is read-only; the file is never written. */
export function ImageFilePreview({ dataUrl, alt }: Props): JSX.Element {
  return (
    <div className="grid h-full place-items-center overflow-auto p-4">
      <img
        src={dataUrl}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  )
}
