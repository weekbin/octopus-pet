// AUTO-GENERATED from scenes.json by scripts/build_scene_registry.py.
// DO NOT EDIT — re-run the script after editing scenes.json.


import type { OctopusScene } from "./types";

/** Scene id union — derived from scenes.json */
export const SCENE_IDS = ["detective-study", "worker-construction", "drink-coffee", "breakdown", "friday-5pm", "pretend-busy", "stay-late", "treat-milk-tea", "13-debug-snack", "16-deadline-sprint", "17-celebrate", "18-monday-morning", "19-thumbs-up", "20-thinking", "22-yay-friday", "23-dancing", "24-surprised", "29-shy", "30-wave", "31-apologize", "32-laugh", "33-magic", "34-meditation", "35-blink", "36-cheer", "payday"] as const;

/** First-occurrence order — used by V2.1 pickRandomScene */
export const SCENE_ORDER: readonly OctopusScene[] = SCENE_IDS;

/** Bubble lines per scene — read by FSM onClick action */
export const BUBBLE_BY_SCENE: Record<OctopusScene, readonly string[]> = {
  "detective-study": ["在研究", "放大看看", "找到了", "等一下", "认真脸", "让我看看...", "用户不好糊弄"],
  "worker-construction": ["施工中", "砸一下", "放桌子", "建好了", "戴好安全帽", "让我想想...", "我摸鱼应该不会被发现"],
  "drink-coffee": ["喝咖啡", "好香啊", "续杯吗", "今日份咖啡", "早八续命", "摸鱼时间", "让我清醒一下"],
  "breakdown": ["抱头", "撑不住", "我裂了", "不行了", "想下班", "累死了", "救救我"],
  "friday-5pm": ["跑了", "起飞", "下班咯", "冲鸭", "周末啦", "自由了", "收工"],
  "pretend-busy": ["忙死了", "别烦", "敲键盘", "好累", "加班中", "努力搬砖", "假装"],
  "stay-late": ["叹气", "好累", "加班中", "想家", "撑住", "摸鱼", "躺平"],
  "treat-milk-tea": ["喝奶茶", "好喝", "续杯", "奶茶", "吨吨吨", "加糖", "放松"],
  "13-debug-snack": ["解bug", "吃点啥", "薯片", "可乐", "嘴馋", "再来一口", "真香"],
  "16-deadline-sprint": ["还有1h", "救命", "加快", "赶DDL", "要死了", "来不及", "冲刺"],
  "17-celebrate": ["完成", "耶", "庆祝", "撒花", "撒彩", "搞定", "欢呼"],
  "18-monday-morning": ["周一", "再睡5分钟", "不想起", "好困", "闹钟响", "挣扎", "罢工"],
  "19-thumbs-up": ["棒", "不错", "好赞", "可以", "认可", "确认", "顶你"],
  "20-thinking": ["想想", "思考", "嗯", "让我想想", "有点难", "该怎么办", "也许"],
  "22-yay-friday": ["周五", "下班啦", "干杯", "走起", "起飞", "周末", "cheers"],
  "23-dancing": ["跳", "动次", "蹦迪", "音乐", "律动", "撒欢", "嗨起来"],
  "24-surprised": ["啥", "惊", "什么鬼", "真的假的", "哇", "哦豁", "震惊"],
  "29-shy": ["害羞", "好害臊", "别看", "脸红", "捂脸", "甜", "诶嘿"],
  "30-wave": ["嗨", "你好", "过来", "招呼", "挥手", "好久不见", "哟"],
  "31-apologize": ["抱歉", "对不起", "我错", "求原谅", "别生气", "呜呜", "sorry"],
  "32-laugh": ["哈哈", "笑死", "太逗", "笑哭", "哈哈哈", "逗我呢", "笑"],
  "33-magic": ["魔法", "变", "惊喜", "奇迹", "看我", "bilibala", "奇迹时刻"],
  "34-meditation": ["安静", "深呼吸", "冥想", "心静", "放松", "禅", "om"],
  "35-blink": ["眨", "干嘛", "嗯", "看我", "眨眼", "啥事", "等下"],
  "36-cheer": ["加油", "冲鸭", "go", "we are", "胜利", "团队", "齐心"],
  "payday": ["发薪", "有钱", "爽", "money", "收钱", "豪", "撒钱"],
} as const;

/**
 * Scene → animation descriptor (给 useAnimation 查 provider 用).
 * `type` 对应 animationRegistry 里注册的 provider id;
 * `source` 格式特定 (URL / file path / JSON / 场景 id 走 1:1 命名).
 */
