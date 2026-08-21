// octopus-fsm.test.ts — unit tests for the 2-scene FSM (V1.5, 2026-08-21).
//
// V1.5: 默认 2 个 V2 视频成品 (detective-study + worker-construction).
// V2 调度保留 (pickRandomScene 随机 + 去重). 切 scene 走 TIMER_TICK 33Hz
// → shouldRotate (8s autoNextAt).
//
// We test:
//   1. Initial state
//   2. Single click → bubble + affection +1 + autoNextAt 重置
//   3. Pet → affection +5 + autoNextAt 重置
//   4. Force scene → jumps to specified scene (V2: 不更新 recentScenes)
//   5. TIMER_TICK past autoNextAt → shouldRotate 触发 rotateScene (pickRandomScene)
//   6. TIMER_TICK past bubbleHideAt → dismisses bubble
//   7. Ask (MCP pet_ask) → shows bubble (truncated to 12)
//   8. Drag → updates position
//   9. V2 pickRandomScene: 排除 recent + current, 等概率 (2 场景 N=1 验证)
//  10. V2 updateRecent: 滚动窗口
//  11. V2 TIMER_TICK shouldRotate 多次轮转不重复 (2 场景 N=1, 必定不重复)

import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import {
  octopusMachine,
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

describe("octopus-fsm (V1.5: 2 V2 视频场景)", () => {
  describe("initial state", () => {
    it("starts on detective-study with empty recentScenes and autoNextAt set", () => {
      const actor = createActor(octopusMachine).start();
      const ctx = actor.getSnapshot().context;
      expect(ctx.scene).toBe("detective-study");
      expect(ctx.bubble).toBeNull();
      expect(ctx.affection).toBe(0);
      expect(ctx.recentScenes).toEqual([]);
      // autoNextAt should be in the future (~ now + 8s)
      expect(ctx.autoNextAt).toBeGreaterThan(Date.now() + ROTATION_INTERVAL_MS - 1_000);
    });
  });

  describe("SCENE_ORDER (V1.5 2 场景)", () => {
    it("contains exactly 2 V2 scenes", () => {
      expect(SCENE_ORDER).toEqual(["detective-study", "worker-construction"]);
    });
  });

  describe("V2 pickRandomScene", () => {
    it("2 场景: exclude current, picks the other one", () => {
      // N=1, current=detective-study, recent=[]. exclude = {detective-study}, candidates = [worker-construction]
      const result = pickRandomScene("detective-study", [], () => 0);
      expect(result).toBe("worker-construction");
      const result2 = pickRandomScene("worker-construction", [], () => 0);
      expect(result2).toBe("detective-study");
    });

    it("excludes current + recent from candidates", () => {
      const recent: OctopusScene[] = ["worker-construction"];
      // exclude = {detective-study, worker-construction} → 空 → 防御分支退化为全候选
      // candidates 全空时 pickRandomScene 仍返回某个 (防御)
      const result = pickRandomScene("detective-study", recent, () => 0);
      // 2 场景都被 exclude → 防御: 任意一个 (不保证是哪个, 但 2 候选都不在空集)
      expect(SCENE_ORDER).toContain(result);
    });

    it("never returns the current scene (N=1 working set)", () => {
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
      const result = updateRecent([], "detective-study");
      expect(result).toEqual(["detective-study"]);
    });

    it("trims oldest when over window size (N=1 keeps 1)", () => {
      const recent: OctopusScene[] = ["detective-study"];
      const result = updateRecent(recent, "worker-construction");
      expect(result).toEqual(["worker-construction"]);
      expect(result.length).toBe(RECENT_WINDOW_SIZE);
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

    it("rotates to the OTHER scene when autoNextAt reached (2 场景 N=1)", () => {
      const actor = createActor(octopusMachine).start();
      const initial = actor.getSnapshot().context.scene;
      // tick at autoNextAt + 100ms
      const after = actor.getSnapshot().context.autoNextAt + 100;
      actor.send({ type: "TIMER_TICK", now: after });
      const next = actor.getSnapshot().context.scene;
      // 2 场景 N=1 必切到另一个
      expect(next).not.toBe(initial);
      // recentScenes 维护
      expect(actor.getSnapshot().context.recentScenes).toEqual([next]);
      // autoNextAt 重置
      const newAutoNext = actor.getSnapshot().context.autoNextAt;
      expect(newAutoNext).toBeGreaterThan(after);
    });

    it("2 场景 N=1 多次轮转必不重复 (alternating)", () => {
      const actor = createActor(octopusMachine).start();
      const history: OctopusScene[] = [actor.getSnapshot().context.scene];
      let now = Date.now();
      for (let i = 0; i < 10; i++) {
        now += ROTATION_INTERVAL_MS + 1;
        actor.send({ type: "TIMER_TICK", now });
        const newScene = actor.getSnapshot().context.scene;
        history.push(newScene);
        // 必不连续重复
        if (history.length >= 2) {
          expect(history[history.length - 1]).not.toBe(history[history.length - 2]);
        }
      }
      // 10 步内 2 场景来回切, 1 个唯一
      expect(new Set(history).size).toBe(2);
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
      expect(newAutoNext).toBeGreaterThanOrEqual(t0 + ROTATION_INTERVAL_MS - 50);
      expect(newAutoNext).toBeLessThanOrEqual(t0 + ROTATION_INTERVAL_MS + 50);
    });

    it("picks bubble from current scene's text pool", () => {
      const actor = createActor(octopusMachine).start();
      // Force scene to "worker-construction" so we know which pool
      actor.send({ type: "FORCE_SCENE", scene: "worker-construction", now: Date.now() });
      actor.send({ type: "DISMISS_BUBBLE", now: Date.now() });
      actor.send({ type: "CLICK", now: Date.now() });
      const bubble = actor.getSnapshot().context.bubble!;
      const pool = BUBBLE_BY_SCENE["worker-construction"];
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
      for (let i = 0; i < 25; i++) {
        actor.send({ type: "PET", now: Date.now() + i });
      }
      expect(actor.getSnapshot().context.affection).toBe(100);
    });
  });

  describe("FORCE_SCENE event", () => {
    it("jumps to specified scene", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "FORCE_SCENE", scene: "worker-construction", now: Date.now() });
      expect(actor.getSnapshot().context.scene).toBe("worker-construction");
    });

    it("does not update recentScenes (MCP 控制不影响自然轮转)", () => {
      const actor = createActor(octopusMachine).start();
      const recentBefore = actor.getSnapshot().context.recentScenes;
      actor.send({ type: "FORCE_SCENE", scene: "worker-construction", now: Date.now() });
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
      expect(actor.getSnapshot().context.recentScenes).toHaveLength(1);
    });
  });

  describe("ASK event (MCP pet_ask)", () => {
    it("shows bubble with provided text", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "ASK", text: "施工中", now: Date.now() });
      expect(actor.getSnapshot().context.bubble).toBe("施工中");
    });

    it("truncates to 12 characters", () => {
      const actor = createActor(octopusMachine).start();
      actor.send({ type: "ASK", text: "12345678901234567890", now: Date.now() });
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
  });
});
