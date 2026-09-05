# -*- coding: utf-8 -*-
"""Fill the supplied Word template without changing the original file."""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
ET.register_namespace("w", W)

TEMPLATE = Path(r"D:\xwechat_files\wxid_yhpzemtk7zm112_6b95\msg\file\2026-09\软件开发文档模板.docx")
OUTPUT = Path(__file__).with_name("软件开发文档_单词随行.docx")


def text_of(element: ET.Element) -> str:
    return "".join(t.text or "" for t in element.findall(".//w:t", NS))


def set_paragraph(paragraph: ET.Element, value: str) -> None:
    """Replace runs while keeping the paragraph's original formatting."""
    ppr = paragraph.find("w:pPr", NS)
    for child in list(paragraph):
        if child is not ppr:
            paragraph.remove(child)

    pieces = value.split("\n")
    for index, piece in enumerate(pieces):
        run = ET.SubElement(paragraph, f"{{{W}}}r")
        text = ET.SubElement(run, f"{{{W}}}t")
        if piece[:1].isspace() or piece[-1:].isspace():
            text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        text.text = piece
        if index < len(pieces) - 1:
            ET.SubElement(run, f"{{{W}}}br")


def set_cell(cell: ET.Element, value: str) -> None:
    """Use the first paragraph in a cell and remove leftover example paragraphs."""
    tcpr = cell.find("w:tcPr", NS)
    paragraphs = cell.findall("w:p", NS)
    if paragraphs:
        first = paragraphs[0]
        for paragraph in paragraphs[1:]:
            cell.remove(paragraph)
    else:
        first = ET.SubElement(cell, f"{{{W}}}p")
    set_paragraph(first, value)


