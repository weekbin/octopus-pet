// octopus-fsm.test.ts — unit tests for the 14-scene FSM.
//
// Uses Vitest. Run with: `npx vitest run src/state/octopus-fsm.test.ts`
//
// V2.1 调度: SCENE_ENDED 事件 (sprite 视频 onEnded) 驱动 scene 切换, 不再依赖
// setInterval 8s 计时. TIMER_TICK 只用于 bubble hide 判定.
//
// We test:
//   1. Initial state
//   2. Single click → bubble + affection +1
//   3. Pet → affection +5
//   4. Force scene → jumps to specified scene (V2: 不更新 recentScenes)
//   5. SCENE_ENDED event → rotates to a random scene not in recentScenes
//   6. Timer tick past bubbleHideAt → dismisses bubble
//   7. Ask (MCP pet_ask) → shows bubble (truncated to 12)
//   8. Drag → updates position
//   9. V1 nextScene helper still works (V1 顺序轮转保留)
//  10. V2 pickRandomScene: 排除 recent + current, 等概率
//  11. V2 updateRecent: 滚动窗口
//  12. V2 SCENE_ENDED 多次轮转不重复 (recentScenes 维护正确)
//  13. V2.1 TIMER_TICK 不再触发 rotateScene (V1 顺序轮转 V1.5 deprecated)

import { describe, it, expect, beforeEach } from "vitest";
import { createActor } from "xstate";
import {
  octopusMachine,
  nextScene,
  pickBubble,
  pickRandomScene,
  updateRecent,
} from "./octopus-fsm";
import {
  BUBBLE_BY_SCENE,
  RECENT_WINDOW_SIZE,
  SCENE_ORDER,
  type OctopusScene,
} from "./types";

