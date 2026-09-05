# 词库目录

这是项目统一的词库管理目录。每个范围一个 CSV，字段固定为：

```csv
word,phonetic,pos,meaning,example,example_zh
```

- `word`：单词（必填）
- `phonetic`：音标（可空）
- `pos`：词性，如 n. / v. / adj.（可空）
- `meaning`：中文释义（必填）
- `example`：英文例句（可空）
- `example_zh`：例句中文翻译（可空）

## 当前词库

| 范围 | 词条数 | 来源 |
| --- | ---: | --- |
| CET4 | 6079 | 项目精修 430 条 + 开源词表 |
| CET6 | 4497 | 项目精修 290 条 + 开源词表 |
| 考研 | 5046 | KyleBing/english-vocabulary |
| 托福 | 10366 | KyleBing/english-vocabulary |
| SAT | 4462 | KyleBing/english-vocabulary |

## 如何加新词

直接编辑对应范围的 CSV，新增一行即可；Excel / WPS / VS Code 都能打开。

示例：

```csv
word,phonetic,pos,meaning,example,example_zh
serendipity,,n.,意外发现珍宝的运气,,,
```

## 如何新增一个词库范围

1. 在 `wordbank/` 下新建 `你的范围名.csv`，格式同上。
2. 修改 `build_wordbank.py` 顶部的 `LEVELS` 列表，加入范围名。
3. 运行 `python build_wordbank.py` 重新生成 `browser-extension/words.js`。
4. 在扩展设置中会看到新范围，可切换学习。

## 数据来源与许可

- 项目精修 720 条：本项目人工整理，含音标和例句。
- `KyleBing/english-vocabulary`：词条与释义，公开仓库，无明确许可证。
- `ismartcoding/endict`：官方 2016 版四六级大纲词表（MIT），用于补全未覆盖单词。

以上词表仅用于教育学习场景。
