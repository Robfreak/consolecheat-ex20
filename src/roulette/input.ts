// Keyboard and gamepad mapping. Pure helpers so node:test can check them.

export type Action = { type: "spin" } | { type: "accept" };

export type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; repeat?: boolean };

export type TargetLike = { tagName?: string; type?: string; isContentEditable?: boolean } | null;

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

/** Fields where typing must never trigger a shortcut (and gamepad input is ignored). */
export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has((target.type ?? "text").toLowerCase());
  return false;
}

/** Controls that already use Space themselves (a button press, a checkbox). */
function ownsSpace(target: TargetLike): boolean {
  const tag = (target?.tagName ?? "").toUpperCase();
  return tag === "BUTTON" || tag === "INPUT" || tag === "A" || tag === "SUMMARY" || tag === "LABEL";
}

/** Page-wide keys: Space spins, unless a field or a control has focus. */
export function pageKeyAction(event: KeyLike, target: TargetLike): Action | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (isTypingTarget(target) || ownsSpace(target)) return null;
  if (event.key === " " || event.key === "Spacebar") return { type: "spin" };
  return null;
}

// Standard gamepad mapping (PlayStation labels).
export const PAD = { cross: 0, circle: 1, square: 2, triangle: 3, options: 9, up: 12, down: 13, left: 14, right: 15 } as const;

const BUTTON_ACTIONS: readonly (readonly [number, Action])[] = [
  [PAD.cross, { type: "spin" }],
  [PAD.triangle, { type: "accept" }],
];
const WATCHED = BUTTON_ACTIONS.map(([index]) => index);

export type PadLike = { index: number; buttons: readonly { pressed: boolean }[] };
export type PadMemory = { buttons: boolean[] };

function snapshot(pad: PadLike): PadMemory {
  const buttons: boolean[] = [];
  for (const index of WATCHED) buttons[index] = Boolean(pad.buttons[index]?.pressed);
  return { buttons };
}

/**
 * One pad, one poll (the pollPad pattern). The first call (no memory) seeds and emits
 * nothing. With `blocked` set (a text field has focus) the memory still follows the pad,
 * so a button held through the block does not fire afterwards.
 */
export function pollPad(
  pad: PadLike | null,
  memory: PadMemory | null,
  blocked = false,
): { actions: Action[]; memory: PadMemory | null } {
  if (!pad) return { actions: [], memory: null };
  const seeded = snapshot(pad);
  if (!memory) return { actions: [], memory: seeded };
  if (blocked) return { actions: [], memory: seeded };
  const actions: Action[] = [];
  for (const [index, action] of BUTTON_ACTIONS) {
    if (seeded.buttons[index] && !memory.buttons[index]) actions.push(action);
  }
  return { actions, memory: seeded };
}

/** Memory per gamepad index. A pad missing from a poll (or forgotten on disconnect) seeds again. */
export function createPadPoller() {
  const memories = new Map<number, PadMemory>();
  return {
    poll(pads: readonly (PadLike | null)[], blocked = false): Action[] {
      const actions: Action[] = [];
      const live = new Set<number>();
      for (const pad of pads) {
        if (!pad) continue;
        live.add(pad.index);
        const result = pollPad(pad, memories.get(pad.index) ?? null, blocked);
        if (result.memory) memories.set(pad.index, result.memory);
        actions.push(...result.actions);
      }
      for (const index of [...memories.keys()]) if (!live.has(index)) memories.delete(index);
      return actions;
    },
    forget(index: number) {
      memories.delete(index);
    },
  };
}
