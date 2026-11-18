import assert from "node:assert/strict";
import test from "node:test";
import { createPadPoller, isTypingTarget, PAD, pageKeyAction, pollPad, type PadLike } from "./input.ts";

function pad(index: number, pressed: number[] = []): PadLike {
  return { index, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) };
}

test("the first poll of a pad only initializes state, even with × held", () => {
  const first = pollPad(pad(0, [PAD.cross, PAD.triangle]), null);
  assert.deepEqual(first.actions, []);
  assert.ok(first.memory);
  assert.deepEqual(pollPad(pad(0, [PAD.cross, PAD.triangle]), first.memory).actions, []);
  const released = pollPad(pad(0), first.memory);
  assert.deepEqual(pollPad(pad(0, [PAD.cross]), released.memory).actions, [{ type: "spin" }]);
});

test("the first poll after a reconnect only initializes state", () => {
  const poller = createPadPoller();
  assert.deepEqual(poller.poll([pad(0)]), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross])]), [{ type: "spin" }]);
  assert.deepEqual(poller.poll([null]), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross])]), [], "back with × held: seed only");
  assert.deepEqual(poller.poll([pad(0)]), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.triangle])]), [{ type: "accept" }]);
  poller.forget(0);
  assert.deepEqual(poller.poll([pad(0, [PAD.triangle])]), [], "after gamepaddisconnected: seed only");
  assert.deepEqual(poller.poll([pad(0, [PAD.triangle]), pad(1, [PAD.cross])]), [], "a second pad seeds too");
});

test("gamepad mapping: × spins, △ accepts, other buttons do nothing", () => {
  const poller = createPadPoller();
  poller.poll([pad(0)]);
  const press = (button: number) => {
    const actions = poller.poll([pad(0, [button])]);
    poller.poll([pad(0)]);
    return actions;
  };
  assert.deepEqual(press(PAD.cross), [{ type: "spin" }]);
  assert.deepEqual(press(PAD.triangle), [{ type: "accept" }]);
  for (const button of [PAD.circle, PAD.square, PAD.options, PAD.up, PAD.down, PAD.left, PAD.right]) assert.deepEqual(press(button), [], String(button));
});

test("while a text field is focused, the pad does nothing and fires nothing later", () => {
  const poller = createPadPoller();
  poller.poll([pad(0)]);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross])], true), []);
  assert.deepEqual(poller.poll([pad(0, [PAD.cross])], false), []);
});

test("Space spins only when no field or control has focus", () => {
  const body = { tagName: "BODY" };
  assert.deepEqual(pageKeyAction({ key: " " }, body), { type: "spin" });
  assert.deepEqual(pageKeyAction({ key: " " }, { tagName: "DIV" }), { type: "spin" });
  assert.equal(pageKeyAction({ key: " " }, null)?.type, "spin");
  for (const target of [
    { tagName: "INPUT", type: "text" },
    { tagName: "INPUT", type: "checkbox" },
    { tagName: "TEXTAREA" },
    { tagName: "SELECT" },
    { tagName: "BUTTON" },
    { tagName: "A" },
    { tagName: "SUMMARY" },
    { tagName: "DIV", isContentEditable: true },
  ]) assert.equal(pageKeyAction({ key: " " }, target), null, JSON.stringify(target));
  assert.equal(pageKeyAction({ key: " ", repeat: true }, body), null);
  assert.equal(pageKeyAction({ key: " ", ctrlKey: true }, body), null);
  assert.equal(pageKeyAction({ key: "Enter" }, body), null);
});

test("typing targets", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "number" }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "file" }), false);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
});
