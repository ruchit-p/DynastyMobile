interface VideoPlayerProps {
  url: string;
}

export default function VideoPlayer({ url }: VideoPlayerProps) {
  return (
    <div className="aspect-video w-full">
      <video
        src={url}
        controls
        className="w-full h-full rounded-lg"
        preload="metadata"
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
} 