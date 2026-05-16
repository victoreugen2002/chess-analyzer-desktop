import { useState } from "react";

function formatRating(rating) {
  return Number.isFinite(Number(rating)) ? Math.round(Number(rating)) : 1500;
}

export default function ProfilePanel({
  bgStyleApp,
  profiles,
  activeProfile,
  onBack,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onSwitchProfile,
}) {
  const [name, setName] = useState("");
  const [startingRating, setStartingRating] = useState(1500);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingRating, setEditingRating] = useState(1500);
  const latestRatingEvent = activeProfile?.ratingHistory?.[0] || null;

  function formatRatingChange(change) {
    const value = Math.round(Number(change) || 0);
    if (!value) return "±0";
    return value > 0 ? `+${value}` : String(value);
  }

  function startEditing(profile) {
    setEditingId(profile.id);
    setEditingName(profile.name || "");
    setEditingRating(formatRating(profile.currentRating));
  }

  function submitCreate(event) {
    event.preventDefault();
    if (!name.trim()) return;

    onCreateProfile({ name: name.trim(), startingRating });
    setName("");
    setStartingRating(1500);
  }

  function submitEdit(event) {
    event.preventDefault();
    if (!editingId || !editingName.trim()) return;

    onUpdateProfile(editingId, {
      name: editingName.trim(),
      currentRating: editingRating,
    });

    setEditingId(null);
  }

  return (
    <div className="app-bg" style={bgStyleApp}>
      <button
        onClick={onBack}
        className="btn btn--ghost"
        style={{ marginBottom: "10px" }}
      >
        ← Back
      </button>

      <div className="app-wrap profile-wrap">
        <section className="panel profile-panel">
          <div className="panel-head profile-panel__head">
            <div>
              <h1 className="page-title">Local Profiles</h1>
              <p className="panel-subtitle">
                Profiles are stored locally on this computer. No login or online account required.
              </p>
            </div>
          </div>

          <div className="profile-active-card">
            <div>
              <div className="analysis-label">Active profile</div>
              <div className="profile-active-card__name">{activeProfile?.name || "You"}</div>
              {latestRatingEvent && (
                <div className="profile-row__meta">
                  Last training update {formatRatingChange(latestRatingEvent.change)} from game performance ~{formatRating(latestRatingEvent.performanceRating)}
                </div>
              )}
            </div>
            <div className="profile-rating-pill">~{formatRating(activeProfile?.currentRating)}</div>
          </div>

          <form className="profile-form" onSubmit={submitCreate}>
            <div>
              <label className="field-label">Create profile</label>
              <input
                className="profile-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Player name"
              />
            </div>
            <div>
              <label className="field-label">Starting rating</label>
              <input
                className="profile-input"
                type="number"
                min="100"
                max="3500"
                step="50"
                value={startingRating}
                onChange={(event) => setStartingRating(Number(event.target.value))}
              />
            </div>
            <button className="btn btn--success profile-form__button" type="submit">
              Create Profile
            </button>
          </form>

          <div className="profile-list">
            {profiles.map((profile) => {
              const isActive = activeProfile?.id === profile.id;
              const isEditing = editingId === profile.id;

              return (
                <div key={profile.id} className={`profile-row ${isActive ? "is-active" : ""}`}>
                  {isEditing ? (
                    <form className="profile-row__edit" onSubmit={submitEdit}>
                      <input
                        className="profile-input"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <input
                        className="profile-input profile-input--rating"
                        type="number"
                        min="100"
                        max="3500"
                        step="50"
                        value={editingRating}
                        onChange={(event) => setEditingRating(Number(event.target.value))}
                      />
                      <button className="btn btn--success" type="submit">Save</button>
                      <button className="btn btn--ghost" type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="profile-row__main">
                        <div className="profile-row__name">
                          {profile.name}
                          {isActive && <span className="profile-active-badge">Active</span>}
                        </div>
                        <div className="profile-row__meta">
                          Current rating ~{formatRating(profile.currentRating)} · Started ~{formatRating(profile.startingRating)} · Rated games {profile.ratingHistory?.length || 0}
                        </div>
                      </div>

                      <div className="profile-row__actions">
                        {!isActive && (
                          <button className="btn btn--success" onClick={() => onSwitchProfile(profile.id)}>
                            Use
                          </button>
                        )}
                        <button className="btn btn--ghost" onClick={() => startEditing(profile)}>
                          Edit
                        </button>
                        <button className="btn btn--ghost" onClick={() => onDeleteProfile(profile.id)}>
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
