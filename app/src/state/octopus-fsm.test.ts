// octopus-fsm.test.ts — unit tests for the 14-scene FSM.
//
// Uses Vitest. Run with: `npx vitest run src/state/octopus-fsm.test.ts`
//
// V1 + V2 调度: TIMER_TICK (33Hz) 走 shouldRotate guard (8s autoNextAt) 切 scene.
// 切 scene action 用 pickRandomScene (随机 + 去重) 替代 V1 顺序轮转. ROTATE_NOW
// 跟 TIMER_TICK shouldRotate 行为一致. V2.1 SCENE_ENDED 事件已移除 (渲染层回 V1).
//
// We test:
//   1. Initial state
//   2. Single click → bubble + affection +1 + autoNextAt 重置
//   3. Pet → affection +5 + autoNextAt 重置
//   4. Force scene → jumps to specified scene (V2: 不更新 recentScenes, 重置 autoNextAt)
//   5. TIMER_TICK past autoNextAt → shouldRotate 触发 rotateScene (pickRandomScene)
//   6. TIMER_TICK past bubbleHideAt → dismisses bubble
//   7. Ask (MCP pet_ask) → shows bubble (truncated to 12)
//   8. Drag → updates position
//   9. V1 nextScene helper still works (V1 顺序轮转保留)
//  10. V2 pickRandomScene: 排除 recent + current, 等概率
//  11. V2 updateRecent: 滚动窗口
//  12. V2 TIMER_TICK shouldRotate 多次轮转不重复 (recentScenes 维护正确)

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
  ROTATION_INTERVAL_MS,
  SCENE_ORDER,
  type OctopusScene,
} from "./types";

describe("octopus-fsm", () => {
  describe("initial state", () => {
    it("starts on pretend-busy with empty recentScenes and autoNextAt set", () => {
      const actor = createActor(octopusMachine).start();
      const ctx = actor.getSnapshot().context;
      expect(ctx.scene).toBe("pretend-busy");
      expect(ctx.bubble).toBeNull();
      expect(ctx.affection).toBe(0);
      expect(ctx.recentScenes).toEqual([]);
      // autoNextAt should be in the future (~ now + 8s)
      expect(ctx.autoNextAt).toBeGreaterThan(Date.now() + ROTATION_INTERVAL_MS - 1_000);
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

  describe("V1 shouldRotate guard (8s auto-rotate → V2 pickRandomScene)", () => {
    it("does not rotate before autoNextAt", () => {
      const actor = createActor(octopusMachine).start();
      const initial = actor.getSnapshot().context.scene;
      // tick at t = now + 7s (before 8s threshold)
      const before = actor.getSnapshot().context.autoNextAt - 1_000;
      actor.send({ type: "TIMER_TICK", now: before });
      expect(actor.getSnapshot().context.scene).toBe(initial);
    });

    it("rotates to a scene NOT in {current, recentScenes} when autoNextAt reached", () => {
      const actor = createActor(octopusMachine).start();
      const initial = actor.getSnapshot().context.scene;
      // tick at autoNextAt + 100ms
      const after = actor.getSnapshot().context.autoNextAt + 100;
      actor.send({ type: "TIMER_TICK", now: after });
      const next = actor.getSnapshot().context.scene;
      expect(next).not.toBe(initial);
      // V2: recentScenes starts empty, exclude = {initial}, candidates = 13
      // After pick, recentScenes = [next]
      expect(actor.getSnapshot().context.recentScenes).toEqual([next]);
      // autoNextAt 重置: 又 ≥ 8s 后
      const newAutoNext = actor.getSnapshot().context.autoNextAt;
      expect(newAutoNext).toBeGreaterThan(after);
    });

    it("never picks recent scene across many shouldRotate (8s+8s+...)", () => {
      // 跑 14 次 shouldRotate 触发 (模拟 14*8s = 112s 桌宠时间), 验证:
      //   1. recent buffer 总是 ≤ 5 (RECENT_WINDOW_SIZE)
      //   2. 同 scene 不会在 N=5 步内重复出现
      const actor = createActor(octopusMachine).start();
      const history: OctopusScene[] = [actor.getSnapshot().context.scene];
      let now = Date.now();
      for (let i = 0; i < 14; i++) {
        // 每次让 time 推进 8s+ 让 shouldRotate 触发
        now += ROTATION_INTERVAL_MS + 1;
        actor.send({ type: "TIMER_TICK", now });
        const newScene = actor.getSnapshot().context.scene;
        const recent = actor.getSnapshot().context.recentScenes;
        history.push(newScene);
        expect(recent.length).toBeLessThanOrEqual(RECENT_WINDOW_SIZE);
        // 5 步内不重复 (历史长度 - 1 - 5 = 往前 5 步的位置)
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
      let now = Date.now();
      for (let i = 0; i < 50; i++) {
        now += ROTATION_INTERVAL_MS + 1;
        actor.send({ type: "TIMER_TICK", now });
        visited.add(actor.getSnapshot().context.scene);
      }
      // 50 步内 8s 一次, 总 400s, 8 候选, 概率覆盖 ≥ 12/14
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

    it("resets autoNextAt so 8s timer restarts from click moment", () => {
      const actor = createActor(octopusMachine).start();
      const t0 = Date.now();
      actor.send({ type: "CLICK", now: t0 });
      const newAutoNext = actor.getSnapshot().context.autoNextAt;
      // newAutoNext 应 ≈ t0 + 8s
      expect(newAutoNext).toBeGreaterThanOrEqual(t0 + ROTATION_INTERVAL_MS - 50);
      expect(newAutoNext).toBeLessThanOrEqual(t0 + ROTATION_INTERVAL_MS + 50);
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

    it("does not update recentScenes (MCP 控制不影响自然轮转)", () => {
      const actor = createActor(octopusMachine).start();
      const recentBefore = actor.getSnapshot().context.recentScenes;
      actor.send({ type: "FORCE_SCENE", scene: "breakdown", now: Date.now() });
      expect(actor.getSnapshot().context.recentScenes).toEqual(recentBefore);
    });
  });

  describe("TIMER_TICK event (shouldHideBubble)", () => {
    it("dismisses bubble when bubbleHideAt reached", () => {
      const actor = createActor(octopusMachine).start();
      const t0 = Date.now();
      actor.send({ type: "CLICK", now: t0 });
      expect(actor.getSnapshot().context.bubble).not.toBeNull();
      const hideAt = actor.getSnapshot().context.bubbleHideAt!;
      // 触发 hide 之前先确认 autoNextAt 不会同时触发 (用 t < autoNextAt 的 tick)
      actor.send({ type: "TIMER_TICK", now: hideAt + 100 });
      expect(actor.getSnapshot().context.bubble).toBeNull();
      expect(actor.getSnapshot().context.bubbleHideAt).toBeNull();
    });
  });

  describe("ROTATE_NOW event (跟 TIMER_TICK shouldRotate 行为一致)", () => {
    it("rotates scene immediately (用户/MCP 主动跳过)", () => {
      const actor = createActor(octopusMachine).start();
      const initialScene = actor.getSnapshot().context.scene;
      actor.send({ type: "ROTATE_NOW", now: Date.now() });
      expect(actor.getSnapshot().context.scene).not.toBe(initialScene);
      // V2: 也走 pickRandomScene + updateRecent
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
