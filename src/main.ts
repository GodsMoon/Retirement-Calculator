import './style.css'
import { 
  computeRetirementProjection, 
  runMonteCarloSimulation,
  formatCurrency
} from './finance'
import type { 
  RetirementInputs,
  MonthlyProjection 
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
          <input id="annualReturn" type="number" step="0.1" min="0" max="20" value="10.4" />
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
      <canvas id="projectionChart" width="800" height="400"></canvas>
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

function abbreviateNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num.toString()
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

function drawChart(
  projections: MonthlyProjection[], 
  monteCarloResults?: {
    month: number
    age: number
    p10: number
    p50: number
    p90: number
  }[]
): void {
  const canvas = getElementByIdOrThrow<HTMLCanvasElement>('projectionChart')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (projections.length === 0) return

  // Find min/max values for scaling (include Monte Carlo results if available)
  let values = projections.map(p => p.balance)
  if (monteCarloResults) {
    const mcValues = monteCarloResults.flatMap(mc => [mc.p10, mc.p50, mc.p90])
    values = [...values, ...mcValues]
  }
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue

  // Chart dimensions and margins
  const margin = Math.max(80, Math.max(
    ctx.measureText('$1.2B').width + 20, // Ensure space for largest possible label
    ctx.measureText('Age 100').width + 20  // Ensure space for X-axis labels
  ))
  const chartWidth = canvas.width - margin * 2
  const chartHeight = canvas.height - margin * 2

  // Draw background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'
  ctx.fillRect(margin, margin, chartWidth, chartHeight)

  // Draw grid lines with pleasant colors
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 10; i++) {
    const y = margin + (i / 10) * chartHeight
    ctx.beginPath()
    ctx.moveTo(margin, y)
    ctx.lineTo(canvas.width - margin, y)
    ctx.stroke()
  }

  // Draw axes with better colors
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(margin, margin)
  ctx.lineTo(margin, canvas.height - margin)
  ctx.lineTo(canvas.width - margin, canvas.height - margin)
  ctx.stroke()

  // Draw Monte Carlo percentile lines if available
  if (monteCarloResults && monteCarloResults.length > 0) {
    // Draw P90 line (blue) - conservative scenario
    ctx.strokeStyle = '#3b82f6' // Blue
    ctx.lineWidth = 2
    ctx.beginPath()
    monteCarloResults.forEach((mc, index) => {
      const x = margin + (index / (monteCarloResults.length - 1)) * chartWidth
      const y = canvas.height - margin - ((mc.p90 - minValue) / range) * chartHeight
      
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // Draw P50 line (green) - median scenario
    ctx.strokeStyle = '#10b981' // Green
    ctx.lineWidth = 2
    ctx.beginPath()
    monteCarloResults.forEach((mc, index) => {
      const x = margin + (index / (monteCarloResults.length - 1)) * chartWidth
      const y = canvas.height - margin - ((mc.p50 - minValue) / range) * chartHeight
      
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // Draw P10 line (red) - optimistic scenario
    ctx.strokeStyle = '#ef4444' // Red
    ctx.lineWidth = 2
    ctx.beginPath()
    monteCarloResults.forEach((mc, index) => {
      const x = margin + (index / (monteCarloResults.length - 1)) * chartWidth
      const y = canvas.height - margin - ((mc.p10 - minValue) / range) * chartHeight
      
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()
  }



  // Draw retirement line with better styling
  const retirementIndex = projections.findIndex(p => p.isRetirement)
  if (retirementIndex > 0) {
    const x = margin + (retirementIndex / (projections.length - 1)) * chartWidth
    ctx.strokeStyle = '#ef4444' // Red
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.moveTo(x, margin)
    ctx.lineTo(x, canvas.height - margin)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Add labels with better styling
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  
  // Draw Y-axis labels
  const yStep = chartHeight / 5
  for (let i = 0; i <= 5; i++) {
    const y = canvas.height - margin - i * yStep
    const value = minValue + (i / 5) * range
    const roundedValue = Math.round(value / 10000) * 10000
    const label = '$' + abbreviateNumber(roundedValue)
    
    ctx.fillStyle = '#666'
    ctx.font = '12px Arial'
    ctx.textAlign = 'right'
    ctx.fillText(label, margin - 10, y + 4) // Position labels within the left margin
    
    // Draw horizontal grid lines
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, y)
    ctx.lineTo(canvas.width - margin, y)
    ctx.stroke()
  }
  
  // X-axis labels showing age
  const startAge = projections[0]?.age || 0
  const endAge = projections[projections.length - 1]?.age || 0
  const ageRange = endAge - startAge
  
  for (let i = 0; i <= 8; i++) {
    const age = startAge + (i / 8) * ageRange
    const x = margin + (i / 8) * chartWidth
    ctx.fillText(Math.round(age).toString(), x, canvas.height - margin / 2)
  }

  // Add chart title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = 'bold 16px Arial'
  ctx.textAlign = 'center'
      ctx.fillText('Average Balance Over Time', canvas.width / 2, margin / 2)

  // Add legend to the right side of the chart
  const legendStartX = canvas.width - margin - 120
  const legendY = margin + 20
  ctx.font = '12px Arial'
  ctx.textAlign = 'left'
  const legendSpacing = 25
  
  // Monte Carlo legends if available
  if (monteCarloResults && monteCarloResults.length > 0) {
    // P90 legend (blue)
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(legendStartX, legendY)
    ctx.lineTo(legendStartX + 30, legendY)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText('P90 (Conservative)', legendStartX + 40, legendY + 4)
    
    // P50 legend (green) - renamed to Average Balance
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(legendStartX, legendY - legendSpacing)
    ctx.lineTo(legendStartX + 30, legendY - legendSpacing)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText('Average Balance', legendStartX + 40, legendY - legendSpacing + 4)
    
    // P10 legend (red)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(legendStartX, legendY - legendSpacing * 2)
    ctx.lineTo(legendStartX + 30, legendY - legendSpacing * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText('P10 (Optimistic)', legendStartX + 40, legendY - legendSpacing * 2 + 4)
    
    // Retirement line legend
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.moveTo(legendStartX, legendY - legendSpacing * 3)
    ctx.lineTo(legendStartX + 30, legendY - legendSpacing * 3)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText('Retirement Start', legendStartX + 40, legendY - legendSpacing * 3 + 4)
  } else {
    // Retirement line legend (original position)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.moveTo(legendStartX, legendY)
    ctx.lineTo(legendStartX + 30, legendY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText('Retirement Start', legendStartX + 40, legendY + 4)
  }

  // Add X-axis label (removed "Years")
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('Age', canvas.width / 2, canvas.height - 10)
}

// Add hover functionality to show values
function setupChartHover(
  projections: MonthlyProjection[],
  monteCarloResults?: {
    month: number
    age: number
    p10: number
    p50: number
    p90: number
  }[]
): void {
  const canvas = getElementByIdOrThrow<HTMLCanvasElement>('projectionChart')
  
  // Remove any existing tooltip
  const existingTooltip = document.getElementById('chartTooltip')
  if (existingTooltip) {
    existingTooltip.remove()
  }
  
  // Create new tooltip
  const tooltip = document.createElement('div')
  tooltip.id = 'chartTooltip'
  tooltip.style.cssText = `
    position: fixed;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    display: none;
    white-space: nowrap;
    font-family: Arial, sans-serif;
  `
  document.body.appendChild(tooltip)
  
  // Chart dimensions for coordinate conversion
  const margin = 80
  const chartWidth = canvas.width - margin * 2
  
  // Get data range for Y-axis scaling (not used in hover, but kept for potential future use)
  let values = projections.map(p => p.balance)
  if (monteCarloResults) {
    const mcValues = monteCarloResults.flatMap(mc => [mc.p10, mc.p50, mc.p90])
    values = [...values, ...mcValues]
  }
  
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // Check if mouse is within chart bounds
    if (mouseX >= margin && mouseX <= canvas.width - margin && 
        mouseY >= margin && mouseY <= canvas.height - margin) {
      
      // Convert mouse X position to projection index
      const chartX = (mouseX - margin) / chartWidth
      const projectionIndex = Math.round(chartX * (projections.length - 1))
      const projection = projections[Math.max(0, Math.min(projectionIndex, projections.length - 1))]
      
      if (projection) {
        let tooltipContent = `
          <strong>Age: ${Math.round(projection.age)}</strong><br>
          <strong>Balance: $${abbreviateNumber(projection.balance)}</strong><br>
          <em>${projection.isRetirement ? 'Retirement' : 'Accumulation'}</em>
        `
        
        // Add Monte Carlo percentile information if available
        if (monteCarloResults && monteCarloResults[projectionIndex]) {
          const mc = monteCarloResults[projectionIndex]
          tooltipContent += `<br><br><strong>Monte Carlo Scenarios:</strong><br>`
          tooltipContent += `<span style="color: #3b82f6;">P90: $${abbreviateNumber(mc.p90)}</span><br>`
          tooltipContent += `<span style="color: #10b981;">Average Balance: $${abbreviateNumber(mc.p50)}</span><br>`
          tooltipContent += `<span style="color: #ef4444;">P10: $${abbreviateNumber(mc.p10)}</span>`
        }
        
        tooltip.innerHTML = tooltipContent
        
        tooltip.style.display = 'block'
        tooltip.style.left = (e.clientX + 10) + 'px'
        tooltip.style.top = (e.clientY - 10) + 'px'
      }
    } else {
      tooltip.style.display = 'none'
    }
  })
  
  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none'
  })
}

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
  
  // Draw chart with Monte Carlo results
  drawChart(projection.monthlyProjections, simulationResults.monthlyPercentiles)
  setupChartHover(projection.monthlyProjections, simulationResults.monthlyPercentiles)
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
