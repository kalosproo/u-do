/**
 * Everyone's voice on the call. It lives outside the study room panel, so
 * the call keeps sounding while you move to Tasks or the Planner; the video
 * tiles are muted and only show pictures.
 */
function RoomAudio({ peers }) {
  const audible = peers.filter((peer) => peer.stream?.getAudioTracks().length);
  if (!audible.length) return null;

  return (
    <div hidden>
      {audible.map((peer) => (
        <audio
          key={peer.session}
          autoPlay
          playsInline
          ref={(element) => {
            if (element && element.srcObject !== peer.stream) element.srcObject = peer.stream;
          }}
        />
      ))}
    </div>
  );
}

export default RoomAudio;
