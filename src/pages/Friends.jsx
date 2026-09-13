import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiCheck, FiCopy, FiUserPlus, FiX } from "react-icons/fi";
import { auth } from "../services/firebase";
import {
  acceptFriendRequest,
  buildInviteLink,
  claimUsername,
  declineFriendRequest,
  findUserByInviteCode,
  findUserByUsername,
  getMyProfile,
  listFriends,
  listIncomingRequests,
  normalizeInviteCode,
  normalizeUsername,
  removeFriend,
  sendFriendRequest,
  validateUsername,
} from "../services/friends";

const SEARCH_MODES = [
  ["username", "By username"],
  ["code", "By invite code"],
];

const unitFor = (frequency) => (frequency === "weekly" ? "week" : "day");

function HabitRow({ habit }) {
  return (
    <div className="friend-habit-row">
      <span className="friend-habit-title">{habit.title}</span>

      <div className="tiny-dots" aria-hidden>
        {(habit.dots || []).map((done, index) => (
          <em key={`${habit.id}-${index}`} className={done ? "filled" : "empty"} />
        ))}
      </div>

      <small className="friend-habit-rate">{habit.completionRate}%</small>
      <strong className="friend-habit-streak">
        {habit.streak} {unitFor(habit.frequency)}
        {habit.streak === 1 ? "" : "s"}
      </strong>
    </div>
  );
}

function Avatar({ person }) {
  const label = person.displayName || person.username || "U";

  if (person.photoURL) {
    return <img src={person.photoURL} alt="" className="friend-avatar friend-avatar-image" />;
  }

  return <span className="friend-avatar">{label.trim().charAt(0).toUpperCase()}</span>;
}

