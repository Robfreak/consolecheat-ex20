import assert from "node:assert/strict";
import test from "node:test";
import { createSound, jingleNotes } from "./sound.ts";

function fakeCtor() {
  let made = 0;
  const started: number[] = [];
  class FakeContext {
    state = "running";
    currentTime = 0;
    destination = {};
    constructor() {
      made++;
    }
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: "",
        frequency: { value: 0 },
        connect: (node: unknown) => node,
        start: (t: number) => started.push(t),
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (node: unknown) => node,
      };
    }
  }
  return { Ctor: FakeContext as unknown as new () => AudioContext, made: () => made, started };
}

test("no AudioContext exists until the first user action", () => {
  const fake = fakeCtor();
  const sound = createSound(() => fake.Ctor);
  sound.tick();
  sound.jingle();
  assert.equal(fake.made(), 0);
  assert.equal(sound.created, false);
  sound.unlock();
  sound.unlock();
  assert.equal(fake.made(), 1);
  sound.tick();
  sound.jingle();
  assert.equal(fake.started.length, 1 + jingleNotes().length);
});

test("muted: no context is created and nothing plays", () => {
  const fake = fakeCtor();
  const sound = createSound(() => fake.Ctor);
  sound.setMuted(true);
  sound.unlock();
  sound.jingle();
  assert.equal(fake.made(), 0);
  sound.setMuted(false);
  sound.unlock();
  sound.setMuted(true);
  sound.tick();
  assert.equal(fake.started.length, 0);
});

test("without Web Audio the page still works", () => {
  const sound = createSound(() => undefined);
  assert.equal(sound.unlock(), null);
  sound.tick();
});

test("the jingle rises and stays short", () => {
  const notes = jingleNotes();
  for (let i = 1; i < notes.length; i++) assert.ok((notes[i]?.freq ?? 0) > (notes[i - 1]?.freq ?? 0));
  const end = Math.max(...notes.map((n) => n.start + n.length));
  assert.ok(end < 1);
});
