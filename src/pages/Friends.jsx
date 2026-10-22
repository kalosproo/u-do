import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthGuard } from "../hooks/useAuthGuard";
import {
  FiCheck,
  FiChevronDown,
  FiCopy,
  FiRefreshCw,
  FiSearch,
  FiShare2,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import {
  CLAIM_ERRORS,
  acceptFollowRequest,
  cancelFriendRequest,
  carryOverFriends,
  clearFriendGraph,
  buildInviteLink,
  claimUsername,
  declineFollowRequest,
  findUserByInviteCode,
  findUserByUsername,
  getMyProfile,
  getRelationship,
  isMutual,
  listFollowers,
  listFollowing,
  listIncomingRequests,
  listOutgoingRequests,
  mutualFollowersOf,
  normalizeInviteCode,
  normalizeUsername,
  removeFollower,
  sendFollowRequest,
  unfollow,
  validateUsername,
} from "../services/friends";
import { fetchHabits } from "../services/habits";
import ClearDataButton from "../components/ClearDataButton";
import PageMenu, { PageMenuLabel } from "../components/PageMenu";
import FriendsFocusing from "../components/focus/FriendsFocusing";

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
          <em key={`${habit.id}-${index}`} className={done ? "dot-filled" : "dot-empty"} />
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
  const requireUser = useAuthGuard();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const [searchMode, setSearchMode] = useState("username");
  const [searchValue, setSearchValue] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchRelationship, setSearchRelationship] = useState(null);
  const [searchMutuals, setSearchMutuals] = useState(null);
  const [searching, setSearching] = useState(false);

  const [requests, setRequests] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [friends, setFriends] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [tab, setTab] = useState("following");
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState("");
  const [status, setStatus] = useState("");
  const [friendFilter, setFriendFilter] = useState("");
  const [toggled, setToggled] = useState(() => new Set());

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

    // Settled, not all: these are three independent reads, and one of them
    // failing must not blank the other two. A rejected Promise.all here meant
    // a permissions error on the sent-list wiped the incoming requests off the
    // page, so a request you could plainly reach by search never showed up.
    // Older two-way friendships become following both ways, once.
    await carryOverFriends(user.uid).catch(() => 0);

    const [incoming, sent, mine, theirs] = await Promise.allSettled([
      listIncomingRequests(user.uid),
      listOutgoingRequests(user.uid),
      listFollowing(user.uid),
      listFollowers(user.uid),
    ]);

    if (incoming.status === "fulfilled") setRequests(incoming.value);
    if (sent.status === "fulfilled") setOutgoing(sent.value);
    if (mine.status === "fulfilled") setFriends(mine.value);
    if (theirs.status === "fulfilled") setFollowers(theirs.value);

    // Name what actually failed rather than blaming the whole page.
    const failed = [
      incoming.status === "rejected" && "incoming requests",
      sent.status === "rejected" && "sent requests",
      mine.status === "rejected" && "who you follow",
      theirs.status === "rejected" && "your followers",
    ].filter(Boolean);

    setStatus(
      failed.length
        ? `Couldn't load ${failed.join(" or ")}. If this persists the Firestore rules may not be deployed.`
        : ""
    );
    setLoading(false);
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

  const runSearch = useCallback(
    async (mode, value) => {
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

        // Resolve what we already are to them, so the row offers the right
        // action instead of always offering to send.
        const [relationship, mutuals] = await Promise.all([
          user ? getRelationship(user.uid, found.uid) : null,
          user && found.uid !== user.uid ? mutualFollowersOf(user.uid, found.uid).catch(() => null) : null,
        ]);
        setSearchRelationship(relationship);
        setSearchMutuals(mutuals);
        setSearchResult(found);
      } catch (error) {
        setStatus(error?.message || "Search failed. Please try again.");
      } finally {
        setSearching(false);
      }
    },
    [user]
  );

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
    const currentUser = requireUser();
    if (!currentUser) return;

    const validationError = validateUsername(usernameInput);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    setSavingUsername(true);
    setStatus("");

    try {
      const { profile: saved, alreadyYours, previousUsername } = await claimUsername(
        currentUser,
        usernameInput
      );

      setProfile(saved);
      setUsernameInput(saved.username);

      // publishHabitSummary no-ops for anyone without a handle, so an account
      // that claims one has nothing shared until it next opens the Habits
      // page — friends would just see "Nothing shared yet". Publishing here
      // means a newly findable account is immediately readable by friends.
      fetchHabits(currentUser).catch(() => {});

      if (alreadyYours) {
        setStatus(`@${saved.username} is already your handle.`);
      } else if (previousUsername) {
        setStatus(`Changed from @${previousUsername} to @${saved.username}. The old handle is free again.`);
      } else {
        setStatus(`@${saved.username} is yours.`);
      }
    } catch (error) {
      // Each failure reads differently, so say which one it was.
      switch (error?.reason) {
        case CLAIM_ERRORS.TAKEN:
          setStatus(`@${normalizeUsername(usernameInput)} is already taken — try another.`);
          break;
        case CLAIM_ERRORS.INVALID:
          setStatus(error.message);
          break;
        case CLAIM_ERRORS.DENIED:
          setStatus(error.message);
          break;
        case CLAIM_ERRORS.UNAVAILABLE:
          setStatus(error.message);
          break;
        default:
          setStatus(error?.message || "Couldn't save that username.");
      }
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSendRequest = async (targetUid) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    setBusyUid(targetUid);
    setStatus("");

    try {
      const outcome = await sendFollowRequest(currentUser, targetUid);
      setStatus(outcome.following ? "You already follow them." : "Requested. They'll see it on their Friends page.");
      if (searchResult?.uid === targetUid) setSearchRelationship(outcome);
      await refresh();
    } catch (error) {
      setStatus(error?.message || "Couldn't send that request.");
    } finally {
      setBusyUid("");
    }
  };

  // Keeps the search row honest after any change to that person.
  const recheck = async (otherUid) => {
    if (user && searchResult?.uid === otherUid) setSearchRelationship(await getRelationship(user.uid, otherUid));
  };

  const handleCancelRequest = async (targetUid) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    setBusyUid(targetUid);
    try {
      await cancelFriendRequest(currentUser, targetUid);
      setOutgoing((current) => current.filter((item) => item.uid !== targetUid));
      await recheck(targetUid);
      setStatus("Request withdrawn.");
    } catch (error) {
      setStatus(error?.message || "Couldn't withdraw that request.");
    } finally {
      setBusyUid("");
    }
  };

  const handleAccept = async (requesterUid) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    setBusyUid(requesterUid);
    try {
      await acceptFollowRequest(currentUser, requesterUid);
      await recheck(requesterUid);
      await refresh();
      setStatus("Accepted. They now follow you — follow them back to become mutuals.");
    } catch (error) {
      setStatus(error?.message || "Couldn't accept that request.");
    } finally {
      setBusyUid("");
    }
  };

  const handleDecline = async (requesterUid) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    setBusyUid(requesterUid);
    try {
      await declineFollowRequest(currentUser, requesterUid);
      setRequests((current) => current.filter((item) => item.uid !== requesterUid));
      await recheck(requesterUid);
    } catch (error) {
      setStatus(error?.message || "Couldn't decline that request.");
    } finally {
      setBusyUid("");
    }
  };

  const handleUnfollow = async (targetUid, name) => {
    const currentUser = requireUser();
    if (!currentUser) return;
    if (!window.confirm(`Unfollow ${name}? You'll stop seeing their streaks. If they follow you, they still will.`)) return;

    setBusyUid(targetUid);
    try {
      await unfollow(currentUser, targetUid);
      await recheck(targetUid);
      await refresh();
    } catch (error) {
      setStatus(error?.message || "Couldn't unfollow.");
    } finally {
      setBusyUid("");
    }
  };

  const handleRemoveFollower = async (followerUid, name) => {
    const currentUser = requireUser();
    if (!currentUser) return;
    if (!window.confirm(`Remove ${name} as a follower? They won't be told, and they'll stop seeing your streaks.`)) return;

    setBusyUid(followerUid);
    try {
      await removeFollower(currentUser, followerUid);
      await recheck(followerUid);
      await refresh();
    } catch (error) {
      setStatus(error?.message || "Couldn't remove that follower.");
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

  /**
   * The phone's own share sheet where there is one (WhatsApp, Messages…),
   * otherwise the link is copied. Backing out of the sheet is not an error.
   */
  const shareInvite = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on U.Do",
          text: "Follow me on U.Do so we can keep each other's streaks going.",
          url: inviteLink,
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    copyToClipboard(inviteLink, "Invite link");
  };

  // A note says its piece and goes, rather than sitting there for the rest
  // of the visit.
  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(""), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  if (!user) {
    return (
      <section className="friends-page">
        <header className="page-head">
          <h1 className="page-title">Friends</h1>
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

  const query = friendFilter.trim().toLowerCase();
  // Longest streak first: the list reads as who's keeping it up, not as an
  // address book. Ties fall back to the name so the order never jumps around.
  const shownFriends = friends
    .filter((friend) =>
      !query ||
      String(friend.displayName || "").toLowerCase().includes(query) ||
      String(friend.username || "").toLowerCase().includes(query)
    )
    .sort(
      (a, b) =>
        (b.summary?.longestStreak || 0) - (a.summary?.longestStreak || 0) ||
        String(a.displayName || "").localeCompare(String(b.displayName || ""))
    );

  // With one or two friends everything is open; past that, cards start
  // folded so the list stays scannable. Tapping flips just that one.
  const startsOpen = friends.length <= 2;
  const isOpen = (uid) => toggled.has(uid) !== startsOpen;
  const toggle = (uid) =>
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const focusAdd = () => {
    const input = document.getElementById("friends-add-input");
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  };

  return (
    <section className="friends-page">
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">Friends</h1>
            <p className="page-sub">
              Followers see your habit streaks and badges. Mutuals — people who follow each other — can also study together.
            </p>
          </div>

          <PageMenu label="Friend actions">
            <PageMenuLabel>Danger zone</PageMenuLabel>
            <ClearDataButton
              label="Remove all friends"
              noun="friendships and pending requests"
              count={friends.length + requests.length}
              clear={clearFriendGraph}
              onCleared={refresh}
            />
          </PageMenu>
        </div>
      </header>

      {/* Up here rather than under the last card, where on a phone it landed
          off screen and a copied link looked like a button that did nothing. */}
      {status ? (
        <p className="friends-status" role="status">
          {status}
        </p>
      ) : null}

      <FriendsFocusing compact />

      {/* Only when there is something to answer, and then first. */}
      {requests.length > 0 ? (
        <article className="wire-card friends-requests-card">
          <div className="panel-head">
            <h3>
              {requests.length === 1 ? "1 follow request" : `${requests.length} follow requests`}
            </h3>
          </div>
          <div className="friends-request-list is-scrollable">
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
                  <FiCheck /> {busyUid === request.uid ? "Accepting..." : "Accept"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleDecline(request.uid)}
                  disabled={busyUid === request.uid}
                  aria-label={`Decline ${request.displayName || "request"}`}
                >
                  <FiX /> Decline
                </button>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <article className="wire-card">
        <div className="panel-head">
          <div className="friends-tabs" role="tablist" aria-label="Friends">
            <button type="button" role="tab" aria-selected={tab === "following"} className={tab === "following" ? "is-active" : ""} onClick={() => setTab("following")}>
              Following <span>{friends.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "followers"} className={tab === "followers" ? "is-active" : ""} onClick={() => setTab("followers")}>
              Followers <span>{followers.length}</span>
            </button>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={refresh}
            disabled={loading}
            title="Check for new friends and requests"
          >
            <FiRefreshCw /> {loading ? "Checking..." : "Refresh"}
          </button>
        </div>

        {tab === "followers" ? (
          followers.length === 0 ? (
            <p className="friends-muted">No followers yet. Share your invite link — people you accept appear here.</p>
          ) : (
            <div className="friends-list is-scrollable">
              {followers.map((person) => (
                <div key={person.uid} className="friends-result-row">
                  <Avatar person={person} />
                  <div className="friends-result-meta">
                    <strong>{person.displayName}</strong>
                    <small>
                      {person.username ? `@${person.username}` : "U.Do user"}
                      {person.mutual ? " · Mutual" : ""}
                    </small>
                  </div>
                  {person.mutual ? null : (
                    <button type="button" className="button-primary" onClick={() => handleSendRequest(person.uid)} disabled={busyUid === person.uid}>
                      <FiUserPlus /> Follow back
                    </button>
                  )}
                  <button type="button" className="btn btn-sm" onClick={() => handleRemoveFollower(person.uid, person.displayName)} disabled={busyUid === person.uid}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
        {friends.length > 4 ? (
          <div className="friends-filter">
            <FiSearch aria-hidden="true" />
            <input
              className="friends-input"
              placeholder="Search who you follow"
              value={friendFilter}
              onChange={(event) => setFriendFilter(event.target.value)}
              aria-label="Search who you follow"
            />
          </div>
        ) : null}

        {loading && friends.length === 0 ? (
          <p className="friends-muted">Loading your friends...</p>
        ) : friends.length === 0 ? (
          <div className="friends-empty-state">
            <p className="friends-muted">
              You don't follow anyone yet. Send your invite link, or find people by username.
            </p>
            <div className="friends-empty-actions">
              {inviteLink ? (
                <button type="button" className="button-primary" onClick={shareInvite}>
                  <FiShare2 /> Share invite link
                </button>
              ) : null}
              <button type="button" className="button-secondary" onClick={focusAdd}>
                <FiUserPlus /> Add by username
              </button>
            </div>
          </div>
        ) : shownFriends.length === 0 ? (
          <p className="friends-muted">Nobody matches &ldquo;{friendFilter}&rdquo;.</p>
        ) : (
          <div className="friends-list is-scrollable">
            {shownFriends.map((friend) => {
              const open = isOpen(friend.uid);
              const summary = friend.summary;
              return (
                <section key={friend.uid} className={`friend-card ${open ? "is-open" : ""}`}>
                  <button
                    type="button"
                    className="friend-card-toggle"
                    onClick={() => toggle(friend.uid)}
                    aria-expanded={open}
                  >
                    <Avatar person={friend} />
                    <span className="friends-result-meta">
                      <strong>{friend.displayName}</strong>
                      <small>
                        {friend.username ? `@${friend.username}` : "U.Do friend"}
                        {friend.mutual ? " · Mutual" : ""}
                        {summary && summary.totalCount > 0
                          ? ` · ${summary.doneCount}/${summary.totalCount} done`
                          : ""}
                        {friend.badgeCount ? ` · ${friend.badgeCount} ${friend.badgeCount === 1 ? "badge" : "badges"}` : ""}
                      </small>
                    </span>
                    {summary ? (
                      <span className="friend-headline">
                        <span className="friends-muted">Best streak</span>
                        <strong>{summary.longestStreak}</strong>
                      </span>
                    ) : null}
                    <FiChevronDown className="friend-card-chevron" aria-hidden="true" />
                  </button>

                  {open ? (
                    <div className="friend-card-body">
                      {!summary ? (
                        <p className="friends-muted">
                          Nothing shared yet — they need to open their Habits page once.
                        </p>
                      ) : summary.totalCount === 0 ? (
                        <p className="friends-muted">No habits tracked yet.</p>
                      ) : (
                        <div className="friend-habit-list">
                          {summary.habits.map((habit) => (
                            <HabitRow key={habit.id} habit={habit} />
                          ))}
                        </div>
                      )}

                      <div className="friend-card-foot">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => handleUnfollow(friend.uid, friend.displayName)}
                          disabled={busyUid === friend.uid}
                        >
                          {busyUid === friend.uid ? "Unfollowing..." : "Unfollow"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
          </>
        )}
      </article>

      <article className="wire-card">
        <h3>Find people</h3>

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
            id="friends-add-input"
            className="friends-input"
            placeholder={searchMode === "code" ? "ABCD2345" : "theirname"}
            value={searchValue}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
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
              {searchMutuals?.count ? (
                <small className="friends-mutuals">
                  Followed by {searchMutuals.names.join(", ")}
                  {searchMutuals.count > searchMutuals.names.length ? ` and ${searchMutuals.count - searchMutuals.names.length} more` : ""}
                </small>
              ) : null}
            </div>

            {/* The action follows the real relationship, so the row can never
                offer to send a request that already exists. */}
            {!searchRelationship ? null : searchRelationship.self ? (
              <span className="friends-state-note">That's you</span>
            ) : (
              <div className="friends-result-actions">
                {searchRelationship.incoming ? (
                  <button type="button" className="button-primary" onClick={() => handleAccept(searchResult.uid)} disabled={busyUid === searchResult.uid}>
                    <FiCheck /> Accept request
                  </button>
                ) : null}
                {searchRelationship.following ? (
                  <button type="button" className="btn" onClick={() => handleUnfollow(searchResult.uid, searchResult.displayName)} disabled={busyUid === searchResult.uid}>
                    <FiCheck /> {isMutual(searchRelationship) ? "Mutual" : "Following"}
                  </button>
                ) : searchRelationship.requested ? (
                  <button type="button" className="btn" onClick={() => handleCancelRequest(searchResult.uid)} disabled={busyUid === searchResult.uid}>
                    <FiX /> Requested
                  </button>
                ) : (
                  <button type="button" className="button-primary" onClick={() => handleSendRequest(searchResult.uid)} disabled={busyUid === searchResult.uid}>
                    <FiUserPlus /> {searchRelationship.followedBy ? "Follow back" : "Follow"}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </article>

      {outgoing.length > 0 && (
        <article className="wire-card">
          <h3>Requested ({outgoing.length})</h3>
          <p className="friends-muted">
            Follow requests you sent. Withdrawing removes it from their page.
          </p>
          <div className="friends-request-list is-scrollable">
            {outgoing.map((person) => (
              <div key={person.uid} className="friends-result-row">
                <Avatar person={person} />
                <div className="friends-result-meta">
                  <strong>{person.displayName}</strong>
                  {person.username ? <small>@{person.username}</small> : null}
                </div>
                <span className="friends-state-note">Pending</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleCancelRequest(person.uid)}
                  disabled={busyUid === person.uid}
                >
                  <FiX /> {busyUid === person.uid ? "Cancelling..." : "Withdraw"}
                </button>
              </div>
            ))}
          </div>
        </article>
      )}

      <article className="wire-card friends-handle-card">
        <h3>Your handle and invite</h3>
        <p className="friends-muted">
          {profile?.username
            ? `You're @${profile.username}. Friends can find you with your handle, code or link — changing your handle frees the old one.`
            : "Pick a username so friends can find and add you. Letters, numbers and underscores, 3-20 characters."}
        </p>

        <div className="friends-field-row">
          <span className="friends-at">@</span>
          <input
            className="friends-input"
            placeholder="yourname"
            value={usernameInput}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
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
                onClick={shareInvite}
              >
                <FiShare2 /> Share
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}

export default Friends;
