

export function detectGreedyCapturePunishment(features = {}) {
  const validation = features.greedyCaptureValidations?.[0];
  if (!validation) return null;

  return validation;
}
