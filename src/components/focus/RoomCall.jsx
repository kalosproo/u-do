import { useRef } from "react";
import { FiMaximize, FiMic, FiMicOff, FiPhoneOff, FiVideo, FiVideoOff } from "react-icons/fi";

import { useAuth } from "../../hooks/useAuth";
import { useStudyRoom } from "../../hooks/useStudyRoom";
import { MAX_ON_CALL } from "../../utils/roomCall";

const initial = (name) => (name || "U").trim().charAt(0).toUpperCase();

/** A muted picture of a stream; the sound plays elsewhere (RoomAudio). */
function Picture({ stream, mirrored }) {
  return (
    <video
      className={mirrored ? "call-video is-mirrored" : "call-video"}
      autoPlay
      playsInline
      muted
      ref={(element) => {
        if (element && element.srcObject !== stream) element.srcObject = stream;
      }}
    />
  );
}

function Tile({ name, stream, mirrored, cam, mic, quality, status, reason, onRetry }) {
  const showVideo = cam && stream?.getVideoTracks().length;
  return (
    <figure className={`call-tile${showVideo ? "" : " is-off"}`}>
      {showVideo ? <Picture stream={stream} mirrored={mirrored} /> : <span className="call-tile-avatar">{initial(name)}</span>}
      {status ? (
        <span className="call-tile-status">
          {status}
          {reason ? <small>{reason}</small> : null}
          {onRetry ? (
            <button type="button" className="call-tile-retry" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </span>
      ) : null}
      <figcaption>
        {mic ? null : <FiMicOff aria-label="Muted" />}
        <span>{name}</span>
        {showVideo && quality ? <small>{quality}</small> : null}
      </figcaption>
    </figure>
  );
}

/**
 * The video call inside a study room: join with camera and mic off, then
 * turn on what you want. Up to MAX_ON_CALL people, each from one device.
 */
function RoomCall() {
  const { user } = useAuth();
  const study = useStudyRoom();
  const gridRef = useRef(null);
  if (!user || !study?.room) return null;

  const { call, onCall, callHere, callElsewhere } = study;
  const others = onCall.filter((member) => member.uid !== user.uid);
  const full = !callHere && others.length >= MAX_ON_CALL;

  if (!callHere) {
    return (
      <div className="call-join">
        <p className="panel-note">
          {callElsewhere
            ? "You're on the call from your other device."
            : others.length
              ? `${others.length} on the call · camera and mic start off`
              : "Talk and see each other while you study · camera and mic start off"}
        </p>
        <button type="button" className="btn" disabled={full} onClick={study.joinCall}>
          <FiVideo aria-hidden="true" /> {callElsewhere ? "Move call here" : full ? "Call is full" : "Join call"}
        </button>
        {study.notice ? <p className="panel-note">{study.notice}</p> : null}
      </div>
    );
  }

  const peerFor = (member) => call.peers.find((peer) => peer.session === member.session);
  const statusOf = (peer) =>
    !peer || peer.status === "connecting" ? "Connecting…" : peer.status === "failed" ? "Couldn't connect" : null;
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;

  return (
    <div className="call">
      <div ref={gridRef} className={`call-grid is-${Math.min(others.length + 1, 4)}`}>
        <Tile name="You" stream={call.local.video} mirrored cam={Boolean(call.local.video)} mic={call.local.audio} />
        {others.map((member) => {
          const peer = peerFor(member);
          return (
            <Tile
              key={member.uid}
              name={member.name.split(" ")[0]}
              stream={peer?.stream}
              cam={member.cam}
              mic={member.mic}
              quality={peer?.receiving}
              status={statusOf(peer)}
              reason={peer?.reason}
              onRetry={peer?.status === "failed" ? study.retryCall : null}
            />
          );
        })}
      </div>

      <div className="call-controls" role="group" aria-label="Call controls">
        <button
          type="button"
          className={`call-button${call.local.audio ? " is-on" : ""}`}
          aria-pressed={call.local.audio}
          onClick={study.toggleMic}
        >
          {call.local.audio ? <FiMic aria-hidden="true" /> : <FiMicOff aria-hidden="true" />}
          <span>{call.local.audio ? "Mute" : "Unmute"}</span>
        </button>
        <button
          type="button"
          className={`call-button${call.local.video ? " is-on" : ""}`}
          aria-pressed={Boolean(call.local.video)}
          onClick={study.toggleCam}
        >
          {call.local.video ? <FiVideo aria-hidden="true" /> : <FiVideoOff aria-hidden="true" />}
          <span>{call.local.video ? "Stop video" : "Start video"}</span>
        </button>
        {canFullscreen ? (
          <button type="button" className="call-button" onClick={() => gridRef.current?.requestFullscreen?.().catch(() => {})}>
            <FiMaximize aria-hidden="true" />
            <span>Full screen</span>
          </button>
        ) : null}
        <button type="button" className="call-button is-leave" onClick={study.leaveCall}>
          <FiPhoneOff aria-hidden="true" />
          <span>Leave call</span>
        </button>
      </div>

      {study.notice ? <p className="panel-note">{study.notice}</p> : null}
      {call.local.audio ? <p className="panel-note">Use earphones for the best sound — no echo for anyone.</p> : null}
    </div>
  );
}

export default RoomCall;