describe("octopus-fsm", () => {
  describe("initial state", () => {
    it("starts on pretend-busy with empty recentScenes", () => {
      const actor = createActor(octopusMachine).start();
      const ctx = actor.getSnapshot().context;
      expect(ctx.scene).toBe("pretend-busy");
      expect(ctx.bubble).toBeNull();
      expect(ctx.affection).toBe(0);
      expect(ctx.recentScenes).toEqual([]);
    });
  });

  describe("nextScene helper (V1 顺序轮转保留)", () => {
    it("rotates through all 14 scenes in order", () => {
      const seen: string[] = [];
      let s: OctopusScene = "pretend-busy";
      for (let i = 0; i < SCENE_ORDER.length; i++) {
        seen.push(s);
        s = nextScene(s);
      }
      expect(seen).toEqual([...SCENE_ORDER]);
      // After 14, wraps to first
      expect(s).toBe(SCENE_ORDER[0]);
    });
  });

  describe("V2 pickRandomScene", () => {
    it("excludes currentScene and recent from candidates", () => {
      const recent: OctopusScene[] = ["breakdown", "lying-flat"];
      // rng always 0 → first candidate
      const result = pickRandomScene("pretend-busy", recent, () => 0);
      // candidates = SCENE_ORDER minus {pretend-busy, breakdown, lying-flat}
      // first non-excluded = stay-late
      expect(result).toBe("stay-late");
    });

    it("covers all candidates over many rng draws (uniform distribution)", () => {
      const recent: OctopusScene[] = [];
      // pretend-busy excluded → 13 candidates
      const seen = new Set<OctopusScene>();
      for (let i = 0; i < 13 * 10; i++) {
        seen.add(pickRandomScene("pretend-busy", recent, () => (i % 13) / 13));
      }
      // 13 candidates all hit (rng cycles through 13 buckets)
      expect(seen.size).toBe(13);
      // pretend-busy never picked (excluded as current)
      expect(seen.has("pretend-busy")).toBe(false);
    });

    it("falls back to all 14 when recent covers every scene (defensive)", () => {
      // Hypothetical: recent = all 14 scenes. exclude set has all → candidates empty.
      // Defensive: pickRandomScene should not crash, return any scene (not current).
      const result = pickRandomScene("pretend-busy", [...SCENE_ORDER], () => 0);
      expect(SCENE_ORDER).toContain(result);
    });

    it("never returns a scene in recent", () => {
      const recent: OctopusScene[] = ["breakdown", "lying-flat", "payday"];
      for (let i = 0; i < 200; i++) {
        const r = Math.random();
        const result = pickRandomScene("pretend-busy", recent, () => r);
        expect(recent).not.toContain(result);
      }
    });

    it("never returns the current scene", () => {
      for (const cur of SCENE_ORDER) {
        for (let i = 0; i < 50; i++) {
          const result = pickRandomScene(cur, [], Math.random);
          expect(result).not.toBe(cur);
        }
      }
    });
  });

  describe("V2 updateRecent", () => {
    it("appends new scene to end (FIFO order)", () => {
      const result = updateRecent([], "pretend-busy");
      expect(result).toEqual(["pretend-busy"]);
    });

    it("trims oldest when over window size", () => {
      const recent: OctopusScene[] = [
        "breakdown",
        "lying-flat",
        "payday",
        "salary-rejected",
        "treat-milk-tea",
      ];
      const result = updateRecent(recent, "friday-5pm");
      expect(result).toEqual([
        "lying-flat",
        "payday",
        "salary-rejected",
        "treat-milk-tea",
        "friday-5pm",
      ]);
      expect(result.length).toBe(RECENT_WINDOW_SIZE);
    });

    it("does not trim when within window size", () => {
      const recent: OctopusScene[] = ["breakdown", "lying-flat"];
      const result = updateRecent(recent, "payday");
      expect(result).toEqual(["breakdown", "lying-flat", "payday"]);
      expect(result.length).toBe(3);
    });
  });

  describe("V2.1 SCENE_ENDED event (sprite 视频 onEnded 驱动)", () => {
    it("rotates to a scene NOT in {current, recentScenes}", () => {
      const actor = createActor(octopusMachine).start();
      const initial = actor.getSnapshot().context.scene;
      actor.send({ type: "SCENE_ENDED", now: Date.now() });
      const next = actor.getSnapshot().context.scene;
      expect(next).not.toBe(initial);
      // V2 first rotation: recentScenes starts empty, exclude = {initial}, candidates = 13
      // After pick, recentScenes = [next]
      expect(actor.getSnapshot().context.recentScenes).toEqual([next]);
    });

    it("never picks recent scene across many SCENE_ENDED (deterministic rng)", () => {
      // V2.1 核心: 每次 SCENE_ENDED 触发时, exclude set = currentScene + recentScenes.
      // 跑 14 次, 验证:
      //   1. recent buffer 总是恰好包含最近 (≤ 5) 个已播放 (含刚 pick 的)
      //   2. 同一 scene 不会在 N=5 步内重复出现
      const actor = createActor(octopusMachine).start();
      const history: OctopusScene[] = [actor.getSnapshot().context.scene];
      for (let i = 0; i < 14; i++) {
        actor.send({ type: "SCENE_ENDED", now: Date.now() + i });
        const newScene = actor.getSnapshot().context.scene;
        const recent = actor.getSnapshot().context.recentScenes;
        history.push(newScene);
        if (recent.length > 0) {
          expect(recent[recent.length - 1]).toBe(newScene);
        }
        expect(recent.length).toBeLessThanOrEqual(RECENT_WINDOW_SIZE);
        if (history.length > RECENT_WINDOW_SIZE + 1) {
          const fiveBackIdx = history.length - 1 - RECENT_WINDOW_SIZE;
          const fiveBack = history[fiveBackIdx];
          expect(fiveBack).not.toBe(newScene);
        }
      }
    });

    it("eventually covers most/all 14 scenes over 30+ rotations", () => {
      const actor = createActor(octopusMachine).start();
      const visited = new Set<OctopusScene>([actor.getSnapshot().context.scene]);
      for (let i = 0; i < 50; i++) {
        actor.send({ type: "SCENE_ENDED", now: Date.now() + i });
        visited.add(actor.getSnapshot().context.scene);
      }
      expect(visited.size).toBeGreaterThanOrEqual(12);
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

  describe("TIMER_TICK event (V2.1: 只判定 bubble hide, 不再切 scene)", () => {
    it("V2.1: TIMER_TICK no longer rotates scene (deprecated V1.5 8s 计时)", () => {
      const actor = createActor(octopusMachine).start();
      const initialScene = actor.getSnapshot().context.scene;
      // V2.1: 即使发送过去 autoNextAt 的 tick, 也不切 scene
      const future = actor.getSnapshot().context.autoNextAt + 1000;
      actor.send({ type: "TIMER_TICK", now: future });
      expect(actor.getSnapshot().context.scene).toBe(initialScene);
    });

    it("dismisses bubble when bubbleHideAt reached", () => {
      const actor = createActor(octopusMachine).start();
      const t0 = Date.now();
      actor.send({ type: "CLICK", now: t0 });
      expect(actor.getSnapshot().context.bubble).not.toBeNull();
      const hideAt = actor.getSnapshot().context.bubbleHideAt!;
      actor.send({ type: "TIMER_TICK", now: hideAt + 100 });
      expect(actor.getSnapshot().context.bubble).toBeNull();
      expect(actor.getSnapshot().context.bubbleHideAt).toBeNull();
    });
  });

  describe("SCENE_ENDED event (V2.1 主调度入口)", () => {
    it("rotates scene (V2.1 唯一自然触发器)", () => {
      const actor = createActor(octopusMachine).start();
      const initialScene = actor.getSnapshot().context.scene;
      actor.send({ type: "SCENE_ENDED", now: Date.now() });
      expect(actor.getSnapshot().context.scene).not.toBe(initialScene);
    });

    it("clears bubble on scene change (跟 V1 一致)", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "CLICK", now: Date.now() });
      expect(actor.getSnapshot().context.bubble).not.toBeNull();
      actor.send({ type: "SCENE_ENDED", now: Date.now() + 1 });
      expect(actor.getSnapshot().context.bubble).toBeNull();
    });
  });

  describe("ROTATE_NOW event (V2.1: 跟 SCENE_ENDED 行为一致)", () => {
    it("rotates scene immediately (用户/MCP 主动跳过)", () => {
      const actor = createActor(octopusMachine).start();
      const initialScene = actor.getSnapshot().context.scene;
      actor.send({ type: "ROTATE_NOW", now: Date.now() });
      expect(actor.getSnapshot().context.scene).not.toBe(initialScene);
      // V2.1: 也走 pickRandomScene + updateRecent
      expect(actor.getSnapshot().context.recentScenes).toHaveLength(1);
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
