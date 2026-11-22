// Gemini Developer API Standard 유료 요금. 증빙·정책 로그에 실제로 사용된 모델만 등록한다.
export const GEMINI_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash";

export function tokenRates(model, month) {
  if (model === "gemini-3.8-flash") {
    return month >= "2027-01" ? { input: 1.50, output: 7.50 } : { input: 0.75, output: 3.75 };
  }
  if (model === "gemini-3.5-flash-lite") return { input: 0.30, output: 2.50 };
  return null;
}

export function estimateTokenCost(rows, month) {
  const models = new Map();
  let amount = 0;
  let covered = 0;
  let remainder = 0;
  const rowCosts = rows.map((row) => {
    const rates = tokenRates(row.model, month);
    if (!rates || !row.measured) return null;

    const billableOutput = (row.outputTokens || 0) + (row.thinkingTokens || 0);
    const input = row.inputTokens || 0;
    const subtotal = (input * rates.input + billableOutput * rates.output) / 1_000_000;
    models.set(row.model, rates);
    amount += subtotal;
    covered += row.measured;
    remainder += Math.max(0, row.totalTokens - input - billableOutput);
    return subtotal;
  });
  return { amount: covered ? amount : null, covered, remainder, models, rowCosts };
}
