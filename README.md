# XAI-ASRITS

**Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System**
可解釋人工智慧・自適應空間推理智慧教學系統

本專案為完整可執行的 React + TypeScript + Vite 前端專案，實作「系統需求書」「研究架構」所定義之六大核心模組，並修補原始 Demo 程式碼中缺漏的 **AI 推理鏈**（Behavior Pattern Recognition、Cognitive Diagnosis Engine、公式化 Player Model 更新、Adaptive Decision Table、AI Tutor 對話流程）。

## 快速開始

```bash
npm install
npm run dev       # 開發模式 http://localhost:5173
npm run build     # 打包（含 tsc 型別檢查）
npm run preview   # 預覽打包結果
```

已通過 `tsc --noEmit` 型別檢查與 `vite build` 完整打包驗證。

## 目錄結構

```
src/
  types.ts                         # 全域型別定義（事件、特徵、模式、診斷、模型、決策、XAI）
  data/levels.ts                   # 關卡資料池
  engines/                         # AI 推理鏈（本次改版核心）
    behaviorFeatureExtractor.ts    # Event → Feature
    behaviorPatternRecognizer.ts   # Feature → Behavior Pattern（新增）
    cognitiveDiagnosisEngine.ts    # Pattern → Cognitive Diagnosis（新增，規則庫）
    playerModelEngine.ts           # Diagnosis+Feature → Player Model（新增，公式化＋證據追蹤）
    adaptiveDecisionEngine.ts      # Player Model → Adaptive Decision（新增，Decision Table）
    xaiEngine.ts                   # Diagnosis+Decision → XAI 八要素回饋
    aiTutorEngine.ts               # Diagnosis→Reflection→Question→Hint 對話流程（新增）
    learningReportEngine.ts        # 學習報告產生
    researchModule.ts              # 前後測題庫、分組、CSV/JSON 匯出
  components/
    Scene3D.tsx                    # 純 SVG 3D 等角積木渲染器
    AssessmentModal.tsx            # 前測/後測元件
    TutorPanel.tsx                 # AI Tutor 對話式面板（新增）
  App.tsx                          # 主應用程式，串接完整資料流
```

## 本次修改對照「程式碼還需改進方向.docx」

| 缺口 | 對應解法 |
|---|---|
| 缺少 Behavior Pattern Recognition | 新增 `behaviorPatternRecognizer.ts`，由事件序列 + 特徵推論 8 種行為模式 |
| 缺少 Cognitive Diagnosis Engine | 新增 `cognitiveDiagnosisEngine.ts`，7 條規則庫（IF Pattern THEN Diagnosis） |
| Player Model 無更新依據 | `playerModelEngine.ts` 改為公式化計算，並於教師面板顯示完整證據追蹤表 |
| Adaptive Decision 無 Decision Table | 新增 `adaptiveDecisionEngine.ts`，7 條 IF-THEN 決策規則，UI 顯示命中規則 |
| Learning Analytics 無 Pipeline | 教師面板新增「AI 推理鏈」視覺化區塊，逐站顯示 Event→...→XAI |
| AI 僅有 Hint，非 Tutor | 新增 `TutorPanel.tsx` + `aiTutorEngine.ts`，實作 Diagnosis→Reflection→Question→Hint→NextTask 對話流程 |
| `updatePlayerModel` 未定義（原始程式 bug） | 已修正：所有更新統一由 `runPipeline()` 呼叫引擎鏈完成 |

## 已知限制 / 待辦

- `researchModule.ts` 中的空間能力測驗題目為**示意用 placeholder**，正式研究應改用標準化測驗（如 MRT、PSVT:R）並取得授權。
- 目前僅提供代表性關卡（每能力階段 1-2 關），可依 `data/levels.ts` 之資料結構擴充為完整 100 關。
- 尚未串接後端資料庫；`researchModule.ts` 之匯出功能目前為前端下載 CSV/JSON，正式部署建議串接後端 API 儲存至 Data Layer（見系統需求書之資料庫schema）。
