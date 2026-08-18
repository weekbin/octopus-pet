// octopus-fsm.test.ts — unit tests for the 14-scene FSM.
//
// Uses Vitest. Run with: `npx vitest run src/state/octopus-fsm.test.ts`
//
// We test:
//   1. Initial state
//   2. Single click → bubble + affection +1
//   3. Pet → affection +5
//   4. Force scene → jumps to specified scene
//   5. Timer tick past autoNextAt → rotates to next scene
//   6. Timer tick past bubbleHideAt → dismisses bubble
//   7. Ask (MCP pet_ask) → shows bubble (truncated to 12)
//   8. Drag → updates position
//   9. Rotation cycles through all 14 scenes in order

import { describe, it, expect, beforeEach } from "vitest";
import { createActor } from "xstate";
import { octopusMachine, nextScene, pickBubble } from "./octopus-fsm";
import { SCENE_ORDER, BUBBLE_BY_SCENE } from "./types";

describe("octopus-fsm", () => {
  describe("initial state", () => {
    it("starts on pretend-busy", () => {
      const actor = createActor(octopusMachine).start();
      expect(actor.getSnapshot().context.scene).toBe("pretend-busy");
      expect(actor.getSnapshot().context.bubble).toBeNull();
      expect(actor.getSnapshot().context.affection).toBe(0);
    });
  });

  describe("nextScene helper", () => {
    it("rotates through all 14 scenes in order", () => {
      const seen: string[] = [];
      let s: typeof SCENE_ORDER[number] = "pretend-busy";
      for (let i = 0; i < SCENE_ORDER.length; i++) {
        seen.push(s);
        s = nextScene(s);
      }
      expect(seen).toEqual([...SCENE_ORDER]);
      // After 14, wraps to first
      expect(s).toBe(SCENE_ORDER[0]);
    });
  });

  describe("TIMER_TICK rotation (regression: was stuck on stay-late)", () => {
    it("rotates to the correct next scene from EVERY starting scene", () => {
      // Regression for the rotateScene bug where nextScene(initialContext.scene)
      // always computed from "pretend-busy", so any scene rotated to "stay-late".
      for (const scene of SCENE_ORDER) {
        const actor = createActor(octopusMachine).start();
        actor.send({ type: "FORCE_SCENE", scene, now: Date.now() });
        const autoNextAt = actor.getSnapshot().context.autoNextAt;
        actor.send({ type: "TIMER_TICK", now: autoNextAt + 100 });
        const i = SCENE_ORDER.indexOf(scene);
        const expected = SCENE_ORDER[(i + 1) % SCENE_ORDER.length];
        expect(
          actor.getSnapshot().context.scene,
          `from ${scene} should rotate to ${expected}`,
        ).toBe(expected);
      }
    });
  });

  describe("CLICK event", () => {
    it("shows a bubble and increments affection by 1", () => {
      const actor = createActor(octopusMachine).start();
      const before = actor.getSnapshot().context.affection;
      actor.send({ type: "CLICK", now: Date.now() });
      const after = actor.getSnapshot().context;
      expect(after.bubble).not.toBeNull();
      expect(after.bubble!.length).toBeGreaterThan(0);
      expect(after.affection).toBe(before + 1);
    });

    it("picks bubble from current scene's text pool", () => {
      const actor = createActor(octopusMachine).start();
      // Force scene to "payday" so we know which pool
      actor.send({ type: "FORCE_SCENE", scene: "payday", now: Date.now() });
      actor.send({ type: "DISMISS_BUBBLE", now: Date.now() });
      actor.send({ type: "CLICK", now: Date.now() });
      const bubble = actor.getSnapshot().context.bubble!;
      const pool = BUBBLE_BY_SCENE["payday"];
      expect(pool).toContain(bubble);
    });
  });

  describe("PET event", () => {
    it("shows '啊~' bubble and increments affection by 5", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "PET", now: Date.now() });
      const after = actor.getSnapshot().context;
      expect(after.bubble).toBe("啊~");
      expect(after.affection).toBe(5);
    });

    it("affection caps at 100", () => {
      const actor = createActor(octopusMachine).start();
      // 20 PETs would be 100, but cap at 100 after 20
      for (let i = 0; i < 25; i++) {
        actor.send({ type: "PET", now: Date.now() + i });
      }
      expect(actor.getSnapshot().context.affection).toBe(100);
    });
  });

  describe("FORCE_SCENE event", () => {
    it("jumps to specified scene", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "FORCE_SCENE", scene: "breakdown", now: Date.now() });
      expect(actor.getSnapshot().context.scene).toBe("breakdown");
    });
  });

  describe("TIMER_TICK event", () => {
    it("rotates to next scene when autoNextAt reached", () => {
      const actor = createActor(octopusMachine).start();
      const initialScene = actor.getSnapshot().context.scene;
      // autoNextAt is set to Date.now() + ROTATION_INTERVAL_MS in initial context
      // Wait that long, then send a tick
      const future = actor.getSnapshot().context.autoNextAt + 1000;
      actor.send({ type: "TIMER_TICK", now: future });
      expect(actor.getSnapshot().context.scene).toBe(nextScene(initialScene));
    });

    it("dismisses bubble when bubbleHideAt reached", () => {
      const actor = createActor(octopusMachine).start();
      // First trigger a click to set bubbleHideAt
      const t0 = Date.now();
      actor.send({ type: "CLICK", now: t0 });
      expect(actor.getSnapshot().context.bubble).not.toBeNull();
      const hideAt = actor.getSnapshot().context.bubbleHideAt!;
      // Send tick past hideAt
      actor.send({ type: "TIMER_TICK", now: hideAt + 100 });
      expect(actor.getSnapshot().context.bubble).toBeNull();
      expect(actor.getSnapshot().context.bubbleHideAt).toBeNull();
    });

    it("does NOT rotate while bubble is showing", () => {
      const actor = createActor(octopusMachine).start();
      const initialScene = actor.getSnapshot().context.scene;
      // Trigger click (which sets autoNextAt to now + 3000 + 8000)
      const t0 = Date.now();
      actor.send({ type: "CLICK", now: t0 });
      // Send tick past original autoNextAt but before bubbleHideAt
      const t1 = actor.getSnapshot().context.autoNextAt + 100;
      // autoNextAt is now ~now + 3000 + 8000, so t1 (now + 100) is BEFORE autoNextAt
      // So no rotation
      actor.send({ type: "TIMER_TICK", now: t1 });
      expect(actor.getSnapshot().context.scene).toBe(initialScene);
    });
  });

  describe("ASK event (MCP pet_ask)", () => {
    it("shows bubble with provided text", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "ASK", text: "加班中", now: Date.now() });
      expect(actor.getSnapshot().context.bubble).toBe("加班中");
    });

    it("truncates to 12 characters", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "ASK", text: "12345678901234567890", now: Date.now() });
      // slice(0, 12) of ASCII string = 12 chars
      expect(actor.getSnapshot().context.bubble).toBe("123456789012");
    });
  });

  describe("DRAG event", () => {
    it("updates position", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "DRAG", x: 500, y: 300 });
      expect(actor.getSnapshot().context.position).toEqual({ x: 500, y: 300 });
    });
  });

  describe("pickBubble helper", () => {
    it("returns a string from the scene's pool", () => {
      for (const scene of SCENE_ORDER) {
        const b = pickBubble(scene);
        expect(BUBBLE_BY_SCENE[scene]).toContain(b);
      }
    });

    it("uses provided rng", () => {
      const b1 = pickBubble("pretend-busy", () => 0);
      const b2 = pickBubble("pretend-busy", () => 0.999);
      // rng=0 → first element, rng=0.999 → last element; for arrays of 5 they differ
      expect(b1).toBe(BUBBLE_BY_SCENE["pretend-busy"][0]);
      expect(b2).toBe(
        BUBBLE_BY_SCENE["pretend-busy"][BUBBLE_BY_SCENE["pretend-busy"].length - 1],
      );
    });
  });
});
