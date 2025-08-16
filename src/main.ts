import React from 'react'
import ReactDOM from 'react-dom/client'
import Chart from './Chart' // Import the new Chart component
import './style.css'
import {
  computeRetirementProjection,
  runMonteCarloSimulation,
  formatCurrency
} from './finance'
import type {
  RetirementInputs
} from './finance'

function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element: ${id}`)
  return element as T
}

const appRoot = document.querySelector<HTMLDivElement>('#app')!
appRoot.innerHTML = `
  <div class="container">
    <h1>Retirement Calculator</h1>
    <div class="profiles">
      <div class="profile-buttons">
        <button type="button" id="profile1" class="profile-button active" title="Baseline Aggressive">Baseline</button>
        <button type="button" id="profile2" class="profile-button" title="Balanced Growth">Balanced</button>
        <button type="button" id="profile3" class="profile-button" title="Starter Conservative">Starter</button>
        <button type="button" id="profile4" class="profile-button" title="Comfortable Moderate">Comfort</button>
        <button type="button" id="profile5" class="profile-button" title="Custom profile (Ctrl+5)">Custom</button>
      </div>
      <button type="button" id="saveCustomProfile" class="save-profile-button" title="Save current inputs to Custom">Save Custom</button>
    </div>
    
    <form id="inputs" class="grid">
      <label>
        <span>Current Age</span>
        <input id="currentAge" type="number" min="18" max="100" step="1" value="42" />
      </label>
      
      <label>
        <span>Retirement Age Target</span>
        <input id="retirementAge" type="number" min="40" max="100" step="1" value="65" />
      </label>
      
      <label>
        <span>Lifespan Assumption (years)</span>
        <input id="lifespan" type="number" min="60" max="120" step="1" value="90" />
      </label>
      
      <label>
        <span>Current Savings Balance</span>
        <input id="currentSavings" type="text" value="$300,000" />
      </label>
      
      <label>
        <span>Annual Contributions</span>
        <input id="annualContributions" type="text" value="$12,000" />
      </label>
      
      <label>
        <span>Annual Return Assumption (%)</span>
        <div class="input-with-buttons">
          <input id="annualReturn" type="number" step="0.1" min="0" max="100" value="10.4" />
          <div class="button-group">
            <button type="button" id="sp500Button" class="historical-button">S&P 500 (10.4%)</button>
            <button type="button" id="nasdaq100Button" class="historical-button">NASDAQ-100 (16%)</button>
          </div>
        </div>
      </label>

      
      
      <label>
        <span>Annual Inflation Assumption (%)</span>
        <input id="annualInflation" type="number" step="0.1" min="0" max="10" value="2.5" />
      </label>
      
      <label>
        <span>Desired Annual Retirement Spending (today's dollars)</span>
        <input id="retirementSpending" type="text" value="$150,000" />
      </label>
      
      <label class="checkbox-label">
        <input id="flexibleSpending" type="checkbox" />
        <span>Enable flexible spending (reduce spending by 25% during market drawdowns)</span>
      </label>
    </form>
    
    <div class="results">
      <div class="success-check">
        <h3>Success Probability</h3>
        <div class="success-bar">
          <div class="success-fill" id="successFill"></div>
        </div>
        <div class="success-text" id="successText">Calculating...</div>
      </div>
      
      <div class="key-metrics">
        <div class="metric">
          <span class="label">Nest Egg at Retirement</span>
          <span id="nestEgg" class="value">0</span>
        </div>
        <div class="metric">
          <span class="label">Monthly Withdrawal (today's dollars)</span>
          <span id="monthlyWithdrawal" class="value">0</span>
        </div>
        <div class="metric">
          <span class="label">Years of Retirement</span>
          <span id="retirementYears" class="value">0</span>
        </div>
        <div class="metric">
          <span class="label">Age at 4% Safe Withdrawal</span>
          <span id="ageAt4Percent" class="value">0</span>
        </div>
      </div>
    </div>
    
    <div class="chart-container">
      <h3>Monthly Accumulation Projections</h3>
      <div id="chartRoot"></div>
    </div>
    
    <!-- Monte Carlo Results Table -->
    <div id="monteCarloTable" class="results-table">
      <h3>Monte Carlo Simulation Results by Age</h3>
      <table>
        <thead>
          <tr>
            <th>Age</th>
            <th>Very Conservative (P5)</th>
            <th>Conservative (P10)</th>
            <th>Average Balance (P50)</th>
            <th>Optimistic (P90)</th>
            <th>Very Optimistic (P95)</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <!-- Table rows will be populated by JavaScript -->
        </tbody>
      </table>
  </div>
  </div>
  <footer class="site-footer">
    Created by David at 
    <a href="https://github.com/GodsMoon/Retirement-Calculator" target="_blank" rel="noopener noreferrer">
      github.com/GodsMoon/Retirement-Calculator
    </a>
  </footer>
`

function readNumber(id: string): number {
  const element = getElementByIdOrThrow<HTMLInputElement>(id)
  const value = element.value.replace(/[$,]/g, '')
  return parseFloat(value) || 0
}

function readCheckbox(id: string): boolean {
  const element = getElementByIdOrThrow<HTMLInputElement>(id)
  return element.checked
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value))
}

// Profiles
type ProfileData = { savings: number; returnAssumption: number; spending: number }
type CustomProfileData = {
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
const CUSTOM_PROFILE_KEY = 'rc_custom_profile_v1'

const predefinedProfiles: Record<number, { name: string; data: ProfileData }> = {
  1: { name: 'Baseline', data: { savings: 300000, returnAssumption: 10.4, spending: 150000 } },
  2: { name: 'Balanced', data: { savings: 500000, returnAssumption: 8, spending: 100000 } },
  3: { name: 'Starter', data: { savings: 200000, returnAssumption: 7, spending: 80000 } },
  4: { name: 'Comfort', data: { savings: 400000, returnAssumption: 9, spending: 120000 } }
}

function setCurrencyInput(id: string, amount: number): void {
  const input = getElementByIdOrThrow<HTMLInputElement>(id)
  input.value = '$' + formatNumber(amount)
}

function captureCurrentAsCustom(): CustomProfileData {
  return {
    currentAge: readNumber('currentAge'),
    retirementAge: readNumber('retirementAge'),
    lifespan: readNumber('lifespan'),
    currentSavings: readNumber('currentSavings'),
    annualContributions: readNumber('annualContributions'),
    annualReturn: readNumber('annualReturn'),
    annualInflation: readNumber('annualInflation'),
    retirementSpending: readNumber('retirementSpending'),
    flexibleSpending: readCheckbox('flexibleSpending')
  }
}

function ensureCustomProfile(): CustomProfileData {
  try {
    const stored = localStorage.getItem(CUSTOM_PROFILE_KEY)
    if (stored) return JSON.parse(stored) as CustomProfileData
  } catch { /* ignore parse errors */ }
  const fromDefaults = captureCurrentAsCustom()
  try { localStorage.setItem(CUSTOM_PROFILE_KEY, JSON.stringify(fromDefaults)) } catch { /* ignore */ }
  return fromDefaults
}

function applyProfileByIndex(index: number): void {
  let profile: ProfileData | null = null
  if (index >= 1 && index <= 4) {
    profile = predefinedProfiles[index as 1 | 2 | 3 | 4].data
  } else if (index === 5) {
    try {
      const stored = localStorage.getItem(CUSTOM_PROFILE_KEY)
      const custom = stored ? JSON.parse(stored) as CustomProfileData : ensureCustomProfile()
      if (custom) {
        // Numbers
        getElementByIdOrThrow<HTMLInputElement>('currentAge').value = String(custom.currentAge)
        getElementByIdOrThrow<HTMLInputElement>('retirementAge').value = String(custom.retirementAge)
        getElementByIdOrThrow<HTMLInputElement>('lifespan').value = String(custom.lifespan)
        getElementByIdOrThrow<HTMLInputElement>('annualReturn').value = String(custom.annualReturn)
        getElementByIdOrThrow<HTMLInputElement>('annualInflation').value = String(custom.annualInflation)
        // Currency
        setCurrencyInput('currentSavings', custom.currentSavings)
        setCurrencyInput('annualContributions', custom.annualContributions)
        setCurrencyInput('retirementSpending', custom.retirementSpending)
        // Checkbox
        getElementByIdOrThrow<HTMLInputElement>('flexibleSpending').checked = !!custom.flexibleSpending

        updateActiveProfileButton(index)
        recalc()
        return
      }
      profile = null
    } catch {
      profile = null
    }
  }

  if (profile) {
    setCurrencyInput('currentSavings', profile.savings)
    getElementByIdOrThrow<HTMLInputElement>('annualReturn').value = String(profile.returnAssumption)
    setCurrencyInput('retirementSpending', profile.spending)
    updateActiveProfileButton(index)
    recalc()
  } else if (index === 5) {
    // No custom saved yet, mark active but keep current values
    updateActiveProfileButton(index)
  }
}

function updateActiveProfileButton(index: number): void {
  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(`profile${i}`)
    if (btn) {
      if (i === index) btn.classList.add('active')
      else btn.classList.remove('active')
    }
  }
}

// Currency mask function for input fields
function setupCurrencyMask(inputId: string): void {
  const input = getElementByIdOrThrow<HTMLInputElement>(inputId)
  
  input.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement
    let value = target.value.replace(/[^\d]/g, '') // Remove non-digits
    
    if (value === '') {
      target.value = ''
      return
    }
    
    // Convert to number and format
    const numValue = parseInt(value, 10)
    if (!isNaN(numValue)) {
      target.value = '$' + formatNumber(numValue)
    }
  })
  
  // Handle focus - show raw number for editing
  input.addEventListener('focus', (e) => {
    const target = e.target as HTMLInputElement
    const rawValue = target.value.replace(/[^\d]/g, '')
    if (rawValue) {
      target.value = rawValue
    }
  })
  
  // Handle blur - format as currency
  input.addEventListener('blur', (e) => {
    const target = e.target as HTMLInputElement
    const rawValue = target.value.replace(/[^\d]/g, '')
    if (rawValue) {
      const numValue = parseInt(rawValue, 10)
      if (!isNaN(numValue)) {
        target.value = '$' + formatNumber(numValue)
      }
    }
  })
}

// Create a root for the React chart component
const chartRoot = ReactDOM.createRoot(getElementByIdOrThrow('chartRoot'))

function populateMonteCarloTable(monthlyPercentiles: any[]) {
  const tableBody = document.getElementById('tableBody')
  if (!tableBody) return
  
  // Clear existing rows
  tableBody.innerHTML = ''
  
  // Get retirement spending for 4% rule calculation
  const retirementSpending = readNumber('retirementSpending')
  const targetBalance = retirementSpending * 25 // 4% rule: 25x annual spending
  
  // Track when each scenario first reaches 4% safe withdrawal
  let firstReachedP5 = -1
  let firstReachedP10 = -1
  let firstReachedP50 = -1
  let firstReachedP90 = -1
  let firstReachedP95 = -1
  
  // Find first occurrence for each scenario
  monthlyPercentiles.forEach((monthData, monthIndex) => {
    if (firstReachedP5 === -1 && monthData.p5 >= targetBalance) {
      firstReachedP5 = monthIndex
    }
    if (firstReachedP10 === -1 && monthData.p10 >= targetBalance) {
      firstReachedP10 = monthIndex
    }
    if (firstReachedP50 === -1 && monthData.p50 >= targetBalance) {
      firstReachedP50 = monthIndex
    }
    if (firstReachedP90 === -1 && monthData.p90 >= targetBalance) {
      firstReachedP90 = monthIndex
    }
    if (firstReachedP95 === -1 && monthData.p95 >= targetBalance) {
      firstReachedP95 = monthIndex
    }
  })
  
  // Group data by year (age) and show one row per year
  const yearlyData = new Map()
  
  monthlyPercentiles.forEach(monthData => {
    const year = Math.floor(monthData.age)
    if (!yearlyData.has(year)) {
      yearlyData.set(year, {
        age: year,
        p5: monthData.p5, // Very Conservative (P5)
        p10: monthData.p10, // Conservative (P10)
        p50: monthData.p50, // Average Balance (P50)
        p90: monthData.p90, // Optimistic (P90)
        p95: monthData.p95 // Very Optimistic (P95)
      })
    }
  })
  
  // Sort by age and create table rows
  const sortedYears = Array.from(yearlyData.values()).sort((a, b) => a.age - b.age)
  
  // Helper function to check if a year should be highlighted for a given percentile
  const shouldHighlight = (year: number, firstReachedMonthIndex: number) => {
    if (firstReachedMonthIndex === -1) return false
    
    // Get the age at the month when target was first reached
    const targetReachedAge = monthlyPercentiles[firstReachedMonthIndex]?.age
    if (targetReachedAge === undefined) return false
    
    // Get the year (floor of age) when target was first reached
    const targetReachedYear = Math.floor(targetReachedAge)
    
    // Highlight the year AFTER the target was first reached (shift by +1 year)
    return year === targetReachedYear + 1
  }
  
  sortedYears.forEach(yearData => {
    const row = document.createElement('tr')
    
    // Create cells with highlighting for 4% safe withdrawal
    const p5Cell = `<td class="${shouldHighlight(yearData.age, firstReachedP5) ? 'highlight-4percent' : ''}">${formatCurrency(yearData.p5)}</td>`
    const p10Cell = `<td class="${shouldHighlight(yearData.age, firstReachedP10) ? 'highlight-4percent' : ''}">${formatCurrency(yearData.p10)}</td>`
    const p50Cell = `<td class="${shouldHighlight(yearData.age, firstReachedP50) ? 'highlight-4percent' : ''}">${formatCurrency(yearData.p50)}</td>`
    const p90Cell = `<td class="${shouldHighlight(yearData.age, firstReachedP90) ? 'highlight-4percent' : ''}">${formatCurrency(yearData.p90)}</td>`
    const p95Cell = `<td class="${shouldHighlight(yearData.age, firstReachedP95) ? 'highlight-4percent' : ''}">${formatCurrency(yearData.p95)}</td>`
    
    row.innerHTML = `
      <td>${yearData.age}</td>
      ${p5Cell}
      ${p10Cell}
      ${p50Cell}
      ${p90Cell}
      ${p95Cell}
    `
    tableBody.appendChild(row)
  })
}

function recalc(): void {
  const inputs: RetirementInputs = {
    currentAge: readNumber('currentAge'),
    retirementAge: readNumber('retirementAge'),
    lifespan: readNumber('lifespan'),
    currentSavings: readNumber('currentSavings'),
    annualContributions: readNumber('annualContributions'),
    annualReturn: readNumber('annualReturn'),
    annualInflation: readNumber('annualInflation'),
    retirementSpending: readNumber('retirementSpending'),
    flexibleSpending: readCheckbox('flexibleSpending')
  }

  // Validate inputs
  if (inputs.retirementAge <= inputs.currentAge) {
    getElementByIdOrThrow<HTMLSpanElement>('successText').textContent = 'Retirement age must be after current age'
    return
  }

  if (inputs.lifespan <= inputs.retirementAge) {
    getElementByIdOrThrow<HTMLSpanElement>('successText').textContent = 'Lifespan must be after retirement age'
    return
  }

  // Calculate deterministic projection
  const projection = computeRetirementProjection(inputs)
  
  // Run Monte Carlo simulation
  const simulationResults = runMonteCarloSimulation(inputs, 1000)
  
  // Update success probability
  const successFill = getElementByIdOrThrow<HTMLDivElement>('successFill')
  const successText = getElementByIdOrThrow<HTMLSpanElement>('successText')
  
  successFill.style.width = `${simulationResults.successRate}%`
  successFill.style.backgroundColor = simulationResults.successRate >= 80 ? '#10b981' : simulationResults.successRate >= 60 ? '#f59e0b' : '#ef4444'
  successText.textContent = `${simulationResults.successRate.toFixed(1)}% success probability`
  
  // Update key metrics
  getElementByIdOrThrow<HTMLSpanElement>('nestEgg').textContent = formatNumber(projection.nestEgg)
  getElementByIdOrThrow<HTMLSpanElement>('monthlyWithdrawal').textContent = formatNumber(projection.monthlyWithdrawal)
  getElementByIdOrThrow<HTMLSpanElement>('retirementYears').textContent = (inputs.lifespan - inputs.retirementAge).toString()
  
  // Calculate age at 4% safe withdrawal
  const targetBalance = inputs.retirementSpending * 25 // 4% rule: 25x annual spending
  let ageAt4Percent = inputs.currentAge
  
  // Find the first month where balance reaches target for 4% withdrawal
  for (let i = 0; i < projection.monthlyProjections.length; i++) {
    if (projection.monthlyProjections[i].balance >= targetBalance) {
      ageAt4Percent = Math.round(projection.monthlyProjections[i].age)
      break
    }
  }
  
  // If never reached, show "Never" or a very high age
  if (ageAt4Percent === inputs.currentAge) {
    getElementByIdOrThrow<HTMLSpanElement>('ageAt4Percent').textContent = 'Never'
  } else {
    const targetBalance = inputs.retirementSpending * 25
    getElementByIdOrThrow<HTMLSpanElement>('ageAt4Percent').textContent = `${ageAt4Percent} ($${formatNumber(targetBalance)})`
  }
  
  // Render the chart component with the new data
  chartRoot.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(Chart, {
        projections: projection.monthlyProjections,
        monteCarloResults: simulationResults.monthlyPercentiles,
      })
    )
  );
  populateMonteCarloTable(simulationResults.monthlyPercentiles)
}

const form = getElementByIdOrThrow<HTMLFormElement>('inputs')
form.addEventListener('input', recalc)

// Setup historical return buttons
const sp500Button = getElementByIdOrThrow<HTMLButtonElement>('sp500Button')
const nasdaq100Button = getElementByIdOrThrow<HTMLButtonElement>('nasdaq100Button')

sp500Button.addEventListener('click', () => {
  const annualReturnInput = getElementByIdOrThrow<HTMLInputElement>('annualReturn')
  annualReturnInput.value = '10.4'
  recalc()
})

nasdaq100Button.addEventListener('click', () => {
  const annualReturnInput = getElementByIdOrThrow<HTMLInputElement>('annualReturn')
  annualReturnInput.value = '16'
  recalc()
})

recalc()

// Setup currency masks for dollar inputs
setupCurrencyMask('currentSavings')
setupCurrencyMask('annualContributions')
setupCurrencyMask('retirementSpending')

// Profile button event wiring
for (let i = 1; i <= 5; i++) {
  const btn = getElementByIdOrThrow<HTMLButtonElement>(`profile${i}`)
  btn.addEventListener('click', () => applyProfileByIndex(i))
}

// Save custom profile (save ALL inputs)
const saveCustomBtn = getElementByIdOrThrow<HTMLButtonElement>('saveCustomProfile')
saveCustomBtn.addEventListener('click', () => {
  const custom: CustomProfileData = {
    currentAge: readNumber('currentAge'),
    retirementAge: readNumber('retirementAge'),
    lifespan: readNumber('lifespan'),
    currentSavings: readNumber('currentSavings'),
    annualContributions: readNumber('annualContributions'),
    annualReturn: readNumber('annualReturn'),
    annualInflation: readNumber('annualInflation'),
    retirementSpending: readNumber('retirementSpending'),
    flexibleSpending: readCheckbox('flexibleSpending')
  }
  try {
    localStorage.setItem(CUSTOM_PROFILE_KEY, JSON.stringify(custom))
    updateActiveProfileButton(5)
  } catch {
    // ignore storage errors
  }
})

// Keyboard shortcuts Ctrl/Cmd + 1..5
document.addEventListener('keydown', (e) => {
  const isAccel = e.ctrlKey || e.metaKey
  if (!isAccel) return
  const key = e.key
  if (/^[1-5]$/.test(key)) {
    e.preventDefault()
    applyProfileByIndex(parseInt(key, 10))
  }
})

// Ensure custom profile exists on first load (uses current defaults)
ensureCustomProfile()
