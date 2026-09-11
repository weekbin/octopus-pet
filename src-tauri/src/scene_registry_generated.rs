// AUTO-GENERATED from scenes.json by scripts/build_scene_registry.py.
// DO NOT EDIT — re-run the script after editing scenes.json.


/** Scene ids exposed to MCP `pet_list_states` and validated by `pet_show`. */
pub static SCENES: &[&str] = &[
    "detective-study",
    "worker-construction",
    "drink-coffee",
    "breakdown",
    "friday-5pm",
    "pretend-busy",
    "stay-late",
    "treat-milk-tea",
];

/** Bubble lines per scene — surfaced for diagnostics / future use. */
pub static BUBBLE_LINES: &[(&str, &[&str])] = &[
    ("detective-study", &["在研究", "放大看看", "找到了", "等一下", "认真脸", "让我看看...", "用户不好糊弄"]),
    ("worker-construction", &["施工中", "砸一下", "放桌子", "建好了", "戴好安全帽", "让我想想...", "我摸鱼应该不会被发现"]),
    ("drink-coffee", &["喝咖啡", "好香啊", "续杯吗", "今日份咖啡", "早八续命", "摸鱼时间", "让我清醒一下"]),
    ("breakdown", &["抱头", "撑不住", "我裂了", "不行了", "想下班", "累死了", "救救我"]),
    ("friday-5pm", &["跑了", "起飞", "下班咯", "冲鸭", "周末啦", "自由了", "收工"]),
    ("pretend-busy", &["忙死了", "别烦", "敲键盘", "好累", "加班中", "努力搬砖", "假装"]),
    ("stay-late", &["叹气", "好累", "加班中", "想家", "撑住", "摸鱼", "躺平"]),
    ("treat-milk-tea", &["喝奶茶", "好喝", "续杯", "奶茶", "吨吨吨", "加糖", "放松"]),
];
