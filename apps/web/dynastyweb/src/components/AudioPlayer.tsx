interface AudioPlayerProps {
  url: string;
}

export default function AudioPlayer({ url }: AudioPlayerProps) {
  return (
    <div className="w-full">
      <audio
        src={url}
        controls
        className="w-full rounded-lg"
        preload="metadata"
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
} 