export interface SceneAnimation {
  readonly type: string;
  readonly source: string;
}
export interface Scene {
  readonly id: OctopusScene;
  readonly animation: SceneAnimation;
  readonly bubbleLines: readonly string[];
}
export const SCENES: readonly Scene[] = [
  {
    id: "detective-study",
    animation: { type: "apng", source: "detective-study" },
    bubbleLines: ["在研究", "放大看看", "找到了", "等一下", "认真脸", "让我看看...", "用户不好糊弄"],
  },
  {
    id: "worker-construction",
    animation: { type: "apng", source: "worker-construction" },
    bubbleLines: ["施工中", "砸一下", "放桌子", "建好了", "戴好安全帽", "让我想想...", "我摸鱼应该不会被发现"],
  },
  {
    id: "drink-coffee",
    animation: { type: "apng", source: "drink-coffee" },
    bubbleLines: ["喝咖啡", "好香啊", "续杯吗", "今日份咖啡", "早八续命", "摸鱼时间", "让我清醒一下"],
  },
  {
    id: "breakdown",
    animation: { type: "apng", source: "breakdown" },
    bubbleLines: ["抱头", "撑不住", "我裂了", "不行了", "想下班", "累死了", "救救我"],
  },
  {
    id: "friday-5pm",
    animation: { type: "apng", source: "friday-5pm" },
    bubbleLines: ["跑了", "起飞", "下班咯", "冲鸭", "周末啦", "自由了", "收工"],
  },
  {
    id: "pretend-busy",
    animation: { type: "apng", source: "pretend-busy" },
    bubbleLines: ["忙死了", "别烦", "敲键盘", "好累", "加班中", "努力搬砖", "假装"],
  },
  {
    id: "stay-late",
    animation: { type: "apng", source: "stay-late" },
    bubbleLines: ["叹气", "好累", "加班中", "想家", "撑住", "摸鱼", "躺平"],
  },
  {
    id: "treat-milk-tea",
    animation: { type: "apng", source: "treat-milk-tea" },
    bubbleLines: ["喝奶茶", "好喝", "续杯", "奶茶", "吨吨吨", "加糖", "放松"],
  },
  {
    id: "13-debug-snack",
    animation: { type: "apng", source: "13-debug-snack" },
    bubbleLines: ["解bug", "吃点啥", "薯片", "可乐", "嘴馋", "再来一口", "真香"],
  },
  {
    id: "16-deadline-sprint",
    animation: { type: "apng", source: "16-deadline-sprint" },
    bubbleLines: ["还有1h", "救命", "加快", "赶DDL", "要死了", "来不及", "冲刺"],
  },
  {
    id: "17-celebrate",
    animation: { type: "apng", source: "17-celebrate" },
    bubbleLines: ["完成", "耶", "庆祝", "撒花", "撒彩", "搞定", "欢呼"],
  },
  {
    id: "18-monday-morning",
    animation: { type: "apng", source: "18-monday-morning" },
    bubbleLines: ["周一", "再睡5分钟", "不想起", "好困", "闹钟响", "挣扎", "罢工"],
  },
  {
    id: "19-thumbs-up",
    animation: { type: "apng", source: "19-thumbs-up" },
    bubbleLines: ["棒", "不错", "好赞", "可以", "认可", "确认", "顶你"],
  },
  {
    id: "20-thinking",
    animation: { type: "apng", source: "20-thinking" },
    bubbleLines: ["想想", "思考", "嗯", "让我想想", "有点难", "该怎么办", "也许"],
  },
  {
    id: "22-yay-friday",
    animation: { type: "apng", source: "22-yay-friday" },
    bubbleLines: ["周五", "下班啦", "干杯", "走起", "起飞", "周末", "cheers"],
  },
  {
    id: "23-dancing",
    animation: { type: "apng", source: "23-dancing" },
    bubbleLines: ["跳", "动次", "蹦迪", "音乐", "律动", "撒欢", "嗨起来"],
  },
  {
    id: "24-surprised",
    animation: { type: "apng", source: "24-surprised" },
    bubbleLines: ["啥", "惊", "什么鬼", "真的假的", "哇", "哦豁", "震惊"],
  },
  {
    id: "29-shy",
    animation: { type: "apng", source: "29-shy" },
    bubbleLines: ["害羞", "好害臊", "别看", "脸红", "捂脸", "甜", "诶嘿"],
  },
  {
    id: "30-wave",
    animation: { type: "apng", source: "30-wave" },
    bubbleLines: ["嗨", "你好", "过来", "招呼", "挥手", "好久不见", "哟"],
  },
  {
    id: "31-apologize",
    animation: { type: "apng", source: "31-apologize" },
    bubbleLines: ["抱歉", "对不起", "我错", "求原谅", "别生气", "呜呜", "sorry"],
  },
  {
    id: "32-laugh",
    animation: { type: "apng", source: "32-laugh" },
    bubbleLines: ["哈哈", "笑死", "太逗", "笑哭", "哈哈哈", "逗我呢", "笑"],
  },
  {
    id: "33-magic",
    animation: { type: "apng", source: "33-magic" },
    bubbleLines: ["魔法", "变", "惊喜", "奇迹", "看我", "bilibala", "奇迹时刻"],
  },
  {
    id: "34-meditation",
    animation: { type: "apng", source: "34-meditation" },
    bubbleLines: ["安静", "深呼吸", "冥想", "心静", "放松", "禅", "om"],
  },
  {
    id: "35-blink",
    animation: { type: "apng", source: "35-blink" },
    bubbleLines: ["眨", "干嘛", "嗯", "看我", "眨眼", "啥事", "等下"],
  },
  {
    id: "36-cheer",
    animation: { type: "apng", source: "36-cheer" },
    bubbleLines: ["加油", "冲鸭", "go", "we are", "胜利", "团队", "齐心"],
  },
  {
    id: "payday",
    animation: { type: "apng", source: "payday" },
    bubbleLines: ["发薪", "有钱", "爽", "money", "收钱", "豪", "撒钱"],
  },
];
