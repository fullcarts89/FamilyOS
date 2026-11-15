/**
 * Motion and feedback (docs/plan/redesign-family-rhythm.md, "Emotional design"): routine feedback
 * on every completion (animated check, light haptic, undo), acknowledgments as a line in the toast,
 * rare milestones once per person, skeletons and fades. Built on React Native's Animated so it
 * runs the same on iPhone and the web; reduced motion replaces movement with fades or nothing.
 */
export { acknowledgeOnce, setAcknowledgmentStore, useAcknowledgment } from './acknowledgment';
export { CelebrationProvider, useCelebrate, type Milestone } from './Celebration';
export { FadeIn } from './FadeIn';
export { HapticsProvider, hapticsAvailable, useHaptics } from './haptics';
export { Skeleton, SkeletonBlock, SkeletonRows } from './Skeleton';
