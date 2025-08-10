export type FutureValueInputs = {
  currentSavings: number
  monthlyContribution: number
  annualReturnPercent: number
  yearsToRetirement: number
}

export function computeFutureValue(inputs: FutureValueInputs): number {
  const { currentSavings, monthlyContribution, annualReturnPercent, yearsToRetirement } = inputs

  const months = Math.max(0, Math.floor(yearsToRetirement * 12))
  const monthlyRate = annualReturnPercent / 100 / 12

  if (months === 0) return currentSavings

  if (monthlyRate === 0) {
    return currentSavings + monthlyContribution * months
  }

  const growthFactor = Math.pow(1 + monthlyRate, months)
  const futureValueLump = currentSavings * growthFactor
  const futureValueContrib = monthlyContribution * ((growthFactor - 1) / monthlyRate)

  return futureValueLump + futureValueContrib
}

export function computeAnnuityWithdrawal(
  nestEgg: number,
  annualReturnPercent: number,
  years: number
): { monthly: number; annual: number } {
  const months = Math.max(1, Math.floor(years * 12))
  const monthlyRate = annualReturnPercent / 100 / 12

  if (nestEgg <= 0) return { monthly: 0, annual: 0 }

  if (monthlyRate === 0) {
    const monthly = nestEgg / months
    return { monthly, annual: monthly * 12 }
  }

  const numerator = nestEgg * monthlyRate
  const denominator = 1 - Math.pow(1 + monthlyRate, -months)
  const monthly = denominator === 0 ? 0 : numerator / denominator
  return { monthly, annual: monthly * 12 }
}

export function adjustToToday(nominal: number, annualInflationPercent: number, years: number): number {
  const factor = Math.pow(1 + annualInflationPercent / 100, Math.max(0, years))
  if (factor === 0) return nominal
  return nominal / factor
}

export function formatCurrency(amount: number, currency: string = 'USD', locale: string = undefined as unknown as string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      isFinite(amount) ? amount : 0
    )
  } catch {
    return `$${Math.round(isFinite(amount) ? amount : 0).toLocaleString()}`
  }
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}


