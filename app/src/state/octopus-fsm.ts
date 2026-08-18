// Octopus Pet — XState v5 machine for the 14-scene FSM.
// Per plan §1.9.2: simple timer rotation + click/pet events, MCP tool calls mapped to events.
//
// XState v5 uses setup({...}).createMachine({...}) pattern. We use a single machine
// (no nested states) — the "scene" is just context. KISS for V1.

import { setup, assign } from "xstate";
import {
  BUBBLE_BY_SCENE,
  BUBBLE_DURATION_MS,
  MAX_AFFECTION,
  ROTATION_INTERVAL_MS,
  SCENE_ORDER,
  type OctopusEvent,
  type OctopusScene,
  type OctopusState,
} from "./types";

function nextScene(scene: OctopusScene): OctopusScene {
  const i = SCENE_ORDER.indexOf(scene);
  return SCENE_ORDER[(i + 1) % SCENE_ORDER.length] as OctopusScene;
}

function pickBubble(scene: OctopusScene, rng: () => number = Math.random): string {
  const lines = BUBBLE_BY_SCENE[scene];
  return lines[Math.floor(rng() * lines.length)];
}

const initialContext: OctopusState = {
  scene: "pretend-busy",
  frame: 0,
  bubble: null,
  autoNextAt: Date.now() + ROTATION_INTERVAL_MS,
  bubbleHideAt: null,
  affection: 0,
  position: { x: 100, y: 100 },
};

export const octopusMachine = setup({
  types: {
    context: {} as OctopusState,
    events: {} as OctopusEvent,
  },
  actions: {
    rotateScene: assign(() => ({
      scene: nextScene(initialContext.scene), // overridden by guard logic
      frame: 0,
      autoNextAt: Date.now() + ROTATION_INTERVAL_MS,
      bubble: null as string | null,
      bubbleHideAt: null as number | null,
    })),
    forceScene: assign(({ context, event }) => {
      if (event.type !== "FORCE_SCENE") return {};
      return {
        scene: event.scene,
        frame: 0,
        autoNextAt: event.now + ROTATION_INTERVAL_MS,
        bubble: null,
        bubbleHideAt: null,
      };
    }),
    onClick: assign(({ context, event }) => {
      if (event.type !== "CLICK") return {};
      const text = pickBubble(context.scene);
      return {
        bubble: text,
        bubbleHideAt: event.now + BUBBLE_DURATION_MS,
        autoNextAt: event.now + BUBBLE_DURATION_MS + ROTATION_INTERVAL_MS,
        affection: Math.min(MAX_AFFECTION, context.affection + 1),
      };
    }),
    onPet: assign(({ context, event }) => {
      if (event.type !== "PET") return {};
      return {
        bubble: "啊~",
        bubbleHideAt: event.now + BUBBLE_DURATION_MS,
        autoNextAt: event.now + BUBBLE_DURATION_MS + ROTATION_INTERVAL_MS,
        affection: Math.min(MAX_AFFECTION, context.affection + 5),
      };
    }),
    onAsk: assign(({ event }) => {
      if (event.type !== "ASK") return {};
      // V1 spec: ≤ 12 chars
      const text = event.text.length > 12 ? event.text.slice(0, 12) : event.text;
      return {
        bubble: text,
        bubbleHideAt: event.now + BUBBLE_DURATION_MS,
      };
    }),
    dismissBubble: assign(() => ({
      bubble: null as string | null,
      bubbleHideAt: null as number | null,
    })),
    onDrag: assign(({ event }) => {
      if (event.type !== "DRAG") return {};
      return { position: { x: event.x, y: event.y } };
    }),
  },
  guards: {
    shouldRotate: ({ context, event }) => {
      if (event.type !== "TIMER_TICK") return false;
      return event.now >= context.autoNextAt && context.bubbleHideAt === null;
    },
    shouldHideBubble: ({ context, event }) => {
      if (event.type !== "TIMER_TICK") return false;
      return context.bubbleHideAt !== null && event.now >= context.bubbleHideAt;
    },
  },
}).createMachine({
  id: "octopus",
  initial: "active",
  context: initialContext,
  states: {
    active: {
      on: {
        TIMER_TICK: [
          {
            guard: "shouldHideBubble",
            actions: "dismissBubble",
          },
          {
            guard: "shouldRotate",
            actions: "rotateScene",
          },
        ],
        ROTATE_NOW: {
          actions: assign(({ context }) => ({
            scene: nextScene(context.scene),
            frame: 0,
            autoNextAt: Date.now() + ROTATION_INTERVAL_MS,
            bubble: null as string | null,
            bubbleHideAt: null as number | null,
          })),
        },
        FORCE_SCENE: { actions: "forceScene" },
        CLICK: { actions: "onClick" },
        PET: { actions: "onPet" },
        ASK: { actions: "onAsk" },
        DISMISS_BUBBLE: { actions: "dismissBubble" },
        DRAG: { actions: "onDrag" },
      },
    },
  },
});

export { nextScene, pickBubble };
