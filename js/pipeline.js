export class PillPipeline {
  constructor(steps = [], callbacks = {}) {
    this.steps = steps;
    this.callbacks = callbacks;
  }

  async run(context) {
    const results = {};
    for (const step of this.steps) {
      this.callbacks.onStepStart?.(step, context);
      const startedAt = performance.now();
      try {
        const output = await step.run({ context, results });
        const duration = performance.now() - startedAt;
        results[step.id] = { output, duration };
        this.callbacks.onStepComplete?.(step, output, duration);
      } catch (error) {
        const duration = performance.now() - startedAt;
        this.callbacks.onStepError?.(step, error, duration);
        throw { step, error };
      }
    }
    return results;
  }
}

export function createDefaultSteps(impl) {
  return [
    {
      id: "preprocess",
      title: "전처리",
      icon: "🧼",
      description: "배경제거 및 해상도 정규화",
      run: impl.preprocess,
    },
    {
      id: "quality",
      title: "품질 추정",
      icon: "📊",
      description: "초점/노출/분할선 분석",
      run: impl.estimateQuality,
    },
    {
      id: "ocr",
      title: "각인 OCR",
      icon: "🔠",
      description: "Tesseract.js 기반 텍스트 인식",
      run: impl.runOcr,
    },
    {
      id: "features",
      title: "특징 융합",
      icon: "🧩",
      description: "색상/형상/각인 통합",
      run: impl.fuseFeatures,
    },
    {
      id: "database",
      title: "로컬 DB 검색",
      icon: "💽",
      description: "다운로드된 참조셋에서 후보 조회",
      run: impl.queryDatabase,
    },
    {
      id: "rerank",
      title: "후보 재랭킹",
      icon: "⚖️",
      description: "각인 유사도 + 메타 가중",
      run: impl.rerank,
    },
  ];
}
