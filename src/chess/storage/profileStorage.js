const USER_PROFILES_KEY = "chessAnalyzer.userProfiles";
const ACTIVE_PROFILE_ID_KEY = "chessAnalyzer.activeProfileId";

const DEFAULT_PROFILE_NAME = "You";
const DEFAULT_RATING = 1500;

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson(key, fallback) {
  if (!hasStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key} from localStorage:`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  if (!hasStorage()) return value;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key} to localStorage:`, error);
  }

  return value;
}

function createId() {
  return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RATING;
  return Math.max(100, Math.min(3500, Math.round(parsed)));
}

function normalizeRatingEvent(event = {}) {
  return {
    gameId: event.gameId || `rating-${Date.now()}`,
    date: event.date || new Date().toISOString(),
    previousRating: normalizeRating(event.previousRating),
    newRating: normalizeRating(event.newRating),
    change: Math.round(Number(event.change) || 0),
    performanceRating: normalizeRating(event.performanceRating),
    accuracy: Number.isFinite(Number(event.accuracy)) ? Math.round(Number(event.accuracy)) : null,
    moveCount: Number.isFinite(Number(event.moveCount)) ? Math.round(Number(event.moveCount)) : 0,
    result: event.result || "*",
    sourceMode: event.sourceMode || "unknown",
    opponent: event.opponent || "",
  };
}

function normalizeProfile(profile = {}) {
  const now = new Date().toISOString();
  const startingRating = normalizeRating(profile.startingRating ?? profile.currentRating);

  const ratingHistory = Array.isArray(profile.ratingHistory)
    ? profile.ratingHistory.map(normalizeRatingEvent).slice(0, 100)
    : [];

  return {
    id: profile.id || createId(),
    name: String(profile.name || DEFAULT_PROFILE_NAME).trim() || DEFAULT_PROFILE_NAME,
    startingRating,
    currentRating: normalizeRating(profile.currentRating ?? startingRating),
    ratingHistory,
    createdAt: profile.createdAt || now,
    updatedAt: profile.updatedAt || now,
  };
}

function createDefaultProfile() {
  return normalizeProfile({
    id: "default-profile",
    name: DEFAULT_PROFILE_NAME,
    startingRating: DEFAULT_RATING,
    currentRating: DEFAULT_RATING,
  });
}

export function getProfiles() {
  const profiles = readJson(USER_PROFILES_KEY, []);

  if (!Array.isArray(profiles) || profiles.length === 0) {
    const defaultProfile = createDefaultProfile();
    writeJson(USER_PROFILES_KEY, [defaultProfile]);
    writeJson(ACTIVE_PROFILE_ID_KEY, defaultProfile.id);
    return [defaultProfile];
  }

  return profiles.map(normalizeProfile);
}

export function saveProfiles(profiles) {
  return writeJson(USER_PROFILES_KEY, Array.isArray(profiles) ? profiles.map(normalizeProfile) : []);
}

export function getActiveProfileId() {
  if (!hasStorage()) return null;
  return window.localStorage.getItem(ACTIVE_PROFILE_ID_KEY);
}

export function setActiveProfileId(profileId) {
  if (hasStorage() && profileId) {
    window.localStorage.setItem(ACTIVE_PROFILE_ID_KEY, profileId);
  }

  return profileId;
}

export function getActiveProfile() {
  const profiles = getProfiles();
  const activeId = getActiveProfileId();
  const activeProfile = profiles.find((profile) => profile.id === activeId) || profiles[0];

  if (activeProfile?.id) setActiveProfileId(activeProfile.id);
  return activeProfile;
}

export function createProfile({ name, startingRating = DEFAULT_RATING } = {}) {
  const profiles = getProfiles();
  const profile = normalizeProfile({
    name,
    startingRating,
    currentRating: startingRating,
  });

  const nextProfiles = [profile, ...profiles];
  saveProfiles(nextProfiles);
  setActiveProfileId(profile.id);

  return { profile, profiles: nextProfiles };
}

export function updateProfile(profileId, updates = {}) {
  const profiles = getProfiles();
  const now = new Date().toISOString();
  let updatedProfile = null;

  const nextProfiles = profiles.map((profile) => {
    if (profile.id !== profileId) return profile;

    updatedProfile = normalizeProfile({
      ...profile,
      ...updates,
      updatedAt: now,
    });

    return updatedProfile;
  });

  saveProfiles(nextProfiles);
  return { profile: updatedProfile, profiles: nextProfiles };
}

export function deleteProfile(profileId) {
  const profiles = getProfiles();
  const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
  const safeProfiles = nextProfiles.length ? nextProfiles : [createDefaultProfile()];
  const activeId = getActiveProfileId();

  saveProfiles(safeProfiles);

  if (activeId === profileId || !safeProfiles.some((profile) => profile.id === activeId)) {
    setActiveProfileId(safeProfiles[0].id);
  }

  return safeProfiles;
}


export function applyTrainingRatingUpdate(profileId, ratingEvent = {}) {
  if (!profileId || !ratingEvent?.gameId) {
    return { profile: null, profiles: getProfiles(), event: null, applied: false };
  }

  const profiles = getProfiles();
  let updatedProfile = null;
  let appliedEvent = null;
  let alreadyApplied = false;
  const now = new Date().toISOString();

  const nextProfiles = profiles.map((profile) => {
    if (profile.id !== profileId) return profile;

    const existingHistory = Array.isArray(profile.ratingHistory)
      ? profile.ratingHistory
      : [];

    if (existingHistory.some((event) => event.gameId === ratingEvent.gameId)) {
      alreadyApplied = true;
      updatedProfile = profile;
      return profile;
    }

    const previousRating = normalizeRating(profile.currentRating);
    const change = Math.round(Number(ratingEvent.change) || 0);
    const newRating = normalizeRating(previousRating + change);

    appliedEvent = normalizeRatingEvent({
      ...ratingEvent,
      previousRating,
      newRating,
      change: newRating - previousRating,
      date: ratingEvent.date || now,
    });

    updatedProfile = normalizeProfile({
      ...profile,
      currentRating: newRating,
      ratingHistory: [appliedEvent, ...existingHistory].slice(0, 100),
      updatedAt: now,
    });

    return updatedProfile;
  });

  saveProfiles(nextProfiles);

  return {
    profile: updatedProfile,
    profiles: nextProfiles,
    event: appliedEvent,
    applied: Boolean(appliedEvent) && !alreadyApplied,
    skipped: alreadyApplied,
  };
}
