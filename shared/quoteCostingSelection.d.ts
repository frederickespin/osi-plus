export function eligibleCostingLines<T extends Readonly<{ lineRef?: string; quantity: string; suggestedPrice: string | null }>>(lines: readonly T[]): T[];
