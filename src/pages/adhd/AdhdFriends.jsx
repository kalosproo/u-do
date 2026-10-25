import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronRight, FiUserPlus } from "react-icons/fi";

import { AdhdPage, FullView } from "../../components/adhd/AdhdUI";
import { useWarm } from "../../components/adhd/useWarm";
import { useAuth } from "../../hooks/useAuth";
import { readPresence } from "../../services/focusSync";
import { acceptFriendRequest, declineFriendRequest, listFriends, listIncomingRequests } from "../../services/friends";

const initial = (name) => (name || "U").trim().charAt(0).toUpperCase();

function Avatar({ name, photo }) {
  return photo ? <img className="adhd-avatar" src={photo} alt="" referrerPolicy="no-referrer" /> : <span className="adhd-avatar">{initial(name)}</span>;
}

/**
 * Friends in ADHD mode: who wants to connect, and your people — with a dot
 * for anyone focusing right now, which is a nice nudge to start too.
 * Finding someone new lives in the full view.
 */
function AdhdFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useWarm(user ? `${user.uid}:friends` : "");
  const [incoming, setRequests] = useWarm(user ? `${user.uid}:requests` : "");
  const [presence, setFocusing] = useWarm(user ? `${user.uid}:focusing` : "");
  const requests = incoming || [];
  const focusing = presence || {};
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const [people, incoming] = await Promise.all([listFriends(user.uid).catch(() => []), listIncomingRequests(user.uid).catch(() => [])]);
    setFriends(people.sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setRequests(incoming);
    const live = await Promise.all(people.map(async (person) => [person.uid, Boolean(await readPresence(person.uid))]));
    setFocusing(Object.fromEntries(live));
  }, [user, setFocusing, setFriends, setRequests]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const answer = async (request, accept) => {
    setBusy(request.uid);
    try {
      if (accept) await acceptFriendRequest(user, request.uid);
      else await declineFriendRequest(user, request.uid);
    } finally {
      setBusy("");
      load();
    }
  };

  const live = (friends || []).filter((person) => focusing[person.uid]).length;

  return (
    <AdhdPage
      title="Friends"
      sub={friends === null ? " " : live ? `${live} focusing right now. Want to join them?` : friends.length ? "Nobody's focusing right now." : "Study's easier with someone. Add a friend."}
      action={<FullView to="/friends?full=1" />}
    >
      {requests.length ? (
        <section className="adhd-list-block">
          <p className="adhd-eyebrow">Wants to connect</p>
          <ul className="adhd-people adhd-card adhd-group">
            {requests.map((request) => (
              <li key={request.uid} className="adhd-person is-request">
                <Avatar name={request.displayName || request.username} photo={request.photoURL} />
                <span className="adhd-person-name">
                  <strong>{request.displayName || request.username || "Someone"}</strong>
                  {request.username ? <small>@{request.username}</small> : null}
                </span>
                <span className="adhd-person-actions">
                  <button type="button" className="adhd-btn adhd-btn-primary adhd-btn-sm" disabled={busy === request.uid} onClick={() => answer(request, true)}>
                    Accept
                  </button>
                  <button type="button" className="adhd-btn adhd-btn-sm" disabled={busy === request.uid} onClick={() => answer(request, false)}>
                    Not now
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {friends === null ? (
        <div className="adhd-skeleton" aria-busy="true" aria-label="Loading friends">
          <span />
          <span />
        </div>
      ) : friends.length ? (
        <ul className="adhd-people adhd-card adhd-group">
          {friends.map((person) => (
            <li key={person.uid} className="adhd-person">
              <Avatar name={person.displayName} photo={person.photoURL} />
              <span className="adhd-person-name">
                <strong>{person.displayName}</strong>
                <small>{focusing[person.uid] ? "Focusing now" : person.username ? `@${person.username}` : ""}</small>
              </span>
              {focusing[person.uid] ? <span className="adhd-pulse" aria-label="Focusing now" /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Link to="/friends?full=1" className="adhd-card adhd-link-card">
        <FiUserPlus aria-hidden="true" />
        <span>
          <strong>Add a friend</strong>
          <small>Find them by username or share your link</small>
        </span>
        <FiChevronRight className="adhd-link-card-go" aria-hidden="true" />
      </Link>
    </AdhdPage>
  );
}

export default AdhdFriends;