function Friends() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = auth.currentUser;

  const [profile, setProfile] = useState(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const [searchMode, setSearchMode] = useState("username");
  const [searchValue, setSearchValue] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState("");
  const [status, setStatus] = useState("");

  const inviteLink = useMemo(
    () => (profile?.inviteCode ? buildInviteLink(profile.inviteCode) : ""),
    [profile]
  );

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [nextRequests, nextFriends] = await Promise.all([
        listIncomingRequests(user.uid),
        listFriends(user.uid),
      ]);
      setRequests(nextRequests);
      setFriends(nextFriends);
    } catch (error) {
      setStatus(error?.message || "Couldn't load your friends right now.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getMyProfile(user.uid)
      .then((myProfile) => {
        if (cancelled) return;
        setProfile(myProfile);
        setUsernameInput(myProfile?.username || "");
      })
      .catch(() => {});

    refresh();

    return () => {
      cancelled = true;
    };
  }, [refresh, user]);

  const runSearch = useCallback(async (mode, value) => {
    setSearching(true);
    setSearchResult(null);
    setStatus("");

    try {
      const found =
        mode === "code" ? await findUserByInviteCode(value) : await findUserByUsername(value);

      if (!found) {
        setStatus(mode === "code" ? "No account uses that invite code." : "No account uses that username.");
        return;
      }

      setSearchResult(found);
    } catch (error) {
      setStatus(error?.message || "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, []);

  // An invite link lands here as /friends?add=CODE.
  const invitedCode = searchParams.get("add");
  useEffect(() => {
    if (!invitedCode || !user) return;

    const code = normalizeInviteCode(invitedCode);
    setSearchMode("code");
    setSearchValue(code);
    runSearch("code", code);

    searchParams.delete("add");
    setSearchParams(searchParams, { replace: true });
  }, [invitedCode, runSearch, searchParams, setSearchParams, user]);

  const handleClaimUsername = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");

    const validationError = validateUsername(usernameInput);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    setSavingUsername(true);
    setStatus("");

    try {
      const saved = await claimUsername(currentUser, usernameInput);
      setProfile(saved);
      setUsernameInput(saved.username);
      setStatus(`Your handle is @${saved.username}.`);
    } catch (error) {
      setStatus(error?.message || "Couldn't save that username.");
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSendRequest = async (targetUid) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");

    setBusyUid(targetUid);
    setStatus("");

    try {
      await sendFriendRequest(currentUser, targetUid);
      setStatus("Request sent. They'll see it on their Friends page.");
      setSearchResult(null);
      setSearchValue("");
    } catch (error) {
      setStatus(error?.message || "Couldn't send that request.");
    } finally {
      setBusyUid("");
    }
  };

  const handleAccept = async (requesterUid) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");

    setBusyUid(requesterUid);
    try {
      await acceptFriendRequest(currentUser, requesterUid);
      await refresh();
    } catch (error) {
      setStatus(error?.message || "Couldn't accept that request.");
    } finally {
      setBusyUid("");
    }
  };

  const handleDecline = async (requesterUid) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");

    setBusyUid(requesterUid);
    try {
      await declineFriendRequest(currentUser, requesterUid);
      setRequests((current) => current.filter((item) => item.uid !== requesterUid));
    } catch (error) {
      setStatus(error?.message || "Couldn't decline that request.");
    } finally {
      setBusyUid("");
    }
  };

  const handleRemove = async (friendUid, name) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");
    if (!window.confirm(`Remove ${name}? You'll both stop seeing each other's streaks.`)) return;

    setBusyUid(friendUid);
    try {
      await removeFriend(currentUser, friendUid);
      setFriends((current) => current.filter((item) => item.uid !== friendUid));
    } catch (error) {
      setStatus(error?.message || "Couldn't remove that friend.");
    } finally {
      setBusyUid("");
    }
  };

  const copyToClipboard = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied.`);
    } catch {
      setStatus(`Couldn't copy automatically — select and copy it manually.`);
    }
  };

  if (!user) {
    return (
      <section className="friends-page">
        <header className="friends-header glass-panel">
          <h2>Friends</h2>
        </header>
        <article className="wire-card friends-empty">
          <p>Log in to share your streaks and follow your friends&apos; habits.</p>
          <button type="button" className="button-primary" onClick={() => navigate("/login")}>
            Log in
          </button>
        </article>
      </section>
    );
  }

  return (
    <section className="friends-page">
      <header className="friends-header glass-panel">
        <h2>Friends</h2>
        <p className="friends-subtitle">
          Friends see your habit names, streaks and completion rates — nothing else.
        </p>
      </header>

      <article className="wire-card friends-handle-card">
        <h3>Your handle</h3>
        <p className="friends-muted">
          {profile?.username
            ? "Friends can find you with any of these."
            : "Pick a username so friends can find and add you."}
        </p>

        <div className="friends-field-row">
          <span className="friends-at">@</span>
          <input
            className="friends-input"
            placeholder="yourname"
            value={usernameInput}
            onChange={(event) => setUsernameInput(normalizeUsername(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleClaimUsername();
            }}
          />
          <button
            type="button"
            className="button-primary"
            onClick={handleClaimUsername}
            disabled={savingUsername}
          >
            {savingUsername ? "Saving..." : profile?.username ? "Change" : "Claim"}
          </button>
        </div>

        {profile?.inviteCode ? (
          <div className="friends-share-grid">
            <div className="friends-share-row">
              <span className="friends-muted">Invite code</span>
              <code className="friends-code">{profile.inviteCode}</code>
              <button
                type="button"
                className="button-secondary friends-copy"
                onClick={() => copyToClipboard(profile.inviteCode, "Invite code")}
              >
                <FiCopy /> Copy
              </button>
            </div>

            <div className="friends-share-row">
              <span className="friends-muted">Invite link</span>
              <code className="friends-code friends-code-link">{inviteLink}</code>
              <button
                type="button"
                className="button-secondary friends-copy"
                onClick={() => copyToClipboard(inviteLink, "Invite link")}
              >
                <FiCopy /> Copy
              </button>
            </div>
          </div>
        ) : null}
      </article>

      <article className="wire-card">
        <h3>Add a friend</h3>

        <div className="friends-mode-row" role="tablist" aria-label="Search mode">
          {SEARCH_MODES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={searchMode === value}
              className={`friends-mode-pill button-secondary ${searchMode === value ? "active" : ""}`}
              onClick={() => {
                setSearchMode(value);
                setSearchValue("");
                setSearchResult(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="friends-field-row">
          {searchMode === "username" ? <span className="friends-at">@</span> : null}
          <input
            className="friends-input"
            placeholder={searchMode === "code" ? "ABCD2345" : "theirname"}
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                searchMode === "code"
                  ? normalizeInviteCode(event.target.value)
                  : normalizeUsername(event.target.value)
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") runSearch(searchMode, searchValue);
            }}
          />
          <button
            type="button"
            className="button-primary"
            onClick={() => runSearch(searchMode, searchValue)}
            disabled={searching || !searchValue}
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {searchResult ? (
          <div className="friends-result-row">
            <Avatar person={searchResult} />
            <div className="friends-result-meta">
              <strong>{searchResult.displayName}</strong>
              {searchResult.username ? <small>@{searchResult.username}</small> : null}
            </div>
            <button
              type="button"
              className="button-primary"
              onClick={() => handleSendRequest(searchResult.uid)}
              disabled={busyUid === searchResult.uid}
            >
              <FiUserPlus /> {busyUid === searchResult.uid ? "Sending..." : "Send request"}
            </button>
          </div>
        ) : null}
      </article>

      {requests.length > 0 && (
        <article className="wire-card">
          <h3>Requests ({requests.length})</h3>
          <div className="friends-request-list">
            {requests.map((request) => (
              <div key={request.uid} className="friends-result-row">
                <Avatar person={request} />
                <div className="friends-result-meta">
                  <strong>{request.displayName || "U.Do user"}</strong>
                  {request.username ? <small>@{request.username}</small> : null}
                </div>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => handleAccept(request.uid)}
                  disabled={busyUid === request.uid}
                >
                  <FiCheck /> Accept
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleDecline(request.uid)}
                  disabled={busyUid === request.uid}
                >
                  <FiX /> Decline
                </button>
              </div>
            ))}
          </div>
        </article>
      )}

      <article className="wire-card">
        <h3>Their streaks</h3>

        {loading ? (
          <p className="friends-muted">Loading your friends...</p>
        ) : friends.length === 0 ? (
          <p className="friends-muted">
            No friends yet. Share your invite link or search for their username above.
          </p>
        ) : (
          <div className="friends-list">
            {friends.map((friend) => (
              <section key={friend.uid} className="friend-card">
                <header className="friend-card-header">
                  <Avatar person={friend} />
                  <div className="friends-result-meta">
                    <strong>{friend.displayName}</strong>
                    {friend.username ? <small>@{friend.username}</small> : null}
                  </div>

                  {friend.summary ? (
                    <div className="friend-headline">
                      <span className="friends-muted">Longest streak</span>
                      <strong>{friend.summary.longestStreak}</strong>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => handleRemove(friend.uid, friend.displayName)}
                    disabled={busyUid === friend.uid}
                  >
                    Remove
                  </button>
                </header>

                {!friend.summary ? (
                  <p className="friends-muted">
                    Nothing shared yet — they need to open their Habits page once.
                  </p>
                ) : friend.summary.totalCount === 0 ? (
                  <p className="friends-muted">No habits tracked yet.</p>
                ) : (
                  <>
                    <p className="friends-muted">
                      {friend.summary.doneCount} of {friend.summary.totalCount} done this window
                    </p>
                    <div className="friend-habit-list">
                      {friend.summary.habits.map((habit) => (
                        <HabitRow key={habit.id} habit={habit} />
                      ))}
                    </div>
                  </>
                )}
              </section>
            ))}
          </div>
        )}
      </article>

      {status ? <p className="friends-status">{status}</p> : null}
    </section>
  );
}

export default Friends;
