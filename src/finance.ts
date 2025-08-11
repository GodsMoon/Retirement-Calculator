export type RetirementInputs = {
  currentAge: number
  retirementAge: number
  lifespan: number
  currentSavings: number
  annualContributions: number
  annualReturn: number
  annualInflation: number
  retirementSpending: number
  flexibleSpending: boolean
}

export type MonthlyProjection = {
  month: number
  age: number
  balance: number
  isRetirement: boolean
}

export type RetirementProjection = {
  nestEgg: number
  monthlyWithdrawal: number
  monthlyProjections: MonthlyProjection[]
}

export function computeRetirementProjection(inputs: RetirementInputs): RetirementProjection {
  const { 
    currentAge, 
    retirementAge, 
    lifespan, 
    currentSavings, 
    annualContributions, 
    annualReturn, 
    retirementSpending,
    flexibleSpending
  } = inputs

  const totalMonths = (lifespan - currentAge) * 12
  
  const monthlyProjections: MonthlyProjection[] = []
  let currentBalance = currentSavings
  const monthlyContribution = annualContributions / 12
  const monthlyReturn = annualReturn / 100 / 12
  const monthlyInflation = inputs.annualInflation / 100 / 12

  // Calculate accumulation phase
  for (let month = 0; month < totalMonths; month++) {
    const age = currentAge + month / 12
    const isRetirement = age >= retirementAge
    
    if (isRetirement) {
      // Retirement phase - withdraw and adjust for inflation
      const inflationAdjustedSpending = retirementSpending * Math.pow(1 + monthlyInflation, month)
      let monthlyWithdrawal = inflationAdjustedSpending / 12
      
      // Apply flexible spending logic during market drawdowns
      if (flexibleSpending && monthlyReturn < 0) {
        monthlyWithdrawal *= 0.75 // Reduce spending by 25% during negative returns
      }
      
      currentBalance = currentBalance * (1 + monthlyReturn) - monthlyWithdrawal
    } else {
      // Accumulation phase - contribute and grow
      currentBalance = currentBalance * (1 + monthlyReturn) + monthlyContribution
    }
    
    monthlyProjections.push({
      month,
      age,
      balance: Math.max(0, currentBalance),
      isRetirement
    })
  }

  const nestEgg = monthlyProjections.find(p => p.age >= retirementAge)?.balance || 0
  const monthlyWithdrawal = retirementSpending / 12

  return {
    nestEgg,
    monthlyWithdrawal,
    monthlyProjections
  }
}

export function runMonteCarloSimulation(inputs: RetirementInputs, iterations: number): {
  successRate: number
  monthlyPercentiles: {
    month: number
    age: number
    p5: number
    p10: number
    p50: number
    p90: number
    p95: number
  }[]
} {
  const monthlyResults: number[][] = []
  let successfulRuns = 0
  
  // Initialize monthly results array
  const totalMonths = (inputs.lifespan - inputs.currentAge) * 12
  for (let month = 0; month < totalMonths; month++) {
    monthlyResults[month] = []
  }
  
  for (let i = 0; i < iterations; i++) {
    // Add random variation to returns (±5% standard deviation)
    const returnVariation = (Math.random() - 0.5) * 10 // ±5% range
    const adjustedReturn = inputs.annualReturn + returnVariation
    
    // Add random variation to inflation (±1% standard deviation)
    const inflationVariation = (Math.random() - 0.5) * 2 // ±1% range
    const adjustedInflation = inputs.annualInflation + inflationVariation
    
    // Add random variation to lifespan (±5 years)
    const lifespanVariation = (Math.random() - 0.5) * 10 // ±5 years
    const adjustedLifespan = inputs.lifespan + lifespanVariation
    
    const adjustedInputs = {
      ...inputs,
      annualReturn: Math.max(0, adjustedReturn),
      annualInflation: Math.max(0, adjustedInflation),
      lifespan: Math.max(inputs.retirementAge + 10, adjustedLifespan)
    }
    
    const projection = computeRetirementProjection(adjustedInputs)
    
    // Store monthly results
    projection.monthlyProjections.forEach((monthly, monthIndex) => {
      if (monthIndex < totalMonths) {
        monthlyResults[monthIndex].push(monthly.balance)
      }
    })
    
    // Check if retirement was successful (didn't run out of money)
    const lastBalance = projection.monthlyProjections[projection.monthlyProjections.length - 1]?.balance || 0
    if (lastBalance > 0) {
      successfulRuns++
    }
  }
  
  // Calculate percentiles for each month
  const monthlyPercentiles = monthlyResults.map((monthBalances, monthIndex) => {
    const sortedBalances = monthBalances.sort((a, b) => a - b)
    const p5Index = Math.floor(monthBalances.length * 0.05)
    const p10Index = Math.floor(monthBalances.length * 0.1)
    const p50Index = Math.floor(monthBalances.length * 0.5)
    const p90Index = Math.floor(monthBalances.length * 0.9)
    const p95Index = Math.floor(monthBalances.length * 0.95)
    
    const age = inputs.currentAge + monthIndex / 12
    
    return {
      month: monthIndex,
      age,
      p5: sortedBalances[p5Index] || 0,
      p10: sortedBalances[p10Index] || 0,
      p50: sortedBalances[p50Index] || 0,
      p90: sortedBalances[p90Index] || 0,
      p95: sortedBalances[p95Index] || 0
    }
  })
  
  return {
    successRate: (successfulRuns / iterations) * 100,
    monthlyPercentiles
  }
}

// Legacy functions for backward compatibility
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