def main() -> None:
    if not TEMPLATE.exists():
        raise FileNotFoundError(f"模板不存在：{TEMPLATE}")

    with zipfile.ZipFile(TEMPLATE, "r") as source:
        document = ET.fromstring(source.read("word/document.xml"))
        paragraphs = document.findall(".//w:body/w:p", NS)
        tables = document.findall(".//w:body/w:tbl", NS)

        # Keep the template's heading structure, but replace all explanatory examples.
        paragraph_values = {
            0: "软件开发文档",
            1: "小学期项目：单词随行·四六级浏览助手",
            12: "本项目将浏览器作为学习场景，让用户在浏览网页时顺手完成四六级词汇学习。",
            15: "本项目希望解决“上网和背单词相互割裂”的问题。很多同学有背四六级词汇的需求，但打开单词软件后容易中断正在进行的学习或阅读。浏览器插件可以把单词卡片、名言和复习入口放在网页旁边，让碎片时间也能产生稳定的学习记录。",
            16: "现实问题：用户缺少持续、低打扰的复习提醒，错过或不会的单词也容易被遗忘。",
            17: "产品定位：一个安装在 Edge/Chrome 中的轻量学习助手，不需要登录服务器，打开网页即可使用。",
            18: "学习价值：通过认识/再学、四选一测试、错题集和间隔复习，帮助用户逐步掌握四六级词汇，同时积累英文名言和例句。",
            19: "",
            20: "本项目面向准备大学英语四、六级考试的学生，提供网页浮窗学习、四选一测试、错题收集、每日复习和自定义词库等功能。插件通过浏览器的 content script 在网页右下角显示单词卡片，通过 popup 和独立学习页提供更完整的学习操作。用户可选择 CET4、CET6、考研、托福、SAT 或自己导入的词库，多个词库可以合并使用。系统把学习进度保存在浏览器本地，并用 5 分钟、30 分钟、12 小时、1/2/4/7/15 天等间隔安排错题复习。切换网页时还会弹出中英对照的英文名人名言，形成轻量的学习提醒。",
            22: "“单词随行·四六级浏览助手”是一款 Microsoft Edge/Chrome 浏览器扩展。它在用户浏览网页时显示英文单词卡片和页面切换名言，也提供学习页、四选一测试、错题集、每日复习、自定义词库及多词库组合功能。用户的学习数据只保存在本地，核心价值是把背词融入日常上网过程，降低开始复习的成本。",
            23: "",
            26: "系统按“界面层—业务逻辑层—数据层”组织。界面层包括网页浮窗、浏览器弹窗和独立学习页；业务层负责取词、测验、错题记录、复习时间计算、词库导入和多词库合并；数据层由内置词库与 chrome.storage.local 组成。词库源文件使用 wordbank/*.csv 维护，通过 build_wordbank.py 生成浏览器运行时使用的 words.js。",
            33: "系统调用关系：网页 content script / popup / learn.html → ww-common.js 共享状态与业务规则 → chrome.storage.local；内置词库路径为 wordbank/*.csv → build_wordbank.py → browser-extension/words.js。",
            35: "",
            37: "项目主要由 manifest.json、background.js、content.js、popup、learn、ww-common.js、words.js 和 wordbank 目录组成。manifest.json 声明扩展入口和权限；content.js 负责网页浮窗与名言；popup 和 learn 页面负责学习、测验及管理；ww-common.js 统一状态格式和复习规则；wordbank 与构建脚本负责词库维护。",
            40: "不使用服务器数据库。内置词库的维护格式为 CSV，字段为 word、phonetic、pos、meaning、example、example_zh，构建后生成 words.js；用户导入支持 CSV 和 JSON，并以带自定义名称的词库保存。学习进度使用 chrome.storage.local 的 wwState 对象保存，浏览器关闭后数据仍然保留。",
            41: "wwState 主要包含 learned（已学词状态）、mistakes（错题及下次复习时间）、daily（每日统计）、customBanks（自定义词库）、selectedBanks（当前选中的词库）、debugDayOffset（复习调试日期偏移）以及名言和浮窗设置。单词在错题记录中使用 bankId::word 作为唯一键，避免不同词库的同形词互相覆盖。",
            43: "导入文件示例：CSV 第一行为 word,phonetic,pos,meaning,example,example_zh，后续每行一个单词；JSON 可使用数组或 {\"words\":[...]} 结构。导入时先填写词库名称，系统会生成独立词库；错题集导入也会作为一个可选择的词库保存。",
            45: "主要页面包括网页浮窗、浏览器弹窗和独立学习页。网页浮窗负责低打扰展示单词和名言；弹窗适合快速认识单词、做题和修改设置；学习页负责查看统计、每日错题、错题集、词库导入导出以及复习调试。",
            47: "",
            50: "本项目的关键技术主要有：浏览器扩展 Manifest V3 与 content script；基于 chrome.storage.local 的跨页面状态保存；CSV/JSON 词库解析与多词库合并；基于间隔复习的错题调度。",
            51: "网页浮窗注入与生命周期管理",
            52: "本地状态同步与数据迁移",
            53: "错题间隔复习与多词库筛选",
            55: "算法一：基于间隔复习的错题调度",
            56: "需要解决的问题：用户答错单词后，不能只把它永久放在列表中，也不能每天机械地重复全部错题。系统需要结合答题结果和上次复习情况，计算下一次应该复习的时间，并支持在课堂演示时快速推进日期。",
            57: "算法思路：每个学习词都有 level、due 和 seen 等状态，每个错题还保存 count、lastAt 和 nextReviewAt。答错时将学习等级降到起点，并安排 5 分钟后复习；答对后按 5 分钟、30 分钟、12 小时、1 天、2 天、4 天、7 天、15 天的间隔逐步安排下一次时间；再次答错则重新回到短间隔。learn.js 中的 reviewPool() 只筛选当前选中词库、存在错题记录且 nextReviewAt 已到期的单词。ww-common.js 的 WW.studyNow() 会在当前时间上叠加 debugDayOffset 天，因此调试台可以模拟日期推进；重置时恢复推进前的进度快照，不修改 Windows 系统时间。",
            58: "伪代码：\n输入：单词 word、答题结果 result\n1. 读取当前选中的词库和 wwState\n2. 如果 result = 错：学习等级 level 设为 0，错题 count 加一，nextReviewAt = studyNow() + 5 分钟\n3. 如果 result = 对：level 加一，按间隔表计算 due；若已有错题记录，同步更新其 nextReviewAt\n4. 保存 wwState，并刷新错题数量和每日复习列表\n5. reviewPool() 返回存在错题记录且 nextReviewAt <= studyNow() 的记录",
            60: "关键实现位置：ww-common.js 中的 WW.studyNow()、WW.due()、WW.wordKey() 和 learn.js 中的 mark()、recordMistake()、reviewPool()。popup.js、content.js 和 learn.js 通过相同的 wwState 结构保存学习结果，保证不同入口使用同一套复习规则。",
            61: "",
            62: "效果与限制：短间隔可以及时再次看到不会的词，长间隔可以减少已经掌握词的重复出现；调试台便于课堂展示遗忘曲线。当前间隔是固定规则，没有根据个人正确率自动调整，也没有云端同步。",
            63: "算法二：多词库合并与唯一键处理",
            64: "系统先读取用户选择的内置词库和自定义词库，再合并为当前学习池；同一词库内按单词去重，不同词库中的同形词使用 bankId::word 区分。这样既能同时查看多个范围，也能保留每个自定义词库的独立名称和导入导出能力。",
            66: "难点一：浮窗、弹窗和学习页需要读写同一份进度。解决方法是把状态规范化和复习规则集中放到 ww-common.js，并统一通过 chrome.storage.local 保存。\n难点二：自定义词库数量不止一个，还要支持错题集导入。解决方法是每个词库保存 id、name、words 三个核心字段，界面使用 selectedBanks 数组维护多选结果。\n难点三：遗忘曲线通常需要等待较长时间才能观察。解决方法是增加复习调试台，只改变插件内部 studyNow()，并支持快照恢复。",
            67: "",
            68: "",
            69: "",
            72: "运行时不需要安装 Python、Node.js 或数据库。若要重新整理和生成内置词库，需额外准备 Python 3.10 及以上版本。",
            74: "安装步骤：\n1. 解压或打开项目目录，确认 browser-extension 文件夹中存在 manifest.json。\n2. 打开 Microsoft Edge，在地址栏输入 edge://extensions。\n3. 打开右上角“开发人员模式”。\n4. 点击“加载解压缩的扩展”，选择 E:\\VibeCoding\\WordEveryWhere\\browser-extension。\n5. 打开任意网页，点击工具栏中的扩展图标即可使用；修改代码后在扩展页面点击“重新加载”。\n词库维护：修改 wordbank 目录中的 CSV 后，在项目根目录运行 python build_wordbank.py，再重新加载扩展。",
            75: "",
            76: "",
            78: "核心使用流程：\n1. 点击浏览器工具栏中的扩展图标，选择词库；也可以点击“打开学习页”进入完整界面。\n2. 在网页右下角单词浮窗中点击“认识”或“再学”，使用 Alt+Shift+W 可以显示或隐藏浮窗。\n3. 在学习页选择“开始测试”，完成四选一题目；答错的单词会自动进入错题集。\n4. 在“每日复习”中查看到期错题，在“错题集”中查看错题次数、最近错误时间和下次复习时间。\n5. 导入自定义词库前填写名称，再选择 CSV/JSON 文件；顶部可以同时勾选多个词库。\n6. 需要演示遗忘曲线时，在“复习调试台”推进学习日期；演示结束后点击重置，恢复真实进度。",
            79: "",
            80: "网页浮窗：显示单词、音标、词性、释义和例句；点击“认识/再学”记录学习结果。",
            81: "学习页：查看今日统计、开始四选一测试、进入每日复习和错题集。",
            82: "词库管理：输入自定义名称后导入 CSV/JSON，可导出错题集，也可同时勾选多个词库组成学习池。",
            83: "复习调试：推进插件内部日期以验证 5 分钟至 15 天的复习安排，重置时恢复调试前状态。",
            84: "",
            86: "",
            87: "WordEveryWhere/\n├─ browser-extension/\n│  ├─ manifest.json                 # 扩展声明、权限和入口\n│  ├─ content.js / content.css      # 网页浮窗和名言\n│  ├─ popup.html / popup.js / popup.css # 工具栏弹窗\n│  ├─ learn.html / learn.js / learn.css # 完整学习页\n│  ├─ ww-common.js                  # 共享状态和复习规则\n│  ├─ background.js                 # 快捷键和后台消息\n│  ├─ words.js                      # 生成后的内置词库\n│  ├─ quotes.js                     # 英文名言数据\n│  └─ README.md                     # 使用说明\n├─ wordbank/\n│  ├─ CET4.csv / CET6.csv           # 四六级词库\n│  ├─ 考研.csv / 托福.csv / SAT.csv  # 其他范围词库\n│  ├─ curated.csv                   # 整理后的补充词库\n│  └─ README.md\n└─ build_wordbank.py                # CSV 词库构建脚本",
            88: "",
            91: "通过本项目，我熟悉了 Manifest V3 浏览器扩展的基本结构，理解了 content script、popup、service worker 之间的配合方式，也练习了 HTML/CSS/JavaScript 页面开发和浏览器本地存储。项目过程中最有价值的收获是把一个简单的“显示单词”想法拆成词库、学习记录、测验、错题、复习和导入导出等可以独立维护的功能。\n目前的不足包括：没有账号和云端同步，复习间隔仍是固定参数，生成后的 words.js 体积较大，词条还没有接入发音音频。调试台适合演示但不能替代长期真实学习记录，后续需要更多真实用户测试来验证复习效果。",
            92: "",
            94: "后续可以增加浏览器账户同步或本地备份提醒，避免更换设备后丢失进度；增加发音、跟读和听力练习；根据个人答题正确率动态调整间隔；补充学习统计图表和更多题型；继续清洗词库内容，并增加可配置的名言来源和网页提醒频率。",
            95: "",
            96: "",
        }
        for index, value in paragraph_values.items():
            if index < len(paragraphs):
                set_paragraph(paragraphs[index], value)

        # Basic information table.
        table0 = tables[0]
        basic = {
            0: ("项目名称", "单词随行·四六级浏览助手"),
            1: ("开发者姓名", "待填写"),
            2: ("学号", "待填写"),
            3: ("专业 / 班级", "待填写"),
            4: ("课程", "小学期项目"),
            5: ("开发周期", "2026年8月25日 至 2026年9月6日"),
            6: ("技术栈", "Microsoft Edge / Chrome 扩展 + Manifest V3 + 原生 JavaScript + HTML/CSS + VS Code"),
            7: ("预期代码量", "约 3000 行（不含自动生成的词库文件）"),
            8: ("代码仓库", "GitHub：待创建 WordEverywhere（公开仓库）"),
            9: ("运行环境", "Windows 10/11 + Microsoft Edge 或 Chrome 浏览器"),
        }
        for row_index, (label, value) in basic.items():
            cells = table0.findall("./w:tr", NS)[row_index].findall("./w:tc", NS)
            set_cell(cells[0], label)
            set_cell(cells[1], value)

        def set_table_rows(table_index: int, rows: list[list[str]]) -> None:
            table = tables[table_index]
            xml_rows = table.findall("./w:tr", NS)
            for row_index, values in enumerate(rows, start=1):
                if row_index >= len(xml_rows):
                    break
                cells = xml_rows[row_index].findall("./w:tc", NS)
                if len(cells) == 1:
                    set_cell(cells[0], "\n".join(values))
                    continue
                for cell, value in zip(cells, values):
                    set_cell(cell, value)

        set_table_rows(1, [
            ["F01", "网页单词浮窗", "浏览网页时在右下角显示当前学习词的单词、音标、词性、释义和例句，可拖动、隐藏和自动切换。", "当前网页 / 浮窗操作", "单词卡片与学习结果"],
            ["F02", "学习记录与测验", "提供认识/再学操作和四选一测试，记录每日学习量、答题结果和掌握状态。", "按钮操作 / 选择答案", "学习进度、分数"],
            ["F03", "错题集与每日复习", "答错的单词自动收集，显示错题次数、最近错误时间和下次复习时间，并按间隔复习安排每日任务。", "错题记录 / 复习答案", "到期复习列表"],
            ["F04", "多词库管理", "支持 CET4、CET6 等内置词库，支持给 CSV/JSON 导入词库自定义名称、导入导出错题集，并可同时选择多个词库学习。", "词库文件 / 多选设置", "当前合并词库"],
            ["F05", "名言提醒与复习调试", "切换网页时弹出中英名言；复习调试台可以推进插件内部日期，验证遗忘曲线并在结束后重置。", "页面切换 / 调试操作", "名言弹窗、模拟复习结果"],
        ])

        set_table_rows(2, [
            ["性能", "主要数据来自本地，网页浮窗初始化和换词应保持轻量；常规按钮操作在 1 秒内给出反馈。"],
            ["易用性", "核心流程尽量在少量点击内完成；提供“打开学习页”、清晰的状态提示和 Alt+Shift+W 浮窗快捷键。"],
            ["兼容性", "面向 Windows 10/11 上的 Microsoft Edge 和 Chrome，遵循 Manifest V3 扩展规范。"],
            ["安全性与隐私", "不要求账号，不向服务器上传学习记录；学习进度和自定义词库保存在 chrome.storage.local，导入只读取用户主动选择的本地文件。"],
        ])

        set_table_rows(3, [
            ["manifest.json", "声明扩展名称、版本、权限、脚本和页面入口。", "扩展配置"],
            ["content.js / content.css", "注入网页浮窗、单词卡片、名言提醒和页面交互。", "initPanel()、showQuote()"],
            ["popup.html / popup.js / popup.css", "实现工具栏弹窗中的快速学习、测验、设置和词库选择。", "loadState()、renderQuiz()"],
            ["learn.html / learn.js / learn.css", "实现完整学习页、统计、错题集、每日复习、导入导出和调试台。", "mark()、recordMistake()、reviewPool()"],
            ["ww-common.js", "统一状态默认值、迁移、词库合并、学习记录和间隔时间计算。", "WW.studyNow()、WW.due()、WW.selectedWords()"],
            ["background.js", "处理快捷键、网页切换后的后台消息和扩展后台事件。", "commands、runtime.onMessage"],
            ["words.js / wordbank/*.csv / build_wordbank.py", "保存和维护内置词库；构建脚本把 CSV 转为运行时词库。", "build_wordbank.py"],
        ])

        set_table_rows(4, [
            ["wwState.learned", "wordKey、level、dueAt、seen", "对象", "每个词的学习等级、下次学习时间和是否见过。"],
            ["wwState.mistakes", "wordKey、count、lastAt、nextReviewAt", "对象", "错题次数、最近错误时间和下次复习时间。"],
            ["wwState.customBanks", "id、name、words[]", "数组", "用户导入的多个命名词库，words 中保存词条信息。"],
            ["wwState.selectedBanks", "bankId[]", "字符串数组", "当前同时参与学习、测试和浮窗取词的词库。"],
            ["wwState.daily / 调试字段", "日期统计、debugDayOffset、debugSnapshot", "对象 / 数字", "保存每日学习量，以及遗忘曲线演示的内部日期和快照。"],
        ])

        set_table_rows(5, [
            ["网页单词浮窗", "单词卡片、释义、例句、“认识/再学”、隐藏和拖动", "位于网页右下角，适合边浏览边学习，不遮挡主要内容。"],
            ["浏览器弹窗", "快速单词卡、四选一测试、设置和词库多选", "点击工具栏图标打开，适合快速查看和修改设置。"],
            ["独立学习页", "统计、每日复习、错题集、导入导出、复习调试台", "承载完整管理功能，方便集中学习和检查数据。"],
        ])

        set_table_rows(6, [
            ["1", "跨页面共享学习状态", "content script、popup 和 learn 页面不能各自保存一份数据；通过 ww-common.js 统一读写 wwState，并在状态变化后刷新界面。"],
            ["2", "多词库和同形词处理", "每个导入词库保存独立 id 和名称，当前词用 bankId::word 作为唯一键，避免合并时覆盖记录。"],
            ["3", "长时间复习难以现场验证", "使用 debugDayOffset 推进插件内部日期，并保存 debugSnapshot；测试后可恢复，不改动电脑系统时间。"],
        ])

        set_table_rows(7, [
            ["操作系统", "Windows 10/11"],
            ["运行时", "Microsoft Edge 或 Chrome（支持 Manifest V3）"],
            ["开发工具", "Visual Studio Code；浏览器开发者工具"],
            ["可选构建环境", "Python 3.10+，仅在修改 CSV 后重新生成 words.js 时需要；运行插件不需要 Python、npm 或数据库。"],
        ])

        modified = ET.tostring(document, encoding="utf-8", xml_declaration=True)
        with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as target:
            for info in source.infolist():
                if info.filename == "word/document.xml":
                    target.writestr(info, modified)
                else:
                    target.writestr(info, source.read(info.filename))

    print(f"saved: {OUTPUT}")


if __name__ == "__main__":
    main()
