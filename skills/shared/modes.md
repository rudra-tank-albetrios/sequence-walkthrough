## Modes

| Mode | When | Rules |
|---|---|---|
| Explain (default) | "diagram", "explain", "how does X work" | The flow as the code is today. |
| Proposed | "how would I build X" | `%% @mode proposed`, title starts `Proposed:`. Reuse real layers and conventions. New steps get `@ref <existing file:line> (pattern)` or no ref. |
| Scoped | "only the part after X" | `%% @scope <starts … ends …>`. First participant is where the scope begins, `@trigger` says where it is entered from. Nothing outside it. |
| Easy | "easy language", "beginner friendly" | Same layers and arrows as Explain, never merged. Only the words change: everyday `@step`, a `@term` for each technical word. Labels and statuses stay exact. |
| Compact | only when asked for fewer steps or combined layers | Routes through Repository become `participant API as Backend`. Say Compact in the title line. |
